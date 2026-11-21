import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { monthLater, paidInvoice, paidSession, plans, priceOffer, returnUrl, verifySignature, type CheckoutSession, type Invoice, type Offer } from "./payments.ts";

describe("priceOffer (what the Stripe price sells)", () => {
  it("takes a one-time price, twelve months unless its metadata says otherwise", () => {
    expect(priceOffer({ id: "price_1", active: true, type: "one_time", unit_amount: 4900, currency: "eur" })).toEqual({ amount: 49, currency: "EUR", months: 12, recurring: false });
    expect(priceOffer({ id: "price_1", type: "one_time", unit_amount: 990, currency: "chf", metadata: { months: "1" } })).toEqual({ amount: 9.9, currency: "CHF", months: 1, recurring: false });
    expect(priceOffer({ id: "price_1", type: "one_time", unit_amount: 4900, currency: "eur", metadata: { months: "viele" } })?.months).toBe(12);
  });
  it("takes a subscription price charged by month or year", () => {
    expect(priceOffer({ id: "price_1", active: true, type: "recurring", unit_amount: 990, currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } })).toEqual({ amount: 9.9, currency: "EUR", months: 1, recurring: true });
    expect(priceOffer({ id: "price_1", type: "recurring", unit_amount: 9900, currency: "eur", recurring: { interval: "year" } })).toMatchObject({ months: 12, recurring: true });
    expect(priceOffer({ id: "price_1", type: "recurring", unit_amount: 2500, currency: "eur", recurring: { interval: "month", interval_count: 3 } })).toMatchObject({ months: 3, recurring: true });
  });
  it("offers nothing for a price by week or usage, an inactive one or one without a fixed amount", () => {
    expect(priceOffer({ id: "price_1", active: true, type: "recurring", unit_amount: 300, currency: "eur", recurring: { interval: "week" } })).toBeNull();
    expect(priceOffer({ id: "price_1", active: true, type: "recurring", unit_amount: 300, currency: "eur", recurring: { interval: "month", usage_type: "metered" } })).toBeNull();
    expect(priceOffer({ id: "price_1", active: false, type: "one_time", unit_amount: 4900, currency: "eur" })).toBeNull();
    expect(priceOffer({ id: "price_1", active: true, type: "one_time", unit_amount: null, currency: "eur" })).toBeNull();
  });
});

describe("plans (what is on sale: one price, or a subscription by month and by year)", () => {
  const monthly: Offer = { amount: 9.9, currency: "EUR", months: 1, recurring: true };
  const yearly: Offer = { amount: 99, currency: "EUR", months: 12, recurring: true };
  const once: Offer = { amount: 49, currency: "EUR", months: 12, recurring: false };
  it("offers the yearly subscription next to a shorter one, the shorter first", () => {
    expect(plans(monthly, yearly)).toEqual([monthly, yearly]);
    expect(plans({ ...monthly, months: 3 }, yearly)).toHaveLength(2);
  });
  it("stays with the one price without a yearly one, and sells the yearly one alone", () => {
    expect(plans(monthly, null)).toEqual([monthly]);
    expect(plans(once, null)).toEqual([once]);
    expect(plans(null, yearly)).toEqual([yearly]);
    expect(plans(null, null)).toEqual([]);
  });
  it("leaves the yearly price out where it is not a second billing period of the same subscription", () => {
    expect(plans(once, yearly)).toEqual([once]); // a one-time purchase and a subscription are not one choice
    expect(plans(yearly, yearly)).toEqual([yearly]);
    expect(plans(monthly, { ...yearly, currency: "CHF" })).toEqual([monthly]);
    expect(plans(monthly, { ...yearly, months: 6 })).toEqual([monthly]); // not charged once a year
    expect(plans(monthly, once)).toEqual([monthly]);
    expect(plans(null, once)).toEqual([]);
  });
});

