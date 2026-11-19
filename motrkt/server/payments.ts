import type { IncomingMessage, ServerResponse } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readBuffer, readText } from "./body.ts";
import { currentUser, isDemo, publicUrl, safeNext } from "./auth.ts";
import { db } from "./db.ts";
import { overLimit } from "./limits.ts";
import { PREMIUM_MONTHS, recomputePremium } from "./premium.ts";

/**
 * Buying premium: the second way next to the purchase contract (server/userCars.ts). One payment for a fixed number
 * of months, no subscription: nothing renews by itself, so there is nothing to cancel. The payment page is Stripe's
 * (Checkout, a redirect): no card data and no Stripe script ever touch this app.
 *
 * Configuration (.env.example): STRIPE_SECRET_KEY, STRIPE_PRICE_ID (a one-time price; its amount and currency are
 * what the app shows, its metadata "months" the length, default PREMIUM_MONTHS) and STRIPE_WEBHOOK_SECRET. Without
 * the first two there is no offer and the app shows the purchase contract as the only way.
 *
 *   GET  /api/premium/angebot       the offer (anyone) and the account's own payments
 *   POST /api/premium/kaufen        { back, lang } -> { url }: the Checkout page for this account
 *   POST /api/premium/bestaetigen   { session } -> { status }: back from Checkout, grants at once if it is paid
 *   POST /api/stripe/webhook        Stripe's events (signed): paid, paid later (SEPA), refunded
 *
 * A payment is granted exactly once, whoever reports it first (the return from Checkout or the webhook): the session
 * id is the key of premium_payments (db/migrations/014_payments.sql). Stored is what the grant needs (account, months,
 * amount, Stripe's ids), never an address or card; those stay with Stripe (DATENSCHUTZ.md).
 */

// STRIPE_API_BASE: only to run the flow against a stand-in for Stripe in a local test
const api = () => process.env.STRIPE_API_BASE?.replace(/\/+$/, "") || "https://api.stripe.com/v1";
/** Marks the Checkout Sessions of this app: the Stripe account may sell other things, and their events arrive here too. */
const PRODUCT = "carbay_premium";
const OFFER_TTL = 10 * 60_000;
/** A webhook older than this is not accepted (Stripe's own default): a captured request cannot be replayed later. */
const WEBHOOK_TOLERANCE_S = 300;

export type Offer = { amount: number; currency: string; months: number };

