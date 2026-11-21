import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readBuffer, readText } from "./body.ts";
import { currentUser, isDemo, publicUrl, safeNext } from "./auth.ts";
import { db } from "./db.ts";
import { overLimit } from "./limits.ts";
import { PREMIUM_MONTHS, coveredUntil, recomputePremium } from "./premium.ts";

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
 * and the app shows the purchase contract as the only way.
 *
 *   GET  /api/premium/angebot       the offer (anyone), the account's own payments and its subscription
 *   POST /api/premium/kaufen        { back, lang } -> { url }: the Checkout page for this account
 *   POST /api/premium/bestaetigen   { session } -> { status }: back from Checkout, grants at once if it is paid
 *   POST /api/premium/verwalten     { back, lang } -> { url }: Stripe's customer portal (cancel, payment method, invoices)
 *   POST /api/stripe/webhook        Stripe's events (signed): paid, paid later (SEPA), invoice paid, refunded
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
  lines?: { data?: { period?: { end?: number } | null }[] } | null;
};
type StripeSubscription = {
  id: string; status?: string; cancel_at_period_end?: boolean; cancel_at?: number | null; current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] } | null;
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
  /** expanded where this file reads a session: the first invoice of a subscription */
  invoice?: string | Invoice | null;
  metadata?: Record<string, string> | null;
};
type StripeEvent = { type?: string; data?: { object?: Record<string, unknown> } };

const key = () => process.env.STRIPE_SECRET_KEY?.trim() ?? "";
const priceId = () => process.env.STRIPE_PRICE_ID?.trim() ?? "";
export const paymentsConfigured = () => Boolean(key() && priceId());

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

async function stripe<T>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>): Promise<T> {
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

let cached: { at: number; offer: Offer | null } | null = null;
/** The offer as Stripe has it, read at most every ten minutes; null without configuration or while Stripe is unreachable. */
async function currentOffer(): Promise<Offer | null> {
  if (!paymentsConfigured()) return null;
  if (cached && Date.now() - cached.at < OFFER_TTL) return cached.offer;
  try {
    if (!(await schemaReady())) {
      console.error("premium_payments: Tabelle oder Spalten fehlen (npm run db:migrate:prod, Migrationen 014 und 015). Bis dahin wird nichts verkauft.");
      cached = { at: Date.now() - OFFER_TTL + 60_000, offer: null };
      return null;
    }
    const offer = priceOffer(await stripe<StripePrice>("GET", `/prices/${encodeURIComponent(priceId())}`));
    if (!offer) console.error("STRIPE_PRICE_ID: kein aktiver Preis mit festem Betrag (einmalig, pro Monat oder pro Jahr).");
    cached = { at: Date.now(), offer };
  } catch (err) {
    console.error("stripe price", err);
    // the last known offer stays for another minute rather than the button flickering away on one failed request
    cached = { at: Date.now() - OFFER_TTL + 60_000, offer: cached?.offer ?? null };
  }
  return cached.offer;
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
const subscriptionOf = (inv: Invoice) => refId(inv.subscription) ?? refId(inv.parent?.subscription_details?.subscription);

/** What a paid invoice of a subscription grants to this account, or null when it is not one. */
export function paidInvoice(inv: Invoice, userId: string, months: number): Paid | null {
  const subscription = subscriptionOf(inv);
  const end = Math.max(0, ...(inv.lines?.data ?? []).map((l) => l.period?.end ?? 0));
  if (inv.status !== "paid" || !subscription || !end || !userId || !validMonths(months)) return null;
  return {
    id: inv.id, userId, months, amount: (inv.amount_paid ?? 0) / 100, currency: (inv.currency ?? "").toUpperCase(),
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
const readSession = (id: string) => stripe<CheckoutSession>("GET", `/checkout/sessions/${id}?expand%5B%5D=invoice`);
const SESSION_ID = /^cs_[A-Za-z0-9_]{8,250}$/;

/** Grants what was paid, once per payment however often it is reported. */
async function grant(p: Paid): Promise<"granted" | "known" | "no_account"> {
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

const subCache = new Map<string, { at: number; sub: Subscription | null }>();
const SUB_TTL = 30_000;

/** The account's subscription and Stripe customer, from its latest subscription invoice; null when it never subscribed. */
async function subscriptionFor(userId: string): Promise<{ customer: string | null; id: string; sub: Subscription | null } | null> {
  const [row] = await db()<{ customer: string | null; subscription: string }[]>`
    select customer, subscription from premium_payments where user_id = ${userId} and subscription is not null order by paid_at desc limit 1`;
  if (!row) return null;
  const hit = subCache.get(row.subscription);
  if (hit && Date.now() - hit.at < SUB_TTL) return { customer: row.customer, id: row.subscription, sub: hit.sub };
  const s = await stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(row.subscription)}`);
  const end = s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
  const until = end ? new Date(end * 1000).toISOString() : null;
  const sub: Subscription | null =
    s.status === "active" || s.status === "trialing"
      ? { status: s.cancel_at_period_end || s.cancel_at ? "ending" : "active", until }
      : s.status === "past_due" ? { status: "past_due", until } : null;
  subCache.set(row.subscription, { at: Date.now(), sub });
  return { customer: row.customer, id: row.subscription, sub };
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
      const paid = paidSession(await readSession(object.id));
      if (paid) await grant(paid);
    } else if (event.type === "invoice.paid" && typeof object.id === "string") {
      await invoicePaid(object.id);
    } else if (event.type === "charge.refunded" && object.refunded === true && typeof object.payment_intent === "string") {
      await refund(object.payment_intent);
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
    const offer = await currentOffer();
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
    return sendJson(res, 200, { offer, payments, subscription });
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
    const offer = await currentOffer();
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
      const every = offer.months === 1 ? (english ? "monthly" : "monatlich") : offer.months === 12 ? (english ? "yearly" : "jährlich") : english ? `every ${offer.months} months` : `alle ${offer.months} Monate`;
      const session = await stripe<CheckoutSession>("POST", "/checkout/sessions", {
        mode: offer.recurring ? "subscription" : "payment",
        "line_items[0][price]": priceId(),
        "line_items[0][quantity]": "1",
        client_reference_id: user.id,
        ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [`metadata[${k}]`, v])),
        // on the subscription too: its later invoices carry them, and "invoice.paid" finds the account by them
        ...(offer.recurring ? Object.fromEntries(Object.entries(marks).map(([k, v]) => [`subscription_data[metadata][${k}]`, v])) : {}),
        success_url: returnUrl(base, back),
        cancel_url: base + back,
        locale: english ? "en" : "de",
        "custom_text[submit][message]": offer.recurring
          ? english
            ? `Cartag Premium for your account, charged ${every}. It renews by itself; you can cancel at any time in your account, to the end of the period you paid for.`
            : `Cartag Premium für Ihr Konto, Abbuchung ${every}. Verlängert sich von selbst; kündbar jederzeit in Ihrem Konto, zum Ende des bezahlten Zeitraums.`
          : english
            ? `${offer.months} months of Cartag Premium for your account. One payment, no subscription: it does not renew by itself.`
            : `${offer.months} Monate Cartag Premium für Ihr Konto. Einmalige Zahlung, kein Abo: Es verlängert sich nicht von selbst.`,
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
      await grant(paid);
    } catch (err) {
      console.error("premium grant (npm run db:migrate?)", err);
      return sendJson(res, 500, { error: "failed" });
    }
    return sendJson(res, 200, { status: "paid" });
  }
  return sendJson(res, 404, { error: "Not found" });
}
