import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readBuffer, readText } from "./body.ts";
import { currentUser, isDemo, publicUrl, safeNext } from "./auth.ts";
import { db } from "./db.ts";
import { overLimit } from "./limits.ts";
import { PREMIUM_MONTHS, coveredUntil, recomputePremium } from "./premium.ts";
import { sendMail, textMail } from "./mail.ts";
import { AGB, OPERATOR_LINE, PRICE_NOTE, SITE, WIDERRUF, WIDERRUF_INTRO, plainText } from "../src/terms.ts";

/**
 * Buying premium: the second way next to the purchase contract (server/userCars.ts). The payment page is Stripe's
 * (Checkout, a redirect): no card data and no Stripe script ever touch this app. The Stripe price decides what is sold:
 *
 *   a recurring price (per month or year): a subscription. Every paid invoice keeps premium for the period it paid
 *     for; it renews by itself until the user cancels on Stripe's customer portal ("Abo verwalten").
 *   a one-time price: one payment for a fixed number of months (its metadata "months", default PREMIUM_MONTHS);
 *     nothing renews.
 *
 * Configuration (.env.example): STRIPE_SECRET_KEY, STRIPE_PRICE_ID (its amount and currency are what the app shows)
 * and STRIPE_WEBHOOK_SECRET. Without the first two, or without the tables (db/migrations 014, 015), there is no offer
 * and the app shows the purchase contract as the only way. STRIPE_PRICE_ID_YEARLY adds a second plan next to a
 * subscription with a shorter billing period: the same subscription charged once a year (`plans`); the user picks one
 * in the app, and the account still has one subscription at most.
 *
 *   GET  /api/premium/angebot       the offer (anyone), the account's own payments and its subscription
 *   POST /api/premium/kaufen        { back, lang, months } -> { url }: the Checkout page for this account and plan
 *   POST /api/premium/bestaetigen   { session } -> { status }: back from Checkout, grants at once if it is paid
 *   POST /api/premium/verwalten     { back, lang } -> { url }: Stripe's customer portal (cancel, payment method, invoices)
 *   POST /api/stripe/webhook        Stripe's events (signed): paid, paid later (SEPA), invoice paid, refunded,
 *                                   subscription ended
 *
 * The first payment of a contract is confirmed by mail with the terms and the withdrawal notice in full (confirmOrder:
 * the durable medium of § 312f BGB); the payment page links both. A cancellation without signing in (/kuendigen,
 * server/notices.ts) stops the renewal through stopRenewal. A billing period longer than a month that has already
 * renewed can be cancelled with one month's notice (terms, section 6; § 309 Nr. 9 BGB): stopRenewal then ends the
 * subscription on that day, and the refund for the rest is the operator's.
 *
 * A payment is granted exactly once, whoever reports it first (the return from Checkout or the webhook): the key of
 * premium_payments is the Checkout Session of a one-time payment and the invoice of a subscription. Stored is what the
 * grant needs (account, months, amount, Stripe's ids), never an address or card; those stay with Stripe (DATENSCHUTZ.md).
 */

// STRIPE_API_BASE: only to run the flow against a stand-in for Stripe in a local test
const api = () => process.env.STRIPE_API_BASE?.replace(/\/+$/, "") || "https://api.stripe.com/v1";
/** Marks the Checkout Sessions of this app: the Stripe account may sell other things, and their events arrive here too. */
const PRODUCT = "carbay_premium";
const OFFER_TTL = 10 * 60_000;
/** A webhook older than this is not accepted (Stripe's own default): a captured request cannot be replayed later. */
const WEBHOOK_TOLERANCE_S = 300;

/**
 * The shapes this file reads are those of this API version, whatever the Stripe account's own default is. Events are
 * sent in the account's version, so a webhook only takes the id from an event and reads the object again from here.
 */
const STRIPE_VERSION = "2024-06-20";

/** `months`: what one payment pays for. `recurring`: a subscription that is charged again every `months` months. */
export type Offer = { amount: number; currency: string; months: number; recurring: boolean };
/** The account's subscription: running, cancelled to the end of the paid period, or with a payment that failed. */
export type Subscription = { status: "active" | "ending" | "past_due"; until: string | null };

type Ref = string | { id: string } | null;
const refId = (r: Ref | undefined) => (typeof r === "string" ? r : (r?.id ?? null));

