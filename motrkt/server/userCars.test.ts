import { describe, expect, it } from "vitest";
import { parseReport } from "./userCars.ts";
import { premiumFrom, premiumUntil } from "./premium.ts";

const valid = {
  role: "kauf", variant_id: "porsche-911-964-carrera-rs", build_year: 1992, vin: "WP0ZZZ96ZNS490123", km: 48000, price: 350000,
  currency: "EUR", sale_date: "2024-05-01", country: "DE", counterparty: "haendler", consent: true, notes: "x",
};

describe("parseReport (car report form)", () => {
  it("accepts a complete report", () => {
    const { report, errors } = parseReport(valid, "2026-11-16");
    expect(errors).toEqual({});
    expect(report.vin).toBe("WP0ZZZ96ZNS490123");
    expect(report.title).toBeTruthy();
  });
  it("flags every invalid field by name", () => {
    const { errors } = parseReport({ ...valid, role: "x", variant_id: "nope", build_year: 1900, vin: "!!", km: -1, price: 1, currency: "XXX", sale_date: "2099-01-01", country: "Deutschland", counterparty: "freund", consent: false }, "2026-11-16");
    expect(Object.keys(errors).sort()).toEqual(["build_year", "consent", "counterparty", "country", "currency", "km", "price", "role", "sale_date", "variant_id", "vin"]);
  });
  it("rejects a day that does not exist", () => {
    expect(parseReport({ ...valid, sale_date: "2024-02-31" }, "2026-11-16").errors).toEqual({ sale_date: "date" });
    expect(parseReport({ ...valid, sale_date: "2024-02-29" }, "2026-11-16").errors).toEqual({});
  });
  it("allows the AI pre-check only when the box was ticked", () => {
    expect(parseReport(valid, "2026-11-16").report.ai_consent).toBe(false);
    expect(parseReport({ ...valid, ai_consent: "yes" }, "2026-11-16").report.ai_consent).toBe(false);
    expect(parseReport({ ...valid, ai_consent: true }, "2026-11-16").report.ai_consent).toBe(true);
  });
  it("takes purchase contracts only: appraisals are no longer a way to premium", () => {
    expect(parseReport(valid, "2026-11-16").report.kind).toBe("kaufvertrag");
    expect(parseReport({ ...valid, kind: "kaufvertrag" }, "2026-11-16").errors).toEqual({});
    expect(parseReport({ ...valid, kind: "leasing" }, "2026-11-16").errors).toEqual({ kind: "kind" });
    expect(parseReport({ ...valid, kind: "gutachten", appraiser: "Classic Data", value_basis: "marktwert" }, "2026-11-16").errors).toEqual({ kind: "kind" });
  });
  it("stores nothing of an appraisal with a purchase contract", () => {
    const { report } = parseReport({ ...valid, appraiser: "Classic Data", value_basis: "marktwert" }, "2026-11-16");
    expect(report).not.toHaveProperty("appraiser");
    expect(report).not.toHaveProperty("value_basis");
  });
  it("normalises the chassis number and trims text", () => {
    const { report } = parseReport({ ...valid, vin: " wp0 zzz 96 ", notes: "  hello  " }, "2026-11-16");
    expect(report.vin).toBe("WP0ZZZ96");
    expect(report.notes).toBe("hello");
  });
});

describe("premiumFrom (premium left after a report is removed)", () => {
  const d = (iso: string) => new Date(iso + "T00:00:00Z");
  it("is none without an approved car and twelve months from one approval", () => {
    expect(premiumFrom([])).toBeNull();
    expect(premiumFrom([d("2026-03-10")])).toEqual(d("2027-03-10"));
  });
  it("adds to premium still running and starts again after a gap", () => {
    expect(premiumFrom([d("2026-03-10"), d("2026-06-01")])).toEqual(d("2028-03-10"));
    expect(premiumFrom([d("2024-01-01"), d("2026-06-01")])).toEqual(d("2027-06-01"));
  });
  it("counts payments with their own length, whatever order they come in", () => {
    expect(premiumFrom([{ at: d("2026-03-10"), months: 1 }])).toEqual(d("2026-04-10"));
    // a payment in June on top of an approval in March: the twelve months start when the first twelve end
    expect(premiumFrom([{ at: d("2026-06-01"), months: 12 }, d("2026-03-10")])).toEqual(d("2028-03-10"));
    expect(premiumFrom([d("2026-03-10"), { at: d("2026-06-01"), months: 3 }])).toEqual(d("2027-06-10"));
  });
});

describe("premiumUntil (grants and subscription periods together)", () => {
  const d = (iso: string) => new Date(iso + "T00:00:00Z");
  it("keeps premium three days past the latest period a subscription paid for", () => {
    expect(premiumUntil([], [d("2026-12-20"), d("2027-01-20")])).toEqual(d("2027-01-23"));
    expect(premiumUntil([], [])).toBeNull();
  });
  it("takes the later of the two: a contract's months do not add to a subscription", () => {
    expect(premiumUntil([d("2026-03-10")], [d("2026-12-20")])).toEqual(d("2027-03-10"));
    expect(premiumUntil([d("2026-03-10")], [d("2027-06-20")])).toEqual(d("2027-06-23"));
  });
});
