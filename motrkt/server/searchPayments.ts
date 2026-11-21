import type { IncomingMessage } from "node:http";
import { isPremium, publicUrl, safeNext } from "./auth.ts";
import { db } from "./db.ts";
import { sendMail, textMail } from "./mail.ts";
import { SUBSCRIPTION_GRACE_DAYS } from "./premium.ts";
import { every, priceOffer, readSession, stripe, stripeConfigured, subscriptionOf, type CheckoutSession, type Invoice, type Offer, type StripeSubscription } from "./payments.ts";
import { AGB, OPERATOR_LINE, PRICE_NOTE, SITE, WIDERRUF, WIDERRUF_INTRO, plainText } from "../src/terms.ts";

/**
 * How many search orders an account may run (server/searchApi.ts), and the subscription that adds more.
 *
 *   without an account   none
 *   lite                 none included
 *   premium              INCLUDED_PREMIUM included
 *   lite and premium     further orders by subscription: one Stripe price (STRIPE_SEARCH_PRICE_ID, recurring) per
 *                        order and billing period, any number of them. Each purchase is a subscription of its own
 *                        with its quantity; an account may hold several.
 *
 * It works like the premium subscription next to it (server/payments.ts, whose Stripe helpers it uses): the payment
 * page is Stripe's Checkout, a paid invoice is stored once (search_payments, db/migrations/017) whether the return
 * from Checkout or the webhook reports it first, and the newest invoice of a subscription says how many orders it
 * pays for and until when. The first invoice is confirmed by mail with the terms and the withdrawal notice in full.
 * Cancelling: Stripe's customer portal ("Abo verwalten"), or without signing in at /kuendigen (server/notices.ts,
 * stopSearchRenewal). Without the price, the Stripe key or the table nothing is offered and nobody has more than
 * their plan includes.
 */

/** Search orders that come with premium. */
export const INCLUDED_PREMIUM = 3;
/** Marks the Checkout Sessions and subscriptions of this product (premium's mark is its own). */
export const SEARCH_PRODUCT = "cartag_search_order";
/** Most orders one purchase can add (the buyer may change the number on the payment page). */
const MAX_QUANTITY = 20;

const priceId = () => process.env.STRIPE_SEARCH_PRICE_ID?.trim() ?? "";
export const searchAddonConfigured = () => Boolean(stripeConfigured() && priceId());

const missing = (err: unknown) => ["42P01", "42703"].includes((err as { code?: string }).code ?? ""); // "undefined table/column": migration 017 not applied yet

let cached: { at: number; offer: Offer | null } | null = null;
/** What one further order costs, as Stripe has the price; read at most every ten minutes. Null: not on sale. */
export async function searchOffer(): Promise<Offer | null> {
  if (!searchAddonConfigured()) return null;
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.offer;
  try {
    await db()`select 1 from search_payments limit 1`; // without the table a payment could not be granted: nothing is sold
    const offer = priceOffer(await stripe("GET", `/prices/${encodeURIComponent(priceId())}`));
    if (!offer?.recurring) console.error("STRIPE_SEARCH_PRICE_ID: kein aktiver Abo-Preis mit festem Betrag (pro Monat oder Jahr).");
    cached = { at: Date.now(), offer: offer?.recurring ? offer : null };
  } catch (err) {
    console.error("stripe price (STRIPE_SEARCH_PRICE_ID; npm run db:migrate?)", err);
    cached = { at: Date.now() - 9 * 60_000, offer: cached?.offer ?? null }; // the last known offer stays; read again in a minute
  }
  return cached.offer;
}

/** Orders the account's subscriptions pay for right now: per subscription its newest invoice, a few days past the period it paid for. */
export async function extraOrders(userId: string): Promise<number> {
  try {
    const [{ n }] = await db()<{ n: number }[]>`
      select coalesce(sum(quantity), 0)::int as n from (
        select distinct on (subscription) quantity, covers_until, refunded_at from search_payments where user_id = ${userId} order by subscription, paid_at desc) s
      where refunded_at is null and covers_until > now() - make_interval(days => ${SUBSCRIPTION_GRACE_DAYS})`;
    return n;
  } catch (err) {
    if (missing(err)) return 0;
    throw err;
  }
}

export type Allowance = { premium: boolean; included: number; extra: number; allowed: number };
/** What the account may run: what its plan includes plus what it subscribed to. */
export async function allowance(user: { id: string; username: string }): Promise<Allowance> {
  const premium = await isPremium(user);
  return allowanceOf(premium, await extraOrders(user.id));
}
export function allowanceOf(premium: boolean, extra: number): Allowance {
  const included = premium ? INCLUDED_PREMIUM : 0;
  return { premium, included, extra, allowed: included + extra };
}