type StripePrice = {
  id: string; active?: boolean; type?: string; unit_amount?: number | null; currency?: string; metadata?: Record<string, string>;
  recurring?: { interval?: string; interval_count?: number; usage_type?: string } | null;
};
type SubscriptionDetails = { subscription?: Ref; metadata?: Record<string, string> | null };
export type Invoice = {
  id: string;
  status?: string | null;
  customer?: Ref;
  subscription?: Ref;
  payment_intent?: Ref;
  amount_paid?: number | null;
  currency?: string | null;
  subscription_details?: SubscriptionDetails | null;
  parent?: { subscription_details?: SubscriptionDetails | null } | null; // the same, as newer API versions have it
  lines?: { data?: { period?: { start?: number; end?: number } | null }[] } | null;
};
export type StripeSubscription = {
  id: string; status?: string; cancel_at_period_end?: boolean; cancel_at?: number | null; ended_at?: number | null; start_date?: number | null;
  current_period_start?: number | null; current_period_end?: number | null;
  items?: { data?: { current_period_start?: number | null; current_period_end?: number | null; quantity?: number | null }[] } | null; // the periods here too, as newer API versions have them
};
export type CheckoutSession = {
  id: string;
  url?: string | null;
  mode?: string;
  status?: string | null;
  payment_status?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: Ref;
  customer?: Ref;
  locale?: string | null;
  /** expanded where this file reads a session: the first invoice of a subscription */
  invoice?: string | Invoice | null;
  metadata?: Record<string, string> | null;
};
type StripeEvent = { type?: string; data?: { object?: Record<string, unknown> } };

const key = () => process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const priceId = () => process.env.STRIPE_PRICE_ID?.trim() ?? "";
const yearlyPriceId = () => process.env.STRIPE_PRICE_ID_YEARLY?.trim() ?? "";
export const paymentsConfigured = () => Boolean(key() && (priceId() || yearlyPriceId()));

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/** Changing requests must come from this site (the webhook is not one of them: it proves itself by its signature). */
function sameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin;
  return !origin || origin.replace(/^https?:\/\//, "") === req.headers.host;
}

