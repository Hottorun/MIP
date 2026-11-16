import { describe, expect, it } from "vitest";
import { generationQueries, mapAds, type MobileAd } from "./mobilede";

const ad = (over: Partial<MobileAd>): MobileAd => ({
  id: "1", url: "https://suchen.mobile.de/x", make: "Porsche", model: "911", title: "Porsche 911 Carrera RS", firstRegistration: "199203",
  mileage: 48000, price: 350000, currency: "EUR", color: "Weiß", exteriorColor: "WHITE", gearbox: "MANUAL_GEAR", powerKw: 191, vin: null,
  fullServiceHistory: true, accidentDamaged: false, previousOwners: 2, images: [], sellerName: "Händler", sellerType: "Händler", city: "Stuttgart",
  country: "DE", created: "2026-11-01T00:00:00Z", description: null, ...over,
});

describe("mobile.de mapping", () => {
  const q964 = generationQueries().find((q) => q.generationId.includes("964"))!;
  it("has one query per generation, all Porsche", () => {
    const qs = generationQueries();
    expect(qs.length).toBeGreaterThan(10);
    expect(qs.every((q) => q.make === "PORSCHE" && q.from <= q.to)).toBe(true);
    expect(q964).toBeTruthy();
  });
  it("assigns a 964 Carrera RS ad to the Carrera RS variant", () => {
    const [l] = mapAds(q964, [ad({})]);
    expect(l).toBeTruthy();
    expect(l.variantId).toBe("porsche-911-964-carrera-rs");
    expect(l.id).toBe("MDE-1");
    expect(l.source).toBe("mobile.de");
    expect(l.gearbox).toBe("Manual");
  });
  it("skips ads without a price and ads from the wrong years", () => {
    expect(mapAds(q964, [ad({ price: null })])).toHaveLength(0);
    expect(mapAds(q964, [ad({ firstRegistration: "201501" })])).toHaveLength(0);
  });
});