// ------------------------------------------------------------------------------------------------------- checkout

/** The account's Stripe customer, from an earlier payment for search orders or for premium, so all its subscriptions sit in one portal. */
async function customerOf(userId: string): Promise<string | null> {
  for (const table of ["search_payments", "premium_payments"] as const) {
    try {
      const [row] = await db()<{ customer: string | null }[]>`select customer from ${db()(table)} where user_id = ${userId} and customer is not null order by paid_at desc limit 1`;
      if (row?.customer) return row.customer;
    } catch (err) {
      if (!missing(err)) throw err;
    }
  }
  return null;
}

/** `back` (a path of this site) with the marks the page reads on the way back; Stripe fills in the session id. */
export function searchReturnUrl(base: string, back: string) {
  const u = new URL(back, base);
  u.searchParams.set("suche", "bezahlt");
  u.searchParams.set("cs", "CSID");
  return (base + u.pathname + u.search + u.hash).replace("cs=CSID", "cs={CHECKOUT_SESSION_ID}");
}

/** The Checkout page for `quantity` further orders; null when the product is not on sale. Throws when Stripe fails. */
export async function searchCheckout(req: IncomingMessage, user: { id: string }, body: Record<string, unknown>): Promise<string | null> {
  const offer = await searchOffer();
  if (!offer) return null;
  const english = body.lang === "en";
  const base = publicUrl(req);
  const back = safeNext(typeof body.back === "string" ? body.back : "/suchagent");
  const quantity = Math.min(Math.max(Math.floor(Number(body.quantity)) || 1, 1), MAX_QUANTITY);
  const [u] = await db()<{ email: string | null }[]>`select email from users where id = ${user.id}`;
  const customer = await customerOf(user.id);
  const marks = { product: SEARCH_PRODUCT, user_id: user.id };
  const period = every(offer.months, english);
  const legal = english
    ? ` Our [terms](${base}/agb?lang=en) apply. You may withdraw within 14 days: [withdrawal notice](${base}/widerruf?lang=en). Price: ${PRICE_NOTE[1]}.`
    : ` Es gelten unsere [AGB](${base}/agb). Sie können binnen 14 Tagen widerrufen: [Widerrufsbelehrung](${base}/widerruf). Preis: ${PRICE_NOTE[0]}.`;
  const session = await stripe<CheckoutSession>("POST", "/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceId(),
    "line_items[0][quantity]": String(quantity),
    "line_items[0][adjustable_quantity][enabled]": "true",
    "line_items[0][adjustable_quantity][minimum]": "1",
    "line_items[0][adjustable_quantity][maximum]": String(MAX_QUANTITY),
    client_reference_id: user.id,
    ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [`metadata[${k}]`, v])),
    // on the subscription too: its later invoices carry them, and "invoice.paid" finds the account by them
    ...Object.fromEntries(Object.entries(marks).map(([k, v]) => [`subscription_data[metadata][${k}]`, v])),
    success_url: searchReturnUrl(base, back),
    cancel_url: base + back,
    locale: english ? "en" : "de",
    "custom_text[submit][message]":
      (english
        ? `Further search orders for the Cartag search agent, charged ${period} per order. The subscription renews by itself; you can cancel at any time in your account, to the end of the period you paid for.`
        : `Zusätzliche Suchaufträge für den Cartag-Suchagenten, Abbuchung ${period} je Auftrag. Das Abo verlängert sich von selbst; kündbar jederzeit in Ihrem Konto, zum Ende des bezahlten Zeitraums.`) + legal,
    ...(customer ? { customer } : u?.email ? { customer_email: u.email } : {}),
    ...(process.env.STRIPE_REQUIRE_TERMS === "1" ? { "consent_collection[terms_of_service]": "required" } : {}),
    ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { "automatic_tax[enabled]": "true", ...(customer ? { "customer_update[address]": "auto" } : {}) } : {}),
    ...(process.env.STRIPE_PROMO_CODES === "1" ? { allow_promotion_codes: "true" } : {}),
  });
  if (!session.url) throw new Error("no url");
  return session.url;
}

/** Stripe's customer portal for the account (cancel, payment method, invoices); null when it never paid. */
export async function searchPortal(req: IncomingMessage, user: { id: string }, body: Record<string, unknown>): Promise<string | null> {
  const customer = await customerOf(user.id);
  if (!customer) return null;
  live.clear(); // what the user changes over there shows on the way back
  const portal = await stripe<{ url?: string }>("POST", "/billing_portal/sessions", {
    customer,
    return_url: publicUrl(req) + safeNext(typeof body.back === "string" ? body.back : "/suchagent"),
    locale: body.lang === "en" ? "en" : "de",
  });
  if (!portal.url) throw new Error("no url");
  return portal.url;
}