export async function stripe<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>): Promise<T> {
  const r = await fetch(api() + path, {
    method,
    headers: { Authorization: `Bearer ${key()}`, "Stripe-Version": STRIPE_VERSION, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`stripe ${r.status} ${path.split("/")[1]}: ${j.error?.message ?? ""}`.slice(0, 300));
  return j;
}

/** What a Stripe price offers, or null when it cannot be sold here (inactive, no fixed amount, billed by week, day or usage). */
export function priceOffer(p: StripePrice): Offer | null {
  if (p.active === false || typeof p.unit_amount !== "number" || p.unit_amount <= 0 || !p.currency) return null;
  const price = { amount: p.unit_amount / 100, currency: p.currency.toUpperCase() };
  if (p.type === "recurring") {
    const every = p.recurring?.interval_count ?? 1;
    const months = p.recurring?.interval === "month" ? every : p.recurring?.interval === "year" ? 12 * every : 0;
    if (!Number.isInteger(months) || months < 1 || months > 120 || (p.recurring?.usage_type ?? "licensed") !== "licensed") return null;
    return { ...price, months, recurring: true };
  }
  if (p.type !== "one_time") return null;
  const m = Number(p.metadata?.months);
  return { ...price, months: Number.isInteger(m) && m >= 1 && m <= 120 ? m : PREMIUM_MONTHS, recurring: false };
}

let schemaOk = false;
/** The table with the columns a grant writes (db/migrations 014 and 015). Without them nothing is sold: a payment could not be granted. */
async function schemaReady() {
  if (schemaOk) return true;
  const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from information_schema.columns
    where table_schema = current_schema() and table_name = 'premium_payments' and column_name in ('customer', 'subscription', 'covers_until')`;
  return (schemaOk = n === 3);
}

/**
 * The plans on sale, the shortest billing period first: what STRIPE_PRICE_ID sells and, next to it, the yearly
 * subscription of STRIPE_PRICE_ID_YEARLY. The yearly price is only taken for what its name says (a subscription
 * charged once a year), and next to another plan only when that is a subscription with a shorter period in the same
 * currency: the choice in the app is between two billing periods of one subscription, nothing else.
 */
export function plans<T extends Offer>(main: T | null, yearly: T | null): T[] {
  const year = yearly?.recurring && yearly.months === 12 ? yearly : null;
  if (!main) return year ? [year] : [];
  return year && main.recurring && main.months < 12 && main.currency === year.currency ? [main, year] : [main];
}

/** An offer with the Stripe price that sells it. */
type Plan = Offer & { price: string };
const offerOf = ({ amount, currency, months, recurring }: Plan): Offer => ({ amount, currency, months, recurring });

let cached: { at: number; plans: Plan[] } | null = null;
/** The plans as Stripe has them, read at most every ten minutes; none without configuration or while Stripe is unreachable. */
async function currentPlans(): Promise<Plan[]> {
  if (!paymentsConfigured()) return [];
  if (cached && Date.now() - cached.at < OFFER_TTL) return cached.plans;
  const soon = () => Date.now() - OFFER_TTL + 60_000; // read again in a minute
  try {
    if (!(await schemaReady())) {
      console.error("premium_payments: Tabelle oder Spalten fehlen (npm run db:migrate:prod, Migrationen 014 und 015). Bis dahin wird nichts verkauft.");
      cached = { at: soon(), plans: [] };
      return [];
    }
    const read = async (id: string, name: string): Promise<Plan | null> => {
      if (!id) return null;
      const offer = priceOffer(await stripe<StripePrice>("GET", `/prices/${encodeURIComponent(id)}`));
      if (!offer) console.error(`${name}: kein aktiver Preis mit festem Betrag (einmalig, pro Monat oder pro Jahr).`);
      return offer && { ...offer, price: id };
    };
    // the yearly plan is an extra: when its price cannot be read, the other one is still sold
    let retry = false;
    const [main, yearly] = await Promise.all([
      read(priceId(), "STRIPE_PRICE_ID"),
      read(yearlyPriceId(), "STRIPE_PRICE_ID_YEARLY").catch((err) => {
        console.error("stripe price (STRIPE_PRICE_ID_YEARLY)", err);
        retry = true;
        return cached?.plans.find((p) => p.price === yearlyPriceId()) ?? null;
      }),
    ]);
    const list = plans(main, yearly);
    if (yearly && !list.includes(yearly))
      console.error("STRIPE_PRICE_ID_YEARLY wird nicht angeboten: Es muss ein Abo-Preis pro Jahr sein, und STRIPE_PRICE_ID (falls gesetzt) ein Abo-Preis mit kürzerem Zeitraum in derselben Währung.");
    cached = { at: retry ? soon() : Date.now(), plans: list };
  } catch (err) {
    console.error("stripe price", err);
    // the last known plans stay for another minute rather than the button flickering away on one failed request
    cached = { at: soon(), plans: cached?.plans ?? [] };
  }
  return cached.plans;
}

/** `back` (a path of this site) with the marks the app reads on the way back; Stripe fills in the session id. */
export function returnUrl(base: string, back: string) {
  const u = new URL(back, base);
  u.searchParams.set("premium", "bezahlt");
  u.searchParams.set("cs", "CSID");
  // set after serialising: the braces of Stripe's placeholder must not be percent-encoded
  return (base + u.pathname + u.search + u.hash).replace("cs=CSID", "cs={CHECKOUT_SESSION_ID}");
}

export type Paid = {
  id: string; userId: string; months: number; amount: number; currency: string; paymentIntent: string | null;
  customer: string | null;
  /** a subscription's invoice: the subscription, and the end of the period the invoice paid for */
  subscription: string | null;
  coversUntil: Date | null;
};

const validMonths = (m: number) => Number.isInteger(m) && m >= 1 && m <= 120;
/** Whole months between the two ends of a billing period (seconds; Stripe bills by calendar month, 28 to 31 days each). */
const monthsBetween = (start: number, end: number) => Math.round((end - start) / (30.4375 * 86_400));
export const subscriptionOf = (inv: Invoice) => refId(inv.subscription) ?? refId(inv.parent?.subscription_details?.subscription);

/**
 * What a paid invoice of a subscription grants to this account, or null when it is not one. `months`: the billing
 * period the subscription was started with; the period the invoice itself names counts where it has one (the plan
 * can change later, on Stripe's customer portal).
 */
export function paidInvoice(inv: Invoice, userId: string, months: number): Paid | null {
  const subscription = subscriptionOf(inv);
  const period = (inv.lines?.data ?? []).map((l) => l.period).reduce<{ start?: number; end?: number } | null>((a, b) => ((b?.end ?? 0) > (a?.end ?? 0) ? (b ?? null) : a), null);
  const end = period?.end ?? 0;
  if (inv.status !== "paid" || !subscription || !end || !userId || !validMonths(months)) return null;
  const billed = period?.start ? monthsBetween(period.start, end) : 0;
  return {
    id: inv.id, userId, months: validMonths(billed) ? billed : months, amount: (inv.amount_paid ?? 0) / 100, currency: (inv.currency ?? "").toUpperCase(),
    paymentIntent: refId(inv.payment_intent), customer: refId(inv.customer), subscription, coversUntil: new Date(end * 1000),
  };
}

/** What a Checkout Session grants, or null when it is not a paid premium purchase of this app. */
export function paidSession(s: CheckoutSession): Paid | null {
  const meta = s.metadata ?? {};
  if ((s.mode !== "payment" && s.mode !== "subscription") || meta.product !== PRODUCT) return null;
  // "no_payment_required": a discount code covered the whole price
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const months = Number(meta.months);
  if (!s.client_reference_id || s.client_reference_id !== meta.user_id || !validMonths(months)) return null;
  // a subscription: its first invoice, the same key the "invoice.paid" event grants under
  if (s.mode === "subscription") return s.invoice && typeof s.invoice === "object" ? paidInvoice(s.invoice, s.client_reference_id, months) : null;
  return {
    id: s.id, userId: s.client_reference_id, months, amount: (s.amount_total ?? 0) / 100, currency: (s.currency ?? "").toUpperCase(),
    paymentIntent: refId(s.payment_intent), customer: refId(s.customer), subscription: null, coversUntil: null,
  };
}

/** A Checkout Session as this file reads it: with the invoice of a subscription inside. */
export const readSession = (id: string) => stripe<CheckoutSession>("GET", `/checkout/sessions/${id}?expand%5B%5D=invoice`);
export const SESSION_ID = /^cs_[A-Za-z0-9_]{8,250}$/;

/** Grants what was paid, once per payment however often it is reported, and confirms a new contract by mail. */
async function grant(p: Paid, english = false): Promise<"granted" | "known" | "no_account"> {
  const result = await grantRow(p);
  if (result === "granted") await confirmOrder(p, english);
  return result;
}

export const every = (months: number, english: boolean) =>
  months === 1 ? (english ? "monthly" : "monatlich") : months === 12 ? (english ? "yearly" : "jährlich") : english ? `every ${months} months` : `alle ${months} Monate`;
/** The first billing period of a subscription longer than a month, as the texts name it ("nach dem ersten Jahr"). */
const firstTerm = (months: number, english: boolean) =>
  months === 12 ? (english ? "the first year" : "dem ersten Jahr") : english ? "the first billing period" : "dem ersten Abrechnungszeitraum";

/**
 * The confirmation of the contract on a durable medium (§ 312f BGB): what was ordered, at what price, how it ends,
 * and the withdrawal notice and the terms in full, since a link alone is not a durable medium. Sent once per
 * contract: for a one-time purchase and for the first invoice of a subscription, not for its renewals. A mail that
 * cannot be sent is logged and does not undo the grant.
 */
async function confirmOrder(p: Paid, english: boolean) {
  try {
    if (p.subscription) {
      const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from premium_payments where subscription = ${p.subscription}`;
      if (n > 1) return; // a renewal: the contract was confirmed with its first invoice
    }
    const [u] = await db()<{ email: string | null; username: string }[]>`select email, username from users where id = ${p.userId}`;
    if (!u?.email) return;
    const i = english ? 1 : 0;
    const t = (de: string, en: string) => (english ? en : de);
    const price = new Intl.NumberFormat(english ? "en-GB" : "de-DE", { style: "currency", currency: p.currency || "EUR" }).format(p.amount);
    const when = new Intl.DateTimeFormat(english ? "en-GB" : "de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date());
    const site = `https://${SITE}`;
    const text = [
      t(`Guten Tag ${u.username},`, `Hello ${u.username},`),
      t("vielen Dank für Ihre Bestellung. Cartag Premium ist für Ihr Konto freigeschaltet. Diese Nachricht bestätigt Ihren Vertrag; bitte bewahren Sie sie auf.", "thank you for your order. Cartag Premium is unlocked for your account. This message confirms your contract; please keep it."),
      [
        `${t("Bestellung", "Order")}: ${p.subscription ? t("Cartag Premium (Abo)", "Cartag Premium (subscription)") : t(`Cartag Premium für ${p.months} Monate (Einmalkauf)`, `Cartag Premium for ${p.months} months (one-time purchase)`)}`,
        `${t("Preis", "Price")}: ${price} ${p.subscription ? every(p.months, english) : t("einmalig", "once")} (${PRICE_NOTE[i]})`,
        `${t("Bestellt am", "Ordered on")}: ${when}`,
        `${t("Konto", "Account")}: ${u.username}`,
        `${t("Vertragspartner", "Contracting party")}: ${OPERATOR_LINE[i]}`,
      ].join("\n"),
      p.subscription
        ? t(
            `Laufzeit und Kündigung: Das Abo wird ${every(p.months, false)} im Voraus abgebucht und verlängert sich jeweils um denselben Zeitraum, bis Sie kündigen. Kündigen können Sie jederzeit zum Ende des bezahlten Zeitraums: im Konto unter „Abo verwalten oder kündigen“ oder ohne Anmeldung unter ${site}/kuendigen.`,
            `Term and cancellation: the subscription is charged ${every(p.months, true)} in advance and renews for the same period each time until you cancel. You may cancel at any time to the end of the paid period: in your account under “Manage or cancel subscription”, or without signing in at ${site}/kuendigen?lang=en.`,
          ) +
          (p.months > 1
            ? t(
                ` Nach ${firstTerm(p.months, false)} können Sie außerdem jederzeit mit einer Frist von einem Monat kündigen (${site}/kuendigen); den für die Zeit nach dem Vertragsende bereits gezahlten Betrag erstatten wir Ihnen dann anteilig.`,
                ` After ${firstTerm(p.months, true)} you may also cancel at any time with one month's notice (${site}/kuendigen?lang=en); we then refund the share already paid for the time after the end of the contract.`,
              )
            : "")
        : t("Laufzeit: Der bezahlte Zeitraum endet von selbst. Es verlängert sich nichts, und Sie müssen nicht kündigen.", "Term: the paid period ends by itself. Nothing renews, and you need not cancel."),
      t(
        `Widerruf: Sie können diesen Vertrag binnen vierzehn Tagen widerrufen, am einfachsten online unter ${site}/widerruf („Vertrag widerrufen“). Die Widerrufsbelehrung und unsere Allgemeinen Geschäftsbedingungen folgen unten im Wortlaut.`,
        `Withdrawal: you may withdraw from this contract within fourteen days, most easily online at ${site}/widerruf?lang=en (“Withdraw from contract”). The withdrawal notice and our terms follow below in full.`,
      ),
      "Cartag",
      "\n" + plainText(t("Widerrufsbelehrung", "Withdrawal notice"), WIDERRUF, english, WIDERRUF_INTRO[i]),
      "\n" + plainText(t("Allgemeine Geschäftsbedingungen", "Terms and conditions"), AGB, english),
    ].join("\n\n");
    await sendMail(textMail({ to: u.email, subject: t("Ihre Bestellung bei Cartag: Premium", "Your order at Cartag: premium"), text }));
  } catch (err) {
    console.error("Bestellbestätigung nicht verschickt", p.id, err);
  }
}

async function grantRow(p: Paid): Promise<"granted" | "known" | "no_account"> {
  return db().begin(async (tx) => {
    const [u] = await tx`select id from users where id = ${p.userId} for update`;
    if (!u) return "no_account" as const; // deleted between paying and the webhook: nothing to grant, the payment stays with Stripe
    const added = await tx`insert into premium_payments (id, user_id, months, amount, currency, payment_intent, customer, subscription, covers_until)
                           values (${p.id}, ${p.userId}, ${p.months}, ${p.amount}, ${p.currency}, ${p.paymentIntent}, ${p.customer}, ${p.subscription}, ${p.coversUntil})
                           on conflict (id) do nothing`;
    if (!added.count) return "known" as const;
    if (p.coversUntil) {
      // a subscription covers the period it paid for (server/premium.ts); what a contract gave beyond that stays
      await tx`update users set premium_until = greatest(premium_until, ${coveredUntil(p.coversUntil)}) where id = ${p.userId}`;
    } else {
      // like an approved contract (server/userCars.ts): on top of what is still running
      await tx`update users set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(months => ${p.months}) where id = ${p.userId}`;
    }
    return "granted" as const;
  });
}

/**
 * A paid invoice: the next period of a subscription (the first one too, under the same key as the return from
 * Checkout). The account is the one the subscription was started for, as Checkout wrote it into the subscription.
 */
async function invoicePaid(id: string) {
  const inv = await stripe<Invoice>("GET", `/invoices/${encodeURIComponent(id)}`);
  const subscription = subscriptionOf(inv);
  if (!subscription) return; // not a subscription's invoice
  const meta = inv.subscription_details?.metadata ?? inv.parent?.subscription_details?.metadata ?? {};
  let account = meta.product === PRODUCT && meta.user_id ? { user_id: meta.user_id, months: Number(meta.months) } : null;
  // without the marks on the invoice: the account that already paid for this subscription
  if (!account) [account = null] = await db()<{ user_id: string; months: number }[]>`select user_id, months from premium_payments where subscription = ${subscription} order by paid_at desc limit 1`;
  const paid = account && paidInvoice(inv, account.user_id, account.months);
  if (paid) await grant(paid);
}

const subCache = new Map<string, { at: number; sub: Subscription | null; notice: boolean; early: boolean }>();
const SUB_TTL = 30_000;

/**
 * The account's subscription and Stripe customer, from its latest subscription invoice; null when it never subscribed.
 * `notice`: its billing period is longer than a month and not the first one, so it can be cancelled with one month's
 * notice instead of to the end of the period (terms, section 6). `early`: it is cancelled to a day before the period
 * it paid for is over.
 */
async function subscriptionFor(userId: string): Promise<{ customer: string | null; id: string; sub: Subscription | null; notice: boolean; early: boolean } | null> {
  const [row] = await db()<{ customer: string | null; subscription: string }[]>`
    select customer, subscription from premium_payments where user_id = ${userId} and subscription is not null order by paid_at desc limit 1`;
  if (!row) return null;
  const hit = subCache.get(row.subscription);
  if (hit && Date.now() - hit.at < SUB_TTL) return { customer: row.customer, id: row.subscription, sub: hit.sub, notice: hit.notice, early: hit.early };
  const s = await stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(row.subscription)}`);
  const start = s.current_period_start ?? s.items?.data?.[0]?.current_period_start ?? null;
  const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  const ending = Boolean(s.cancel_at_period_end || s.cancel_at);
  // cancelled to a day before the paid period is over (stopRenewal): that day is the end
  const early = Boolean(ending && s.cancel_at && end && s.cancel_at < end - 86_400);
  const last = early ? s.cancel_at! : end;
  const until = last ? new Date(last * 1000).toISOString() : null;
  const sub: Subscription | null =
    s.status === "active" || s.status === "trialing"
      ? { status: ending ? "ending" : "active", until }
      : s.status === "past_due" ? { status: "past_due", until } : null;
  const notice = Boolean(start && end && s.start_date && end - start > 35 * 86_400 && start - s.start_date > 86_400);
  subCache.set(row.subscription, { at: Date.now(), sub, notice, early });
  return { customer: row.customer, id: row.subscription, sub, notice, early };
}

/** One month after `d`, on the same day of the month or on the month's last (31 January: 28 February). */
export function monthLater(d: Date): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + 1);
  if (r.getUTCDate() !== d.getUTCDate()) r.setUTCDate(0);
  return r;
}

/**
 * A cancellation that arrived without signing in (server/notices.ts): the account's subscription is not renewed any
 * more and ends with the period already paid for. `wished`: the day the customer wants the contract to end; when it
 * lies after the paid period the subscription has to run on and a person sets the date at Stripe. Returns the end of
 * the contract (as a rule the end of the paid period) and whether the renewal is stopped; null when there is no
 * running subscription. Throws when Stripe cannot be reached.
 *
 * `early`: the subscription ends before the period it paid for. That is the case for a billing period longer than a
 * month that has already renewed: the contract ends one month after the cancellation (or on the later day wished
 * for), and what was paid for the time after that is to be refunded, by hand. Only with `withNotice`, for a
 * cancellation: a withdrawal stops the renewal and leaves the rest to the person who checks it.
 */
export async function stopRenewal(userId: string, wished: string | null = null, withNotice = false): Promise<{ until: string | null; stopped: boolean; early: boolean } | null> {
  if (!key()) return null;
  let known: Awaited<ReturnType<typeof subscriptionFor>>;
  try {
    known = await subscriptionFor(userId);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "42P01" || code === "42703") return null; // no table or columns yet: nobody has subscribed
    throw err;
  }
  if (!known?.sub) return null;
  const { until, status } = known.sub;
  if (wished && until && Date.parse(wished) > Date.parse(until) + 86_400_000) return { until, stopped: false, early: false };
  if (withNotice && known.notice && until) {
    // the wished day counts to its end (in Germany)
    const end = Math.max(monthLater(new Date()).getTime(), wished ? Date.parse(`${wished}T21:59:59Z`) : 0);
    if (end < Date.parse(until) - 86_400_000) {
      // without Stripe's own credit for the unused time: the refund goes back to the means of payment, by hand
      await stripe("POST", `/subscriptions/${encodeURIComponent(known.id)}`, { cancel_at: String(Math.floor(end / 1000)), proration_behavior: "none" });
      subCache.delete(known.id);
      return { until: new Date(end).toISOString(), stopped: true, early: true };
    }
  }
  if (status !== "ending") {
    await stripe("POST", `/subscriptions/${encodeURIComponent(known.id)}`, { cancel_at_period_end: "true" });
    subCache.delete(known.id);
  }
  return { until, stopped: true, early: known.early };
}

/**
 * Ends the account's subscriptions at Stripe at once, before the account is deleted (server/auth.ts): nobody is
 * charged for an account that no longer exists. Throws when Stripe cannot be reached; the account then stays.
 */
export async function cancelSubscriptions(userId: string) {
  let rows: { subscription: string }[] = [];
  try {
    rows = await db()<{ subscription: string }[]>`select distinct subscription from premium_payments where user_id = ${userId} and subscription is not null`;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42P01" && code !== "42703") throw err; // no table or columns yet: nobody has subscribed
  }
  if (!rows.length) return;
  if (!key()) return console.error("Abo nicht gekündigt: STRIPE_SECRET_KEY fehlt.", rows.map((r) => r.subscription).join(", "));
  for (const { subscription } of rows) {
    const s = await stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(subscription)}`);
    if (s.status !== "canceled" && s.status !== "incomplete_expired") await stripe("DELETE", `/subscriptions/${encodeURIComponent(subscription)}`);
    subCache.delete(subscription);
  }
}

