import { describe, expect, it } from "vitest";
import { cleanMatches, cleanScan, listingAddress, sourceAddress } from "./searchJobs.ts";
import type { ScanListing } from "./searchAgent.ts";
import { allowanceOf } from "./searchPayments.ts";

describe("sourceAddress (a dealer page entered by a reviewer)", () => {
  it("takes http(s) addresses on a public host name and names the host without www.", () => {
    expect(sourceAddress("https://www.haendler.de/bestand?marke=porsche#liste")).toEqual({ url: "https://www.haendler.de/bestand?marke=porsche", host: "haendler.de" });
    expect(sourceAddress("klassik.example.co.uk/cars")).toEqual({ url: "https://klassik.example.co.uk/cars", host: "klassik.example.co.uk" });
  });
  it("rejects everything that is not a public website", () => {
    for (const bad of ["", "nur text", "ftp://haendler.de/", "http://localhost/x", "https://127.0.0.1/", "https://user:pw@haendler.de/", "https://haendler.de:8443/", "javascript:alert(1)"]) {
      expect(sourceAddress(bad), bad).toBeNull();
    }
  });
});

describe("listingAddress (a link read from a dealer page)", () => {
  const source = { url: "https://www.haendler.de/bestand", host: "haendler.de" };
  it("keeps links on the dealer's site, resolving relative ones", () => {
    expect(listingAddress("/fahrzeug/993-turbo#fotos", source)).toBe("https://www.haendler.de/fahrzeug/993-turbo");
    expect(listingAddress("https://shop.haendler.de/a", source)).toBe("https://shop.haendler.de/a");
  });
  it("drops links to other sites and other schemes", () => {
    expect(listingAddress("https://boese.example/fahrzeug", source)).toBeNull();
    expect(listingAddress("https://haendler.de.boese.example/x", source)).toBeNull();
    expect(listingAddress("javascript:alert(1)", source)).toBeNull();
    expect(listingAddress(null, source)).toBeNull();
  });
});

const car = (o: Partial<ScanListing>): ScanListing => ({
  url: "https://www.haendler.de/a", title: "Porsche 911 Carrera", make: "Porsche", model: "911", year: 1995, mileage_km: 80_000, price: 120_000, currency: "eur", location: null,
  gearbox: null, body: null, color: null, image_url: null, sold: false, details: "", ...o,
});

describe("cleanScan (what Claude read from a page)", () => {
  const source = { url: "https://www.haendler.de/bestand", host: "haendler.de" };
  const scan = (listings: ScanListing[]) => cleanScan({ readable: true, complete: true, dealer_name: null, note: "", listings }, source);
  it("drops cars without a title or on another site, and figures out of range", () => {
    const out = scan([car({}), car({ url: "https://anderswo.example/b" }), car({ url: "/c", title: " " }), car({ url: "/d", year: 3000, mileage_km: -5, price: 12 })]);
    expect(out.map((l) => l.url)).toEqual(["https://www.haendler.de/a", "https://www.haendler.de/d"]);
    expect(out[0]).toMatchObject({ price: 120_000, currency: "EUR", year: 1995, km: 80_000 });
    expect(out[1]).toMatchObject({ price: null, currency: null, year: null, km: null });
  });
  it("tells apart several cars that share one page, and keeps a repeated car once", () => {
    const out = scan([car({ title: "911 Turbo" }), car({ title: "911 Targa" }), car({ title: "911 Targa" })]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map((l) => l.key)).size).toBe(2);
    expect(out.every((l) => l.key.startsWith("https://www.haendler.de/a#"))).toBe(true);
  });
  it("takes photos only over https", () => {
    const out = scan([car({ image_url: "http://www.haendler.de/a.jpg" }), car({ url: "/b", image_url: "/img/b.jpg" })]);
    expect(out.map((l) => l.image)).toEqual([null, "https://www.haendler.de/img/b.jpg"]);
  });
});

describe("cleanMatches (what Claude matched to an order)", () => {
  it("keeps matches that point at a candidate, once each, from a score of 50", () => {
    const out = cleanMatches(
      { summary: "", matches: [{ n: 2, score: 91, reason: "passt", concerns: "" }, { n: 2, score: 80, reason: "doppelt", concerns: "" }, { n: 9, score: 90, reason: "gibt es nicht", concerns: "" }, { n: 1, score: 30, reason: "zu schwach", concerns: "" }] },
      3,
    );
    expect(out).toEqual([{ n: 2, score: 91, reason: "passt", concerns: "" }]);
  });
});

describe("allowanceOf (search orders an account may run)", () => {
  it("lite includes none, premium three, and a subscription adds its orders to either", () => {
    expect(allowanceOf(false, 0)).toEqual({ premium: false, included: 0, extra: 0, allowed: 0 });
    expect(allowanceOf(false, 2)).toEqual({ premium: false, included: 0, extra: 2, allowed: 2 });
    expect(allowanceOf(true, 0)).toEqual({ premium: true, included: 3, extra: 0, allowed: 3 });
    expect(allowanceOf(true, 4)).toEqual({ premium: true, included: 3, extra: 4, allowed: 7 });
  });
});