// ---------------------------------------------------------------------------------------------------------- grant

const periodEnd = (s: StripeSubscription) => s.current_period_end ?? s.items?.data?.[0]?.current_period_end ?? null;
const quantityOf = (s: StripeSubscription) => Math.max((s.items?.data ?? []).reduce((n, i) => n + (i.quantity ?? 1), 0), 1);
const readSubscription = (id: string) => stripe<StripeSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);

/**
 * Stores a paid invoice of a search-order subscription, once however often it is reported. How many orders it pays
 * for and until when is read from the subscription itself (an invoice after a change of quantity lists credits and
 * charges side by side).
 */
async function record(inv: Invoice, userId: string): Promise<"granted" | "known" | "no_account" | null> {
  const subscription = subscriptionOf(inv);
  if (inv.status !== "paid" || !subscription || !userId) return null;
  const s = await readSubscription(subscription);
  const end = periodEnd(s);
  if (!end) return null;
  const result = await db().begin(async (tx) => {
    const [u] = await tx`select id from users where id = ${userId} for update`;
    if (!u) return "no_account" as const; // deleted between paying and the webhook: the payment stays with Stripe
    const added = await tx`
      insert into search_payments (id, user_id, subscription, customer, quantity, amount, currency, payment_intent, covers_until)
      values (${inv.id}, ${userId}, ${subscription}, ${typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null)}, ${quantityOf(s)},
              ${(inv.amount_paid ?? 0) / 100}, ${(inv.currency ?? "").toUpperCase()}, ${typeof inv.payment_intent === "string" ? inv.payment_intent : (inv.payment_intent?.id ?? null)},
              ${new Date(end * 1000)})
      on conflict (id) do nothing`;
    if (!added.count) return "known" as const;
    // orders that waited for a free place look at the stock on the next run
    await tx`update search_orders set due_at = now() where user_id = ${userId} and active and due_at is null`;
    return "granted" as const;
  });
  live.delete(subscription);
  return result;
}

/** The return from Checkout or its webhook: grants the first invoice of a new subscription and confirms the contract by mail. Null when the session is not one of this product. */
export async function searchSessionPaid(session: CheckoutSession): Promise<"paid" | "pending" | null> {
  const meta = session.metadata ?? {};
  if (session.mode !== "subscription" || meta.product !== SEARCH_PRODUCT) return null;
  if (!session.client_reference_id || session.client_reference_id !== meta.user_id) return null;
  // completed but not paid yet: a bank debit (SEPA) that takes days; the webhook grants when the money arrives
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return "pending";
  if (!session.invoice || typeof session.invoice !== "object") return "pending";
  const result = await record(session.invoice, session.client_reference_id);
  if (result === "granted") await confirmOrder(session.invoice, session.client_reference_id, session.locale === "en");
  return result ? "paid" : "pending";
}

/** A Checkout Session of this account read again from Stripe and granted; null when it is not this account's or not this product. */
export async function confirmSearchSession(sessionId: string, userId: string) {
  const session = await readSession(sessionId);
  if (session.client_reference_id !== userId) return null;
  return searchSessionPaid(session);
}

/** "invoice.paid": the next period of a subscription (the first too). True when the invoice belongs to this product. */
export async function searchInvoicePaid(inv: Invoice): Promise<boolean> {
  const subscription = subscriptionOf(inv);
  if (!subscription) return false;
  const meta = inv.subscription_details?.metadata ?? inv.parent?.subscription_details?.metadata ?? {};
  let userId = meta.product === SEARCH_PRODUCT ? (meta.user_id ?? "") : "";
  if (!userId) {
    if (meta.product) return false; // marked as another product
    // without the marks on the invoice: the account that already paid for this subscription
    try {
      const [row] = await db()<{ user_id: string }[]>`select user_id from search_payments where subscription = ${subscription} order by paid_at desc limit 1`;
      if (!row) return false;
      userId = row.user_id;
    } catch (err) {
      if (missing(err)) return false;
      throw err;
    }
  }
  const result = await record(inv, userId);
  // a first invoice the return from Checkout did not report (the buyer closed the page): confirm the contract here
  if (result === "granted") await confirmOrder(inv, userId, false);
  return true;
}

