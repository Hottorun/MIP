import { describe, expect, it } from "vitest";
import { HOUSE_ADS, categoriesFor, pickAd, running, type Ad } from "./ads";

const partner = (over: Partial<Ad>): Ad => ({
  id: "p",
  category: "watches",
  partner: "Partner",
  headline: { de: "H", en: "H" },
  text: { de: "T", en: "T" },
  cta: { de: "C", en: "C" },
  href: "https://example.com",
  ...over,
});

describe("ads", () => {
  it("fits the page", () => {
    expect(categoriesFor("/markt/911-gt3")).toEqual(["watches", "automotive"]);
    expect(categoriesFor("/portfolio")).toEqual(["finance", "realestate"]);
    expect(categoriesFor("/")).toHaveLength(5);
    const ad = pickAd("/markt/x", 0, new Date(2026, 10, 21));
    expect(["watches", "automotive"]).toContain(ad?.category);
  });

  it("house ads carry no outside link or picture", () => {
    for (const a of HOUSE_ADS) {
      expect(a.href).toBeUndefined();
      expect(a.image).toBeUndefined();
    }
  });

  it("runs partner ads only within their dates, else the house ad", () => {
    const now = new Date(2026, 10, 21);
    expect(running(partner({ from: "2026-11-21", until: "2026-11-21" }), now)).toBe(true);
    expect(running(partner({ until: "2026-11-20" }), now)).toBe(false);
    expect(running(partner({ from: "2026-11-22" }), now)).toBe(false);
    const live = partner({ id: "live", from: "2026-11-01" });
    expect(pickAd("/markt/x", 0, now, [live])?.id).toBe("live");
    const over = partner({ id: "over", until: "2026-10-31" });
    expect(pickAd("/markt/x", 0, now, [over])?.id).toMatch(/^house-/);
    // a partner of another kind does not show on a model page
    expect(pickAd("/markt/x", 0, now, [partner({ id: "home", category: "realestate" })])?.id).toMatch(/^house-/);
  });

  it("stays put for a slot within a day and takes turns between neighbours", () => {
    const a = pickAd("/auktionen", 1, new Date(2026, 10, 21, 9));
    const b = pickAd("/auktionen", 1, new Date(2026, 10, 21, 9, 30));
    expect(a?.id).toBe(b?.id);
    const ids = [0, 1, 2].map((i) => pickAd("/auktionen", i, new Date(2026, 10, 21))?.id);
    expect(new Set(ids).size).toBe(3);
  });
});