/**
 * A subscription that is over at Stripe before the period it paid for (cancelled with notice by stopRenewal, or ended
 * by hand after an extraordinary cancellation): premium from it ends with it. What the account's other payments and
 * contracts give stays.
 */
async function subscriptionEnded(id: string) {
  const s = await stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  if (s.status !== "canceled" || !s.ended_at) return;
  const ended = new Date(s.ended_at * 1000);
  subCache.delete(id);
  const [p] = await db()<{ user_id: string }[]>`select user_id from premium_payments where subscription = ${id} limit 1`;
  if (!p) return; // not a subscription of this app, or of an account that is gone
  await db().begin(async (tx) => {
    await tx`select 1 from users where id = ${p.user_id} for update`;
    const cut = await tx`update premium_payments set covers_until = ${ended} where subscription = ${id} and covers_until > ${ended}`;
    if (cut.count) await recomputePremium(tx, p.user_id);
  });
}

/** A payment refunded in full: what it gave goes, what the account's other payments and contracts give stays. */
async function refund(paymentIntent: string) {
  const [p] = await db()<{ user_id: string }[]>`select user_id from premium_payments where payment_intent = ${paymentIntent} and refunded_at is null`;
  if (!p) return;
  await db().begin(async (tx) => {
    await tx`select 1 from users where id = ${p.user_id} for update`;
    const done = await tx`update premium_payments set refunded_at = now() where payment_intent = ${paymentIntent} and refunded_at is null`;
    if (done.count) await recomputePremium(tx, p.user_id);
  });
}