/** A payment refunded in full: its orders no longer count. */
export async function searchRefund(paymentIntent: string) {
  try {
    await db()`update search_payments set refunded_at = now() where payment_intent = ${paymentIntent} and refunded_at is null`;
  } catch (err) {
    if (!missing(err)) throw err;
  }
}

/** A subscription that is over at Stripe before the period it paid for: its orders end with it. */
export async function searchSubscriptionEnded(id: string) {
  try {
    const [row] = await db()<{ user_id: string }[]>`select user_id from search_payments where subscription = ${id} limit 1`;
    if (!row) return;
    const s = await readSubscription(id);
    if (s.status !== "canceled" || !s.ended_at) return;
    await db()`update search_payments set covers_until = ${new Date(s.ended_at * 1000)} where subscription = ${id} and covers_until > ${new Date(s.ended_at * 1000)}`;
    live.delete(id);
  } catch (err) {
    if (!missing(err)) throw err;
  }
}

/**
 * The confirmation of the contract on a durable medium (§ 312f BGB), like premium's (server/payments.ts): once per
 * subscription, with its first invoice. A mail that cannot be sent is logged and does not undo the grant.
 */
async function confirmOrder(inv: Invoice, userId: string, english: boolean) {
  try {
    const subscription = subscriptionOf(inv);
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from search_payments where subscription = ${subscription}`;
    if (n > 1) return; // a renewal: the contract was confirmed with its first invoice
    const [row] = await db()<{ quantity: number; amount: string; currency: string }[]>`select quantity, amount, currency from search_payments where id = ${inv.id}`;
    const [u] = await db()<{ email: string | null; username: string }[]>`select email, username from users where id = ${userId}`;
    if (!row || !u?.email) return;
    const offer = await searchOffer();
    const months = offer?.months ?? 1;
    const i = english ? 1 : 0;
    const t = (de: string, en: string) => (english ? en : de);
    const price = new Intl.NumberFormat(english ? "en-GB" : "de-DE", { style: "currency", currency: row.currency || "EUR" }).format(Number(row.amount));
    const when = new Intl.DateTimeFormat(english ? "en-GB" : "de-DE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date());
    const site = `https://${SITE}`;
    const orders = row.quantity === 1 ? t("1 zusätzlicher Suchauftrag", "1 further search order") : t(`${row.quantity} zusätzliche Suchaufträge`, `${row.quantity} further search orders`);
    const text = [
      t(`Guten Tag ${u.username},`, `Hello ${u.username},`),
      t(
        "vielen Dank für Ihre Bestellung. Die zusätzlichen Suchaufträge sind für Ihr Konto freigeschaltet. Diese Nachricht bestätigt Ihren Vertrag; bitte bewahren Sie sie auf.",
        "thank you for your order. The further search orders are unlocked for your account. This message confirms your contract; please keep it.",
      ),
      [
        `${t("Bestellung", "Order")}: ${t(`Cartag Suchagent, ${orders} (Abo)`, `Cartag search agent, ${orders} (subscription)`)}`,
        `${t("Preis", "Price")}: ${price} ${every(months, english)} (${PRICE_NOTE[i]})`,
        `${t("Bestellt am", "Ordered on")}: ${when}`,
        `${t("Konto", "Account")}: ${u.username}`,
        `${t("Vertragspartner", "Contracting party")}: ${OPERATOR_LINE[i]}`,
      ].join("\n"),
      t(
        `Laufzeit und Kündigung: Das Abo wird ${every(months, false)} im Voraus abgebucht und verlängert sich jeweils um denselben Zeitraum, bis Sie kündigen. Kündigen können Sie jederzeit zum Ende des bezahlten Zeitraums: beim Suchagenten unter „Abo verwalten oder kündigen“ oder ohne Anmeldung unter ${site}/kuendigen. Ihre Suchaufträge über die in Ihrem Tarif enthaltene Zahl hinaus ruhen danach.`,
        `Term and cancellation: the subscription is charged ${every(months, true)} in advance and renews for the same period each time until you cancel. You may cancel at any time to the end of the paid period: at the search agent under “Manage or cancel subscription”, or without signing in at ${site}/kuendigen?lang=en. Your search orders beyond the number your plan includes rest after that.`,
      ),
      t(
        `Widerruf: Sie können diesen Vertrag binnen vierzehn Tagen widerrufen, am einfachsten online unter ${site}/widerruf („Vertrag widerrufen“). Die Widerrufsbelehrung und unsere Allgemeinen Geschäftsbedingungen folgen unten im Wortlaut.`,
        `Withdrawal: you may withdraw from this contract within fourteen days, most easily online at ${site}/widerruf?lang=en (“Withdraw from contract”). The withdrawal notice and our terms follow below in full.`,
      ),
      "Cartag",
      "\n" + plainText(t("Widerrufsbelehrung", "Withdrawal notice"), WIDERRUF, english, WIDERRUF_INTRO[i]),
      "\n" + plainText(t("Allgemeine Geschäftsbedingungen", "Terms and conditions"), AGB, english),
    ].join("\n\n");
    await sendMail(textMail({ to: u.email, subject: t("Ihre Bestellung bei Cartag: Suchaufträge", "Your order at Cartag: search orders"), text }));
  } catch (err) {
    console.error("Bestellbestätigung (Suchaufträge) nicht verschickt", inv.id, err);
  }
}

