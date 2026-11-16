import { describe, expect, it } from "vitest";
import { parseReport } from "./userCars.ts";

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
  it("normalises the chassis number and trims text", () => {
    const { report } = parseReport({ ...valid, vin: " wp0 zzz 96 ", notes: "  hello  " }, "2026-11-16");
    expect(report.vin).toBe("WP0ZZZ96");
    expect(report.notes).toBe("hello");
  });
});
