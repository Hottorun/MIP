import { describe, expect, it } from "vitest";
import { priceChangeOf } from "./listingHistory";

describe("priceChangeOf (asking-price tracking)", () => {
  it("is null without a change", () => {
    expect(priceChangeOf(undefined)).toBeNull();
    expect(priceChangeOf([["2026-11-01", 100000]])).toBeNull();
    expect(priceChangeOf([["2026-11-01", 100000], ["2026-11-05", 100200]])).toBeNull(); // below 0.5 %
  });
  it("measures the cut from the first to the latest price", () => {
    expect(priceChangeOf([["2026-11-01", 200000], ["2026-11-05", 190000], ["2026-11-09", 184000]])).toBeCloseTo(-0.08, 5);
    expect(priceChangeOf([["2026-11-01", 100000], ["2026-11-05", 105000]])).toBeCloseTo(0.05, 5);
  });
});