/** Stripe-Signature: "t=<unix seconds>,v1=<hex hmac-sha256 of `t.body`>[,v1=…]". */
export function verifySignature(body: Buffer, header: string | undefined, secret: string, now = Date.now()): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1] ?? "";
  if (!/^\d+$/.test(t) || Math.abs(now / 1000 - Number(t)) > WEBHOOK_TOLERANCE_S) return false;
  const expected = createHmac("sha256", secret).update(`${t}.`).update(body).digest();
  return parts.some(([k, v]) => {
    if (k !== "v1" || !/^[0-9a-f]{64}$/i.test(v ?? "")) return false;
    return timingSafeEqual(Buffer.from(v, "hex"), expected);
  });
}

async function handleWebhook(req: IncomingMessage, res: ServerResponse) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    console.error("Stripe-Webhook abgelehnt: STRIPE_WEBHOOK_SECRET fehlt.");
    return sendJson(res, 503, { error: "not configured" });
  }
  let body: Buffer;
  try {
    body = await readBuffer(req, 1_000_000);
  } catch {
    return sendJson(res, 413, { error: "size" });
  }
  const header = req.headers["stripe-signature"];
  if (!verifySignature(body, Array.isArray(header) ? header[0] : header, secret)) return sendJson(res, 400, { error: "signature" });
  let event: StripeEvent;
  try {
    event = JSON.parse(body.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  const object = event.data?.object ?? {};
  try {
    if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && typeof object.id === "string" && SESSION_ID.test(object.id)) {
      const session = await readSession(object.id);
      const paid = paidSession(session);
      if (paid) await grant(paid, session.locale === "en");
    } else if (event.type === "invoice.paid" && typeof object.id === "string") {
      await invoicePaid(object.id);
    } else if (event.type === "charge.refunded" && object.refunded === true && typeof object.payment_intent === "string") {
      await refund(object.payment_intent);
    } else if (event.type === "customer.subscription.deleted" && typeof object.id === "string") {
      await subscriptionEnded(object.id);
    }
  } catch (err) {
    console.error("stripe webhook (npm run db:migrate?)", err);
    return sendJson(res, 500, { error: "failed" }); // Stripe sends the event again
  }
  sendJson(res, 200, { received: true });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const v = JSON.parse((await readText(req, 10_000)) || "{}");
  return v && typeof v === "object" ? v : {};
}