type StripePrice = { id: string; active?: boolean; type?: string; unit_amount?: number | null; currency?: string; metadata?: Record<string, string> };
export type CheckoutSession = {
  id: string;
  url?: string | null;
  mode?: string;
  status?: string | null;
  payment_status?: string;
  client_reference_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_intent?: string | { id: string } | null;
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

async function stripe<T>(method: "GET" | "POST", path: string, params?: Record<string, string>): Promise<T> {
  const r = await fetch(api() + path, {
    method,
    headers: { Authorization: `Bearer ${key()}`, ...(params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params).toString() : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!r.ok) throw new Error(`stripe ${r.status} ${path.split("/")[1]}: ${j.error?.message ?? ""}`.slice(0, 300));
  return j;
}

/** What a Stripe price offers, or null when it cannot be sold here (inactive, recurring, no fixed amount). */
export function priceOffer(p: StripePrice): Offer | null {
  if (p.active === false || p.type !== "one_time" || typeof p.unit_amount !== "number" || p.unit_amount <= 0 || !p.currency) return null;
  const m = Number(p.metadata?.months);
  return { amount: p.unit_amount / 100, currency: p.currency.toUpperCase(), months: Number.isInteger(m) && m >= 1 && m <= 120 ? m : PREMIUM_MONTHS };
}

let cached: { at: number; offer: Offer | null } | null = null;
/** The offer as Stripe has it, read at most every ten minutes; null without configuration or while Stripe is unreachable. */
async function currentOffer(): Promise<Offer | null> {
  if (!paymentsConfigured()) return null;
  if (cached && Date.now() - cached.at < OFFER_TTL) return cached.offer;
  try {
    const offer = priceOffer(await stripe<StripePrice>("GET", `/prices/${encodeURIComponent(priceId())}`));
    if (!offer) console.error("STRIPE_PRICE_ID: kein aktiver Einmalpreis mit festem Betrag (Abo-Preise werden nicht unterstützt).");
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

export type Paid = { id: string; userId: string; months: number; amount: number; currency: string; paymentIntent: string | null };

/** What a Checkout Session grants, or null when it is not a paid premium purchase of this app. */
export function paidSession(s: CheckoutSession): Paid | null {
  const meta = s.metadata ?? {};
  if (s.mode !== "payment" || meta.product !== PRODUCT) return null;
  // "no_payment_required": a discount code covered the whole price
  if (s.payment_status !== "paid" && s.payment_status !== "no_payment_required") return null;
  const months = Number(meta.months);
  if (!s.client_reference_id || s.client_reference_id !== meta.user_id || !Number.isInteger(months) || months < 1 || months > 120) return null;
  return {
    id: s.id, userId: s.client_reference_id, months, amount: (s.amount_total ?? 0) / 100, currency: (s.currency ?? "").toUpperCase(),
    paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null),
  };
}

/** Adds the paid months to the account, once per session however often it is reported. */
async function grant(p: Paid): Promise<"granted" | "known" | "no_account"> {
  return db().begin(async (tx) => {
    const [u] = await tx`select id from users where id = ${p.userId} for update`;
    if (!u) return "no_account" as const; // deleted between paying and the webhook: nothing to grant, the payment stays with Stripe
    const added = await tx`insert into premium_payments (id, user_id, months, amount, currency, payment_intent)
                           values (${p.id}, ${p.userId}, ${p.months}, ${p.amount}, ${p.currency}, ${p.paymentIntent}) on conflict (id) do nothing`;
    if (!added.count) return "known" as const;
    // like an approved contract (server/userCars.ts): on top of what is still running
    await tx`update users set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(months => ${p.months}) where id = ${p.userId}`;
    return "granted" as const;
  });
}

/** A payment refunded in full: its months go, what the account's other payments and contracts give stays. */
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
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const paid = paidSession(object as CheckoutSession);
      if (paid) await grant(paid);
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
    if (user && paymentsConfigured()) {
      try {
        payments = await db()`select paid_at, months, amount, currency, refunded_at from premium_payments where user_id = ${user.id} order by paid_at desc`;
      } catch (err) {
        console.error("premium_payments (npm run db:migrate?)", err);
      }
    }
    return sendJson(res, 200, { offer, payments });
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
    const [u] = await db()<{ email: string | null }[]>`select email from users where id = ${user.id}`;
    try {
      const session = await stripe<CheckoutSession>("POST", "/checkout/sessions", {
        mode: "payment",
        "line_items[0][price]": priceId(),
        "line_items[0][quantity]": "1",
        client_reference_id: user.id,
        "metadata[product]": PRODUCT,
        "metadata[user_id]": user.id,
        "metadata[months]": String(offer.months),
        success_url: returnUrl(base, back),
        cancel_url: base + back,
        locale: english ? "en" : "de",
        "custom_text[submit][message]": english
          ? `${offer.months} months of Carbay Premium for your account. One payment, no subscription: it does not renew by itself.`
          : `${offer.months} Monate Carbay Premium für Ihr Konto. Einmalige Zahlung, kein Abo: Es verlängert sich nicht von selbst.`,
        ...(u?.email ? { customer_email: u.email } : {}),
        // the buyer must accept the terms linked in the Stripe account (Settings → Public details) before paying
        ...(process.env.STRIPE_REQUIRE_TERMS === "1" ? { "consent_collection[terms_of_service]": "required" } : {}),
        ...(process.env.STRIPE_AUTOMATIC_TAX === "1" ? { "automatic_tax[enabled]": "true" } : {}),
        ...(process.env.STRIPE_PROMO_CODES === "1" ? { allow_promotion_codes: "true" } : {}),
      });
      if (!session.url) throw new Error("no url");
      return sendJson(res, 200, { url: session.url });
    } catch (err) {
      console.error("stripe checkout", err);
      return sendJson(res, 502, { error: "stripe" });
    }
  }

  if (url.pathname === "/api/premium/bestaetigen") {
    const id = typeof body.session === "string" ? body.session : "";
    if (!/^cs_[A-Za-z0-9_]{8,250}$/.test(id)) return sendJson(res, 400, { error: "session" });
    let session: CheckoutSession;
    try {
      session = await stripe<CheckoutSession>("GET", `/checkout/sessions/${id}`);
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
