import { describe, expect, it } from "vitest";
import { parseSalesCsv, TEMPLATE_CSV } from "./sales";

describe("parseSalesCsv (sales import)", () => {
  it("reads the template row without errors", () => {
    const r = parseSalesCsv(TEMPLATE_CSV, "Test");
    expect(r.errors).toEqual([]);
    expect(r.total).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].variantId).toBe("porsche-911-964-carrera-rs");
  });
  it("reports unknown variants instead of importing them", () => {
    const broken = TEMPLATE_CSV.replace("porsche-911-964-carrera-rs", "porsche-nicht-vorhanden");
    const r = parseSalesCsv(broken, "Test");
    expect(r.rows).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
