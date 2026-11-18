import { describe, expect, it } from "vitest";
import { PREMIUM_DATA, premiumActive, safeNext } from "./auth.ts";

describe("safeNext (sign-in redirect target)", () => {
  it("keeps paths on this site, with query and hash", () => {
    expect(safeNext("/markt/porsche-911-964-carrera-rs")).toBe("/markt/porsche-911-964-carrera-rs");
    expect(safeNext("/kaufen?preis_bis=80000&deals=1#top")).toBe("/kaufen?preis_bis=80000&deals=1#top");
  });
  it("falls back to / for anything that could leave the site", () => {
    for (const bad of [null, "", "https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/%09/x", "javascript:alert(1)", "markt"]) {
      const out = safeNext(bad);
      expect(out === "/" || out.startsWith("/%09")).toBe(true);
      expect(out).not.toMatch(/^\/[\/\\]/);
    }
    expect(safeNext("/\t/evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
  });
});

describe("premiumActive (who gets the premium features)", () => {
  const now = Date.UTC(2026, 10, 18);
  it("runs until premium_until, not a moment longer", () => {
    expect(premiumActive(new Date(now + 1000), false, now)).toBe(true);
    expect(premiumActive("2027-01-01T00:00:00Z", false, now)).toBe(true);
    expect(premiumActive(new Date(now), false, now)).toBe(false);
    expect(premiumActive(new Date(now - 1000), false, now)).toBe(false);
  });
  it("is off without a date and always on for reviewers", () => {
    expect(premiumActive(null, false, now)).toBe(false);
    expect(premiumActive(undefined, false, now)).toBe(false);
    expect(premiumActive(null, true, now)).toBe(true);
  });
});

describe("PREMIUM_DATA (data files a lite account must not get)", () => {
  it("covers the full model and the auction archive, in development and hashed", () => {
    for (const p of ["/data/market-model.json", "/data/sales.csv", "/data/market-model-0123456789ab.json", "/data/sales-0123456789ab.csv"]) expect(PREMIUM_DATA.test(p)).toBe(true);
  });
  it("leaves the lite copies and the listing files open", () => {
    for (const p of ["/data/market-model.lite.json", "/data/sales.lite.csv", "/data/market-model.lite-0123456789ab.json", "/data/sales.lite-0123456789ab.csv", "/data/asks.json", "/data/listing-history-0123456789ab.json", "/assets/index.js"])
      expect(PREMIUM_DATA.test(p)).toBe(false);
  });
});