describe("monthLater (one month's notice)", () => {
  it("keeps the day of the month, or takes the month's last", () => {
    expect(monthLater(new Date("2027-03-15T10:00:00Z")).toISOString()).toBe("2027-04-15T10:00:00.000Z");
    expect(monthLater(new Date("2027-01-31T10:00:00Z")).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(monthLater(new Date("2027-12-31T10:00:00Z")).toISOString()).toBe("2028-01-31T10:00:00.000Z");
  });
});

describe("paidSession (which Checkout Sessions grant premium)", () => {
  const session: CheckoutSession = {
    id: "cs_test_a1", mode: "payment", status: "complete", payment_status: "paid", client_reference_id: "user-1", amount_total: 4900, currency: "eur",
    payment_intent: "pi_1", metadata: { product: "cartag_premium", user_id: "user-1", months: "12" },
  };
  it("reads account, months and amount from a paid session", () => {
    expect(paidSession(session)).toEqual({
      id: "cs_test_a1", userId: "user-1", months: 12, amount: 49, currency: "EUR", paymentIntent: "pi_1", customer: null, subscription: null, coversUntil: null,
    });
    expect(paidSession({ ...session, payment_intent: { id: "pi_2" } })?.paymentIntent).toBe("pi_2");
  });
  it("still accepts the mark from before the rename to Cartag", () => {
    expect(paidSession({ ...session, metadata: { ...session.metadata, product: "carbay_premium" } })?.userId).toBe("user-1");
    expect(paidSession({ ...session, metadata: { ...session.metadata, product: "other" } })).toBeNull();
  });
  it("counts a session a discount code paid for in full", () => {
    expect(paidSession({ ...session, payment_status: "no_payment_required", amount_total: 0, payment_intent: null })).toMatchObject({ amount: 0, paymentIntent: null });
  });
  it("grants nothing before the money is there (bank debit)", () => {
    expect(paidSession({ ...session, payment_status: "unpaid" })).toBeNull();
  });
  it("grants the first invoice of a subscription, under the invoice as the key", () => {
    const invoice: Invoice = { id: "in_1", status: "paid", customer: "cus_1", subscription: "sub_1", payment_intent: "pi_9", amount_paid: 990, currency: "eur", lines: { data: [{ period: { end: 1_800_000_000 } }] } };
    const sub: CheckoutSession = { ...session, mode: "subscription", payment_intent: null, customer: "cus_1", metadata: { ...session.metadata!, months: "1" }, invoice };
    expect(paidSession(sub)).toEqual({
      id: "in_1", userId: "user-1", months: 1, amount: 9.9, currency: "EUR", paymentIntent: "pi_9", customer: "cus_1", subscription: "sub_1", coversUntil: new Date(1_800_000_000_000),
    });
    expect(paidSession({ ...sub, invoice: "in_1" })).toBeNull(); // the invoice was not read with the session
    expect(paidSession({ ...sub, invoice: { ...invoice, status: "open" } })).toBeNull();
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

describe("paidInvoice (a paid invoice of a subscription)", () => {
  const invoice: Invoice = { id: "in_2", status: "paid", customer: { id: "cus_1" }, subscription: "sub_1", payment_intent: { id: "pi_3" }, amount_paid: 990, currency: "eur", lines: { data: [{ period: { end: 1_800_000_000 } }] } };
  it("covers the period the invoice paid for", () => {
    expect(paidInvoice(invoice, "user-1", 1)).toMatchObject({ id: "in_2", customer: "cus_1", subscription: "sub_1", paymentIntent: "pi_3", coversUntil: new Date(1_800_000_000_000) });
  });
  it("reads the subscription where newer API versions keep it", () => {
    expect(paidInvoice({ ...invoice, subscription: undefined, parent: { subscription_details: { subscription: "sub_7" } } }, "user-1", 1)?.subscription).toBe("sub_7");
  });
  it("takes the billing period from the invoice where it names one (a plan changed on the customer portal)", () => {
    const end = 1_800_000_000;
    const year = { period: { start: end - 365 * 86_400, end } };
    expect(paidInvoice({ ...invoice, lines: { data: [year] } }, "user-1", 1)?.months).toBe(12);
    expect(paidInvoice({ ...invoice, lines: { data: [{ period: { start: end - 31 * 86_400, end } }] } }, "user-1", 12)?.months).toBe(1);
    // a credit for the unused rest of the old plan next to the new year: the line that reaches furthest counts
    expect(paidInvoice({ ...invoice, lines: { data: [{ period: { start: end - 365 * 86_400, end: end - 350 * 86_400 } }, year] } }, "user-1", 1)).toMatchObject({ months: 12, coversUntil: new Date(end * 1000) });
    expect(paidInvoice(invoice, "user-1", 1)?.months).toBe(1); // no start of the period: as the subscription was started
  });
  it("grants nothing for an unpaid invoice, one without a subscription or without a period", () => {
    expect(paidInvoice({ ...invoice, status: "open" }, "user-1", 1)).toBeNull();
    expect(paidInvoice({ ...invoice, subscription: null }, "user-1", 1)).toBeNull();
    expect(paidInvoice({ ...invoice, lines: { data: [] } }, "user-1", 1)).toBeNull();
    expect(paidInvoice(invoice, "user-1", 0)).toBeNull();
  });
});

describe("returnUrl (the way back from Checkout)", () => {
  it("keeps the page, its query and its anchor, and leaves Stripe's placeholder unencoded", () => {
    expect(returnUrl("https://www.cartag.info", "/")).toBe("https://www.cartag.info/?premium=bezahlt&cs={CHECKOUT_SESSION_ID}");
    expect(returnUrl("https://www.cartag.info", "/markt/porsche-911-964-carrera-rs?thema=7#forum")).toBe(
      "https://www.cartag.info/markt/porsche-911-964-carrera-rs?thema=7&premium=bezahlt&cs={CHECKOUT_SESSION_ID}#forum",
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
