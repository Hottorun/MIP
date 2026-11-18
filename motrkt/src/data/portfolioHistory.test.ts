import { describe, expect, it } from "vitest";
import { variants } from "./db";
import { AS_OF, WEEK } from "./generate";
import { holdingValue, portfolioHistory } from "./market";
import type { Holding } from "./types";

const measured = variants.find((v) => v.measured)!;
const holding = (purchaseDate: number, extra: Partial<Holding> = {}): Holding => ({
  id: "h",
  variantId: measured.id,
  purchasePrice: 100_000,
  purchaseDate,
  mileage: 50_000,
  condition: "2",
  color: "",
  note: "",
  ...extra,
});

describe("portfolioHistory", () => {
  it("shows a car bought today: its market value before the purchase, then one owned point", () => {
    const h = holding(AS_OF);
    const points = portfolioHistory([h]);
    const owned = points.filter((p) => p.value !== null);
    const before = points.filter((p) => p.value === null && p.before !== null);
    expect(owned).toHaveLength(1);
    expect(owned[0].cost).toBe(100_000);
    expect(owned[0].value).toBeCloseTo(holdingValue(h), 0);
    // the dotted curve runs up to the owned point and meets it there
    expect(before.length).toBeGreaterThan(50);
    expect(owned[0].before).toBe(owned[0].value);
  });

  it("counts each car from its purchase and has no earlier curve once the first purchase is at the start", () => {
    const early = holding(0, { id: "a" });
    const late = holding(AS_OF - 10 * WEEK, { id: "b", purchasePrice: 50_000 });
    const points = portfolioHistory([early, late]);
    expect(points.every((p) => p.value !== null)).toBe(true);
    expect(points.filter((p) => p.before !== null)).toHaveLength(0);
    expect(points[0].cost).toBe(100_000);
    expect(points[points.length - 1].cost).toBe(150_000);
  });

  it("is empty without holdings", () => {
    expect(portfolioHistory([])).toEqual([]);
  });
});
