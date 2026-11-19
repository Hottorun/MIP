import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paidSession, priceOffer, returnUrl, verifySignature, type CheckoutSession } from "./payments.ts";

describe("priceOffer (what the Stripe price sells)", () => {
  it("takes a one-time price, twelve months unless its metadata says otherwise", () => {
    expect(priceOffer({ id: "price_1", active: true, type: "one_time", unit_amount: 4900, currency: "eur" })).toEqual({ amount: 49, currency: "EUR", months: 12 });
    expect(priceOffer({ id: "price_1", type: "one_time", unit_amount: 990, currency: "chf", metadata: { months: "1" } })).toEqual({ amount: 9.9, currency: "CHF", months: 1 });
    expect(priceOffer({ id: "price_1", type: "one_time", unit_amount: 4900, currency: "eur", metadata: { months: "viele" } })?.months).toBe(12);
  });
  it("offers nothing for a subscription price, an inactive one or one without a fixed amount", () => {
    expect(priceOffer({ id: "price_1", active: true, type: "recurring", unit_amount: 4900, currency: "eur" })).toBeNull();
    expect(priceOffer({ id: "price_1", active: false, type: "one_time", unit_amount: 4900, currency: "eur" })).toBeNull();
    expect(priceOffer({ id: "price_1", active: true, type: "one_time", unit_amount: null, currency: "eur" })).toBeNull();
  });
});

describe("paidSession (which Checkout Sessions grant premium)", () => {
  const session: CheckoutSession = {
    id: "cs_test_a1", mode: "payment", status: "complete", payment_status: "paid", client_reference_id: "user-1", amount_total: 4900, currency: "eur",
    payment_intent: "pi_1", metadata: { product: "carbay_premium", user_id: "user-1", months: "12" },
  };
  it("reads account, months and amount from a paid session", () => {
    expect(paidSession(session)).toEqual({ id: "cs_test_a1", userId: "user-1", months: 12, amount: 49, currency: "EUR", paymentIntent: "pi_1" });
    expect(paidSession({ ...session, payment_intent: { id: "pi_2" } })?.paymentIntent).toBe("pi_2");
  });
  it("counts a session a discount code paid for in full", () => {
    expect(paidSession({ ...session, payment_status: "no_payment_required", amount_total: 0, payment_intent: null })).toMatchObject({ amount: 0, paymentIntent: null });
  });
  it("grants nothing before the money is there (bank debit) or for a subscription", () => {
    expect(paidSession({ ...session, payment_status: "unpaid" })).toBeNull();
    expect(paidSession({ ...session, mode: "subscription" })).toBeNull();
  });
  it("ignores sessions of other products of the same Stripe account", () => {
    expect(paidSession({ ...session, metadata: { months: "12", user_id: "user-1" } })).toBeNull();
    expect(paidSession({ ...session, metadata: null })).toBeNull();
  });
  it("needs the account twice and a sane number of months", () => {
    expect(paidSession({ ...session, client_reference_id: "user-2" })).toBeNull();
    expect(paidSession({ ...session, client_reference_id: null })).toBeNull();
    expect(paidSession({ ...session, metadata: { ...session.metadata!, months: "0" } })).toBeNull();
    expect(paidSession({ ...session, metadata: { ...session.metadata!, months: "1.5" } })).toBeNull();
  });
});

describe("returnUrl (the way back from Checkout)", () => {
  it("keeps the page, its query and its anchor, and leaves Stripe's placeholder unencoded", () => {
    expect(returnUrl("https://carbay.app", "/")).toBe("https://carbay.app/?premium=bezahlt&cs={CHECKOUT_SESSION_ID}");
    expect(returnUrl("https://carbay.app", "/markt/porsche-911-964-carrera-rs?thema=7#forum")).toBe(
      "https://carbay.app/markt/porsche-911-964-carrera-rs?thema=7&premium=bezahlt&cs={CHECKOUT_SESSION_ID}#forum",
    );
  });
});

describe("verifySignature (Stripe webhook)", () => {
  const secret = "whsec_test";
  const body = Buffer.from('{"type":"checkout.session.completed"}');
  const now = 1_800_000_000_000;
  const sign = (t: number, b: Buffer = body, s = secret) => createHmac("sha256", s).update(`${t}.`).update(b).digest("hex");
  const t = now / 1000;
  it("accepts a fresh, correctly signed body", () => {
    expect(verifySignature(body, `t=${t},v1=${sign(t)}`, secret, now)).toBe(true);
    // Stripe sends several v1 while a secret is being rolled: one that fits is enough
    expect(verifySignature(body, `t=${t},v1=${"0".repeat(64)},v1=${sign(t)},v0=abc`, secret, now)).toBe(true);
  });
  it("rejects a changed body, another secret and a missing or malformed header", () => {
    expect(verifySignature(Buffer.from('{"type":"x"}'), `t=${t},v1=${sign(t)}`, secret, now)).toBe(false);
    expect(verifySignature(body, `t=${t},v1=${sign(t, body, "whsec_other")}`, secret, now)).toBe(false);
    expect(verifySignature(body, undefined, secret, now)).toBe(false);
    expect(verifySignature(body, `t=${t},v1=kurz`, secret, now)).toBe(false);
    expect(verifySignature(body, `v1=${sign(t)}`, secret, now)).toBe(false);
    expect(verifySignature(body, `t=${t},v1=${sign(t)}`, "", now)).toBe(false);
  });
  it("rejects an old request, however well signed (replay)", () => {
    const old = t - 301;
    expect(verifySignature(body, `t=${old},v1=${sign(old)}`, secret, now)).toBe(false);
  });
});