// -------------------------------------------------------------------------------------------------- subscriptions

export type SearchSubscription = { quantity: number; status: "active" | "ending" | "past_due"; until: string | null };
const live = new Map<string, { at: number; sub: SearchSubscription | null }>();

/** The account's subscriptions that still pay for orders, each with its state at Stripe (read at most every 30 seconds). */
export async function searchSubscriptions(userId: string): Promise<(SearchSubscription & { id: string })[]> {
  let rows: { subscription: string; quantity: number; covers_until: Date }[] = [];
  try {
    rows = await db()<typeof rows>`
      select subscription, quantity, covers_until from (
        select distinct on (subscription) subscription, quantity, covers_until, refunded_at from search_payments where user_id = ${userId} order by subscription, paid_at desc) s
      where refunded_at is null and covers_until > now() - make_interval(days => ${SUBSCRIPTION_GRACE_DAYS})`;
  } catch (err) {
    if (!missing(err)) throw err;
  }
  const out: (SearchSubscription & { id: string })[] = [];
  for (const row of rows) {
    let hit = live.get(row.subscription);
    if (!hit || Date.now() - hit.at > 30_000) {
      let sub: SearchSubscription | null = { quantity: row.quantity, status: "active", until: row.covers_until.toISOString() };
      if (stripeConfigured()) {
        try {
          const s = await readSubscription(row.subscription);
          const end = s.cancel_at ?? periodEnd(s);
          const until = end ? new Date(end * 1000).toISOString() : sub.until;
          sub =
            s.status === "active" || s.status === "trialing"
              ? { quantity: row.quantity, status: s.cancel_at_period_end || s.cancel_at ? "ending" : "active", until }
              : s.status === "past_due" ? { quantity: row.quantity, status: "past_due", until } : null;
        } catch (err) {
          console.error("stripe subscription (Suchaufträge)", err); // what the database says stays
        }
      }
      hit = { at: Date.now(), sub };
      live.set(row.subscription, hit);
    }
    if (hit.sub) out.push({ id: row.subscription, ...hit.sub });
  }
  return out;
}

/**
 * A cancellation that arrived without signing in (server/notices.ts): none of the account's search-order
 * subscriptions is renewed any more; each ends with the period already paid for. Returns the latest of those ends,
 * null when nothing is running. Throws when Stripe cannot be reached.
 */
export async function stopSearchRenewal(userId: string): Promise<{ until: string | null; stopped: boolean } | null> {
  if (!stripeConfigured()) return null;
  const subs = await searchSubscriptions(userId);
  if (!subs.length) return null;
  for (const s of subs) {
    if (s.status !== "ending") await stripe("POST", `/subscriptions/${encodeURIComponent(s.id)}`, { cancel_at_period_end: "true" });
    live.delete(s.id);
  }
  const until = subs.map((s) => s.until).filter((u): u is string => Boolean(u)).sort().pop() ?? null;
  return { until, stopped: true };
}

/** Ends the account's search-order subscriptions at Stripe at once, before the account is deleted. Throws when Stripe cannot be reached. */
export async function cancelSearchSubscriptions(userId: string) {
  let rows: { subscription: string }[] = [];
  try {
    rows = await db()<{ subscription: string }[]>`select distinct subscription from search_payments where user_id = ${userId}`;
  } catch (err) {
    if (!missing(err)) throw err;
  }
  if (!rows.length) return;
  if (!stripeConfigured()) return console.error("Abo (Suchaufträge) nicht gekündigt: STRIPE_SECRET_KEY fehlt.", rows.map((r) => r.subscription).join(", "));
  for (const { subscription } of rows) {
    const s = await readSubscription(subscription);
    if (s.status !== "canceled" && s.status !== "incomplete_expired") await stripe("DELETE", `/subscriptions/${encodeURIComponent(subscription)}`);
    live.delete(subscription);
  }
}