export async function handlePayments(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/stripe/webhook" && req.method === "POST") return handleWebhook(req, res);

  if (url.pathname === "/api/premium/angebot" && req.method === "GET") {
    const offers = (await currentPlans()).map(offerOf);
    const user = await currentUser(req);
    let payments: readonly unknown[] = [];
    let subscription: Subscription | null = null;
    if (user && !isDemo(user) && paymentsConfigured()) {
      try {
        payments = await db()`select paid_at, months, amount, currency, refunded_at, covers_until from premium_payments where user_id = ${user.id} order by paid_at desc limit 60`;
        subscription = (await subscriptionFor(user.id))?.sub ?? null;
      } catch (err) {
        console.error("premium_payments (npm run db:migrate?)", err);
      }
    }
    // `offer`: the first plan, for pages loaded before there were two
    return sendJson(res, 200, { offer: offers[0] ?? null, offers, payments, subscription });
  }

  if (req.method !== "POST" || !sameOrigin(req)) return sendJson(res, 404, { error: "Not found" });
  const user = await currentUser(req);
  if (!user) return sendJson(res, 401, { error: "not signed in" });
  // the demo account is shared and not in the database: premium bought with it would belong to nobody
  if (isDemo(user)) return sendJson(res, 403, { error: "demo" });
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: "bad request" });
  }
  if (!paymentsConfigured()) return sendJson(res, 503, { error: "unavailable" });
  if (await overLimit("checkout", user.id)) return sendJson(res, 429, { error: "too_many" });

  if (url.pathname === "/api/premium/kaufen") {
    const all = await currentPlans();
    // the plan by its billing period; a page that names none gets the first
    const offer = body.months === undefined ? all[0] : all.find((o) => o.months === body.months);
    if (!offer) return sendJson(res, 503, { error: "unavailable" });
    const english = body.lang === "en";
    const base = publicUrl(req);
    const back = safeNext(typeof body.back === "string" ? body.back : null);
    try {
      const known = offer.recurring ? await subscriptionFor(user.id) : null;
      // one subscription per account: a second one would charge twice for the same thing
      if (known?.sub) return sendJson(res, 409, { error: "subscribed" });
      const [u] = await db()<{ email: string | null }[]>`select email from users where id = ${user.id}`;
      const marks = { product: PRODUCT, user_id: user.id, months: String(offer.months) };
      const period = every(offer.months, english);
      // what applies to the order, next to the button that places it (Stripe renders the links)
      const legal = english
        ? ` Our [terms](${base}/agb?lang=en) apply. You may withdraw within 14 days: [withdrawal notice](${base}/widerruf?lang=en). Price: ${PRICE_NOTE[1]}.`
        : ` Es gelten unsere [AGB](${base}/agb). Sie können binnen 14 Tagen widerrufen: [Widerrufsbelehrung](${base}/widerruf). Preis: ${PRICE_NOTE[0]}.`;
      const session = await stripe<CheckoutSession>("POST", "/checkout/sessions", {
        mode: offer.recurring ? "subscription" : "payment",
        "line_items[0][price]": offer.price,
        "line_items[0][quantity]": "1",
        client_reference_id: user.id,
        ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [`metadata[${k}]`, v])),
        // on the subscription too: its later invoices carry them, and "invoice.paid" finds the account by them
        ...(offer.recurring ? Object.fromEntries(Object.entries(marks).map(([k, v]) => [`subscription_data[metadata][${k}]`, v])) : {}),
        success_url: returnUrl(base, back),
        cancel_url: base + back,
        locale: english ? "en" : "de",
        "custom_text[submit][message]":
          (offer.recurring
            ? english
              ? `Cartag Premium for your account, charged ${period}. It renews by itself; you can cancel at any time in your account, to the end of the period you paid for${offer.months > 1 ? `, and after ${firstTerm(offer.months, true)} also with one month's notice` : ""}.`
              : `Cartag Premium für Ihr Konto, Abbuchung ${period}. Verlängert sich von selbst; kündbar jederzeit in Ihrem Konto, zum Ende des bezahlten Zeitraums${offer.months > 1 ? `, nach ${firstTerm(offer.months, false)} auch mit einer Frist von einem Monat` : ""}.`
            : english
              ? `${offer.months} months of Cartag Premium for your account. One payment, no subscription: it does not renew by itself.`
              : `${offer.months} Monate Cartag Premium für Ihr Konto. Einmalige Zahlung, kein Abo: Es verlängert sich nicht von selbst.`) + legal,
        // who subscribed before stays the same customer at Stripe
        ...(known?.customer ? { customer: known.customer } : u?.email ? { customer_email: u.email } : {}),
        // the buyer must accept the terms linked in the Stripe account (Settings → Public details) before paying
        ...(process.env.STRIPE_REQUIRE_TERMS === "1" ? { "consent_collection[terms_of_service]": "required" } : {}),
        ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { "automatic_tax[enabled]": "true", ...(known?.customer ? { "customer_update[address]": "auto" } : {}) } : {}),
        ...(process.env.STRIPE_PROMO_CODES === "1" ? { allow_promotion_codes: "true" } : {}),
      });
      if (!session.url) throw new Error("no url");
      return sendJson(res, 200, { url: session.url });
    } catch (err) {
      console.error("stripe checkout", err);
      return sendJson(res, 502, { error: "stripe" });
    }
  }

  if (url.pathname === "/api/premium/verwalten") {
    try {
      const known = await subscriptionFor(user.id);
      if (!known?.customer) return sendJson(res, 404, { error: "none" });
      subCache.delete(known.id); // what the user changes over there shows on the way back
      const portal = await stripe<{ url?: string }>("POST", "/billing_portal/sessions", {
        customer: known.customer,
        return_url: publicUrl(req) + safeNext(typeof body.back === "string" ? body.back : null),
        locale: body.lang === "en" ? "en" : "de",
      });
      if (!portal.url) throw new Error("no url");
      return sendJson(res, 200, { url: portal.url });
    } catch (err) {
      console.error("stripe portal (im Stripe-Dashboard einschalten: Einstellungen → Billing → Kundenportal)", err);
      return sendJson(res, 502, { error: "stripe" });
    }
  }

  if (url.pathname === "/api/premium/bestaetigen") {
    const id = typeof body.session === "string" ? body.session : "";
    if (!SESSION_ID.test(id)) return sendJson(res, 400, { error: "session" });
    let session: CheckoutSession;
    try {
      session = await readSession(id);
    } catch (err) {
      console.error("stripe session", err);
      return sendJson(res, 502, { error: "stripe" });
    }
    // somebody else's session id (from a shared link, say) grants nothing and tells nothing
    if (session.client_reference_id !== user.id) return sendJson(res, 404, { error: "Not found" });
    const paid = paidSession(session);
    // completed but not paid yet: a bank debit (SEPA) that takes days; the webhook grants when the money arrives
    if (!paid) return sendJson(res, 200, { status: session.status === "complete" ? "pending" : "open" });
    try {
      await grant(paid, session.locale === "en");
    } catch (err) {
      console.error("premium grant (npm run db:migrate?)", err);
      return sendJson(res, 500, { error: "failed" });
    }
    return sendJson(res, 200, { status: "paid" });
  }
  return sendJson(res, 404, { error: "Not found" });
}
