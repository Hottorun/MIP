import { brandById, paintsFor, variantById, variants } from "./db";
import type { AuctionEvent, Body, Condition, Gearbox, Listing, PricePoint, Sale, SaleSource, Variant } from "./types";
import { rng, type Rng } from "../lib/random";
import { realSalesFor } from "./real/sales";
import { MODEL_AS_OF, MODEL_START, marketBasis, modelValueAt } from "./real/model";

/** Synthetic but internally consistent market data, generated deterministically from the catalog. */

export const DAY = 86_400_000;
export const WEEK = 7 * DAY;
/** First week of the market model (auction results are collected from January 2015). */
export const SERIES_START = Date.UTC(2015, 0, 5);
/** "Today" for the dataset: the day the market model was last computed (scripts/market/update.sh runs daily). */
export const AS_OF = MODEL_AS_OF;
export const WEEKS = Math.round((AS_OF - SERIES_START) / WEEK) + 1;

const yearFrac = (t: number) => {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  return y + (t - Date.UTC(y, 0, 1)) / (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1));
};

// Broad collector-car market cycle (log level): 2014/15 boom, flat 2016–19, COVID dip,
// 2021/22 boom, 2023/24 correction, recovery since 2025.
const CYCLE: [number, number][] = [
  [2014.0, 0],
  [2015.6, 0.24],
  [2016.6, 0.26],
  [2018.0, 0.22],
  [2019.6, 0.2],
  [2020.3, 0.13],
  [2021.0, 0.2],
  [2022.7, 0.5],
  [2023.6, 0.44],
  [2024.4, 0.38],
  [2025.3, 0.42],
  [2026.9, 0.52],
];

function cycleAt(t: number) {
  const y = yearFrac(t);
  for (let i = 1; i < CYCLE.length; i++) {
    const [y1, v1] = CYCLE[i];
    const [y0, v0] = CYCLE[i - 1];
    if (y <= y1) return v0 + ((v1 - v0) * (y - y0)) / (y1 - y0);
  }
  return CYCLE[CYCLE.length - 1][1];
}

/** Auction-season seasonality: Arizona (Jan), Paris (Feb), Amelia (Mar), Monterey (Aug), Goodwood (Sep). */
function seasonality(t: number) {
  const doy = (yearFrac(t) % 1) * 365;
  const bump = (center: number, width: number, height: number) => height * Math.exp(-(((doy - center) / width) ** 2));
  return 0.8 + bump(22, 7, 0.9) + bump(36, 6, 0.6) + bump(68, 8, 0.4) + bump(228, 6, 1.1) + bump(256, 8, 0.3) - bump(358, 10, 0.3);
}

export function baseWeeklyVolume(v: Variant) {
  const damp = v.value > 200_000 ? (200_000 / v.value) ** 0.35 : 1;
  return Math.min(12, Math.max(0.04, (v.production ** 0.55 / 30) * damp));
}

export function launchTime(v: Variant) {
  return Date.UTC(v.years[0], 2, 1);
}

export function variantVolatility(v: Variant) {
  if (v.vol) return v.vol;
  const r = rng(`vol:${v.id}`);
  return 0.12 + 0.04 * Math.log10(v.value / 50_000) + (v.production < 3000 ? 0.025 : 0) + r.range(-0.015, 0.015);
}

const seriesCache = new Map<string, PricePoint[]>();

/** Weekly median-value series ending at `v.value` with the configured 5-year CAGR. */
/**
 * Market value and 5y trend implied by imported real sales (condition-normalised to "2+").
 * Value: median of sold prices in the last 24 months (≥ 3, outliers beyond 0.5–2× median dropped).
 * Trend: log-linear fit over the last 5 years when ≥ 8 sales span ≥ 3 years (shorter windows are too noisy and
 * get extrapolated over 5 years); otherwise null → the catalog's long-run CAGR is used.
 */
export function realAnchor(variantId: string): { value: number; cagr: number | null; n: number } | null {
  const norm = realSalesFor(variantId)
    .filter((s) => s.price !== null && s.date <= AS_OF)
    .map((s) => ({ date: s.date, p: s.conditionUnknown ? s.price! : s.price! / CONDITION_FACTOR[s.condition] }));
  const med = (xs: number[]) => {
    const a = [...xs].sort((x, y) => x - y);
    return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
  };
  const recentRaw = norm.filter((s) => s.date >= AS_OF - 104 * WEEK).map((s) => s.p);
  if (recentRaw.length < 3) return null;
  const m0 = med(recentRaw);
  const recent = recentRaw.filter((p) => p >= m0 * 0.5 && p <= m0 * 2);
  if (recent.length < 3) return null;
  const value = med(recent);

  const pts = norm
    .filter((s) => s.date >= AS_OF - 260 * WEEK && s.p >= value * 0.35 && s.p <= value * 2.5)
    .map((s) => ({ t: yearFrac(s.date), y: Math.log(s.p) }));
  let cagr: number | null = null;
  if (pts.length >= 8 && Math.max(...pts.map((p) => p.t)) - Math.min(...pts.map((p) => p.t)) >= 3) {
    const xm = pts.reduce((a, p) => a + p.t, 0) / pts.length;
    const ym = pts.reduce((a, p) => a + p.y, 0) / pts.length;
    const b = pts.reduce((a, p) => a + (p.t - xm) * (p.y - ym), 0) / pts.reduce((a, p) => a + (p.t - xm) ** 2, 0);
    cagr = Math.max(-0.1, Math.min(0.2, Math.exp(b) - 1));
  }
  return { value, cagr, n: recent.length };
}

/**
 * Weekly value series from the market model (auction results and asking prices). Volume = recorded sales in that week.
 * Variants without a published value (too few records) get no model series; the internal placeholder curve below only
 * feeds the demo listings and auctions and is never shown as a market value (`Variant.measured`).
 */
function modelSeries(v: Variant): PricePoint[] | null {
  const basis = marketBasis(v.id);
  if (!basis || (basis.n === 0 && realAnchor(v.id))) return null;
  const startIdx = Math.max(0, Math.ceil((Math.max(launchTime(v), MODEL_START) - SERIES_START) / WEEK));
  const perWeek = new Map<number, number>();
  for (const s of realSalesFor(v.id)) {
    if (s.price === null) continue;
    const k = Math.floor((s.date - SERIES_START) / WEEK);
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  const out: PricePoint[] = [];
  for (let i = startIdx; i < WEEKS; i++) {
    const t = SERIES_START + i * WEEK;
    const value = modelValueAt(v.id, t);
    if (value === null) return null;
    out.push({ t, value, volume: perWeek.get(i) ?? 0 });
  }
  return out.length ? out : null;
}

export function getSeries(variantId: string): PricePoint[] {
  const cached = seriesCache.get(variantId);
  if (cached) return cached;
  const v = variantById.get(variantId);
  if (!v) return [];
  const modelled = modelSeries(v);
  if (modelled) {
    seriesCache.set(variantId, modelled);
    return modelled;
  }
  const r = rng(`series:${v.id}`);
  const startIdx = Math.max(0, Math.ceil((launchTime(v) - SERIES_START) / WEEK));
  const n = WEEKS - startIdx;
  const modern = v.years[0] >= 2015;
  const beta = modern ? r.range(0.25, 0.5) : r.range(0.55, 1.35);
  const vol = variantVolatility(v);
  const s = (vol / Math.sqrt(52)) * 0.95;
  const phi = 0.9;

  const raw: number[] = new Array(n);
  let noise = r.normal(0, s * 2);
  for (let i = 0; i < n; i++) {
    const t = SERIES_START + (startIdx + i) * WEEK;
    noise = phi * noise + r.normal(0, s);
    raw[i] = beta * cycleAt(t) + noise;
  }
  const anchor = realAnchor(v.id);
  const endValue = anchor?.value ?? v.value;
  const cagr = anchor?.cagr ?? v.cagr;
  const w = Math.min(260, n - 1);
  const target = (w / 52) * Math.log(1 + cagr);
  const drift = w > 0 ? (target - (raw[n - 1] - raw[n - 1 - w])) / w : 0;
  const end = raw[n - 1] + drift * (n - 1);

  const base = baseWeeklyVolume(v);
  const out: PricePoint[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = SERIES_START + (startIdx + i) * WEEK;
    const value = endValue * Math.exp(raw[i] + drift * i - end);
    const lambda = base * seasonality(t) * r.range(0.75, 1.25) * (i < 26 && startIdx > 0 ? 0.4 : 1);
    out[i] = { t, value, volume: r.poisson(lambda) };
  }
  seriesCache.set(variantId, out);
  return out;
}

export function valueAt(series: PricePoint[], t: number): number {
  if (!series.length) return 0;
  if (t <= series[0].t) return series[0].value;
  const idx = Math.min(series.length - 1, Math.floor((t - series[0].t) / WEEK));
  return series[idx].value;
}

// ---------------------------------------------------------------------------------------------
// Transactions

export const CONDITIONS: Condition[] = ["1", "1-", "2+", "2", "2-", "3"];
export const CONDITION_FACTOR: Record<Condition, number> = { "1": 1.12, "1-": 1.05, "2+": 1.0, "2": 0.94, "2-": 0.88, "3": 0.78 };
export const CONDITION_SCORE: Record<Condition, number> = { "1": 1, "1-": 1.3, "2+": 1.7, "2": 2, "2-": 2.3, "3": 3 };
const CONDITION_WEIGHTS: Record<Condition, number> = { "1": 0.12, "1-": 0.22, "2+": 0.24, "2": 0.24, "2-": 0.12, "3": 0.06 };

export const AUCTION_HOUSES: { name: string; code: string; weight: number; premium: boolean }[] = [
  { name: "RM Sotheby's", code: "RMS", weight: 1.3, premium: true },
  { name: "Gooding & Co.", code: "GOO", weight: 0.9, premium: true },
  { name: "Bonhams", code: "BON", weight: 1.1, premium: true },
  { name: "Broad Arrow", code: "BRA", weight: 0.7, premium: true },
  { name: "Artcurial", code: "ART", weight: 0.6, premium: true },
  { name: "Dorotheum", code: "DOR", weight: 0.4, premium: false },
  { name: "Bring a Trailer", code: "BAT", weight: 1.4, premium: false },
  { name: "Collecting Cars", code: "COL", weight: 0.8, premium: false },
  { name: "Mecum", code: "MEC", weight: 0.7, premium: false },
];

const DEALERS: Record<string, string[]> = {
  porsche: ["Porsche Classic Partner", "Specialist Cars GmbH", "Rennsport Classics", "Nordwerk Automobile", "Elfer Garage München"],
};

const BUYER_WEIGHTS = { DE: 30, US: 25, GB: 12, CH: 8, JP: 5, NL: 5, AE: 5, FR: 4, IT: 3, BE: 3 };
const REST_EUROPE = ["CH", "FR", "IT", "NL", "BE", "AT", "SE"];
const MIDDLE_EAST = ["AE", "SA", "QA"];
export const MARKET_TO_ISO: Record<string, string> = { Deutschland: "DE", USA: "US", UK: "GB", Japan: "JP" };

export const COUNTRY_NAMES: Record<string, string> = {
  DE: "Deutschland",
  US: "USA",
  GB: "Großbritannien",
  CH: "Schweiz",
  JP: "Japan",
  NL: "Niederlande",
  AE: "VAE",
  FR: "Frankreich",
  IT: "Italien",
  BE: "Belgien",
  AT: "Österreich",
  SE: "Schweden",
  SA: "Saudi-Arabien",
  QA: "Katar",
};

const CITIES: Record<string, string[]> = {
  DE: ["München", "Hamburg", "Stuttgart", "Düsseldorf", "Berlin", "Frankfurt"],
  US: ["Los Angeles", "Miami", "New York", "Scottsdale", "Chicago"],
  GB: ["London", "Surrey", "Manchester"],
  CH: ["Zürich", "Genf", "Basel"],
  JP: ["Tokio", "Osaka"],
  NL: ["Amsterdam", "Utrecht"],
  AE: ["Dubai", "Abu Dhabi"],
  FR: ["Paris", "Lyon", "Monaco"],
  IT: ["Mailand", "Modena", "Rom"],
  BE: ["Brüssel", "Antwerpen"],
  AT: ["Wien", "Salzburg"],
  SE: ["Stockholm"],
  SA: ["Riad"],
  QA: ["Doha"],
};

const VIN_PREFIX: Record<string, string> = {
  porsche: "WP0ZZZ",
};
const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";

function makeVin(r: Rng, v: Variant, year: number) {
  let s = VIN_PREFIX[v.brandId] ?? "ZZZZZZ";
  const yearCode = "ABCDEFGHJKLMNPRSTVWXY123456789"[(year - 1980 + 30 * 10) % 30];
  s += VIN_CHARS[r.int(0, VIN_CHARS.length - 1)] + VIN_CHARS[r.int(0, VIN_CHARS.length - 1)] + "Z" + yearCode;
  s += VIN_CHARS[r.int(0, 22)];
  for (let i = 0; i < 6; i++) s += r.int(0, 9);
  return s;
}

export function deliveryCountry(r: Rng, v: Variant) {
  const weights: Record<string, number> = {};
  for (const m of v.markets) weights[m.country] = m.share;
  const market = r.weighted(weights);
  if (market === "Rest Europa") return r.pick(REST_EUROPE);
  if (market === "Naher Osten") return r.pick(MIDDLE_EAST);
  return MARKET_TO_ISO[market];
}

export function roundPrice(p: number) {
  const step = p >= 1_000_000 ? 10_000 : p >= 100_000 ? 1000 : 500;
  return Math.round(p / step) * step;
}

function typicalKmPerYear(v: Variant) {
  if (v.tags.includes("Rennwagen")) return 300;
  return v.tags.includes("Leichtbau") || v.value > 1_000_000 ? 2200 : v.value > 250_000 ? 3200 : 5000;
}

/** Cars are driven most in their first two decades; collectors barely add mileage afterwards. */
function expectedKm(v: Variant, age: number) {
  const perYear = typicalKmPerYear(v);
  return perYear * Math.min(age, 20) + perYear * 0.25 * Math.max(0, age - 20);
}

function mileageFor(r: Rng, v: Variant, buildYear: number, atYear: number) {
  const age = Math.max(0.5, atYear - buildYear);
  const km = expectedKm(v, age) * Math.exp(r.normal(0, 0.38));
  return Math.max(200, Math.min(240_000, Math.round(km / 100) * 100));
}

function mileageFactor(v: Variant, mileage: number, buildYear: number, atYear: number) {
  const typical = Math.max(500, expectedKm(v, Math.max(0.5, atYear - buildYear)));
  return Math.min(1.1, Math.max(0.85, 1 + 0.08 * (1 - mileage / typical)));
}

function buildYearFor(r: Rng, v: Variant) {
  const last = v.years[1] ?? new Date(AS_OF).getUTCFullYear();
  return r.int(v.years[0], last);
}

function paintFor(r: Rng, v: Variant) {
  const paints = paintsFor(v.brandId);
  if (r.chance(0.32)) return paints.find((p) => p.hex === v.color) ?? { name: "Sonderfarbe", hex: v.color };
  return r.pick(paints);
}

const salesCache = new Map<string, Sale[]>();
/** Invented transactions for variants without recorded sales: off. Only real, linked records are shown as sales. */
const SYNTHETIC_SALES = false;
export const SALES_WINDOW_START = AS_OF - 5 * 52 * WEEK;

/** All recorded transactions (auction results), newest first; empty when nothing is recorded. */
export function getSales(variantId: string): Sale[] {
  const cached = salesCache.get(variantId);
  if (cached) return cached;
  const v = variantById.get(variantId);
  if (!v) return [];
  const series = getSeries(variantId);
  const real = realSalesFor(variantId);
  if (real.length || !SYNTHETIC_SALES) {
    const out: Sale[] = real.map((s) => ({ ...s, trend: s.price === null ? 0 : s.price / valueAt(series, s.date) - 1 }));
    salesCache.set(variantId, out);
    return out;
  }
  const r = rng(`sales:${v.id}`);
  const brand = brandById.get(v.brandId)!;
  const auctionShare = Math.min(0.82, Math.max(0.3, 0.45 + 0.12 * Math.log10(v.value / 50_000) + r.range(-0.06, 0.06)));
  const houses = AUCTION_HOUSES.filter((h) => (v.value > 400_000 ? h.premium || h.code === "BAT" : true));
  const houseWeights = Object.fromEntries(houses.map((h) => [h.code, h.weight * (h.premium && v.value > 200_000 ? 1.6 : 1)]));
  const out: Sale[] = [];
  for (const p of series) {
    if (p.t < SALES_WINDOW_START) continue;
    for (let k = 0; k < p.volume; k++) {
      const date = Math.min(AS_OF, p.t + r.int(0, 6) * DAY);
      const atYear = new Date(date).getUTCFullYear();
      const buildYear = buildYearFor(r, v);
      const condition = r.weighted(CONDITION_WEIGHTS);
      const mileage = mileageFor(r, v, buildYear, atYear);
      const fair = p.value * CONDITION_FACTOR[condition] * mileageFactor(v, mileage, buildYear, atYear);
      const rawPrice = fair * Math.exp(r.normal(0, 0.055));
      const sourceRoll = r.next();
      const source: SaleSource = sourceRoll < auctionShare ? "Auktion" : sourceRoll < auctionShare + (1 - auctionShare) * 0.8 ? "Händler" : "Privat";
      let house: string;
      let code: string;
      let estimateLow: number | null = null;
      let estimateHigh: number | null = null;
      let price: number | null = roundPrice(rawPrice);
      if (source === "Auktion") {
        code = r.weighted(houseWeights);
        house = AUCTION_HOUSES.find((h) => h.code === code)!.name;
        const mid = fair * r.range(0.95, 1.05);
        estimateLow = roundPrice(mid * 0.9);
        estimateHigh = roundPrice(mid * 1.1);
        if (r.chance(0.12 + (rawPrice < estimateLow ? 0.4 : 0))) price = null;
      } else if (source === "Händler") {
        code = "HDL";
        house = r.pick(DEALERS[v.brandId]);
      } else {
        code = "PRV";
        house = "Privatverkauf";
      }
      const body = r.weighted(v.body as Record<Body, number>);
      const gearbox = r.weighted(v.gearbox as Record<Gearbox, number>);
      const paint = paintFor(r, v);
      out.push({
        id: `${code}-${String(atYear).slice(2)}-${String(r.int(1, 9999)).padStart(4, "0")}`,
        variantId: v.id,
        date,
        source,
        house,
        price,
        estimateLow,
        estimateHigh,
        condition,
        mileage,
        buyerCountry: r.weighted(BUYER_WEIGHTS),
        originCountry: r.chance(0.85) ? brand.country : r.pick(["US", "CH", "JP", "GB"]),
        deliveryCountry: deliveryCountry(r, v),
        body,
        gearbox,
        color: paint.name,
        vin: makeVin(r, v, buildYear),
        trend: price === null ? 0 : price / p.value - 1,
      });
    }
  }
  out.sort((a, b) => b.date - a.date);
  salesCache.set(variantId, out);
  return out;
}

let allSalesCache: Sale[] | null = null;
export function hasRealSales(variantId: string): boolean {
  return realSalesFor(variantId).length > 0;
}

export function getAllSales(): Sale[] {
  if (!allSalesCache) {
    allSalesCache = variants.flatMap((v) => getSales(v.id)).sort((a, b) => b.date - a.date);
  }
  return allSalesCache;
}

// ---------------------------------------------------------------------------------------------
// Listings (Inserate)

const listingsCache = new Map<string, Listing[]>();
const PRIVATE_NOTES = [
  "Aus Sammlungsauflösung, trockene Garagenlagerung.",
  "Zweite Hand, lückenlose Historie, alle Rechnungen vorhanden.",
  "Kürzlich großer Service, TÜV/H-Kennzeichen neu.",
  "Unfallfrei laut Vorbesitzer, Lackschichtdicke dokumentiert.",
];
const DEALER_NOTES = [
  "Fahrzeug aus deutscher Auslieferung, Scheckheft gepflegt, Gutachten Note {c}.",
  "Matching Numbers, umfangreiche Dokumentation inkl. Werkszertifikat.",
  "Frisch durchgesehen in unserer Werkstatt, Garantie optional.",
  "Seltene Farbkombination, Originallack weitgehend erhalten.",
];

export function getListings(variantId: string): Listing[] {
  const cached = listingsCache.get(variantId);
  if (cached) return cached;
  const v = variantById.get(variantId);
  if (!v) return [];
  const r = rng(`listings:${v.id}`);
  const series = getSeries(variantId);
  const value = series[series.length - 1].value;
  const count = Math.max(1, Math.min(36, Math.round(baseWeeklyVolume(v) * 6 + r.range(0, 3))));
  const brand = brandById.get(v.brandId)!;
  const out: Listing[] = [];
  const nowYear = new Date(AS_OF).getUTCFullYear();
  for (let i = 0; i < count; i++) {
    const year = buildYearFor(r, v);
    const condition = r.weighted(CONDITION_WEIGHTS);
    const mileage = mileageFor(r, v, year, nowYear);
    const sellerType = r.weighted({ Händler: 0.68, Privat: 0.24, Auktion: 0.08 });
    const premium = sellerType === "Händler" ? r.range(0.95, 1.12) : sellerType === "Privat" ? r.range(0.92, 1.08) : r.range(0.9, 1.04);
    const price = roundPrice(value * CONDITION_FACTOR[condition] * mileageFactor(v, mileage, year, nowYear) * premium * Math.exp(r.normal(0, 0.04)));
    const country = deliveryCountry(r, v);
    const paint = paintFor(r, v);
    const seller =
      sellerType === "Händler" ? r.pick(DEALERS[v.brandId]) : sellerType === "Auktion" ? r.pick(AUCTION_HOUSES).name : "Privatanbieter";
    const notes = sellerType === "Privat" ? PRIVATE_NOTES : DEALER_NOTES;
    out.push({
      id: `INS-${v.id.slice(0, 3).toUpperCase()}${String(r.int(10000, 99999))}`,
      variantId: v.id,
      title: `${brand.name} ${v.name}`,
      year,
      mileage,
      price,
      country,
      city: r.pick(CITIES[country] ?? ["–"]),
      seller,
      sellerType,
      condition,
      color: paint.name,
      colorHex: paint.hex,
      body: r.weighted(v.body as Record<Body, number>),
      gearbox: r.weighted(v.gearbox as Record<Gearbox, number>),
      vin: makeVin(r, v, year),
      listedAt: AS_OF - r.int(1, 150) * DAY,
      matchingNumbers: r.chance(0.8),
      serviceHistory: r.chance(0.75),
      description: r.pick(notes).replace("{c}", condition),
    });
  }
  out.sort((a, b) => b.listedAt - a.listedAt);
  listingsCache.set(variantId, out);
  return out;
}

let allListingsCache: Listing[] | null = null;
export function getAllListings(): Listing[] {
  allListingsCache ??= variants.flatMap((v) => getListings(v.id)).sort((a, b) => b.listedAt - a.listedAt);
  return allListingsCache;
}

// ---------------------------------------------------------------------------------------------
// Upcoming auctions

const EVENTS: Omit<AuctionEvent, "lots">[] = [
  { id: "bon-bond-street-26", house: "Bonhams", title: "The Bond Street Sale", city: "London", country: "GB", date: Date.UTC(2026, 11, 5) },
  { id: "rms-arizona-27", house: "RM Sotheby's", title: "Arizona", city: "Phoenix", country: "US", date: Date.UTC(2027, 0, 21) },
  { id: "goo-scottsdale-27", house: "Gooding & Co.", title: "Scottsdale Auctions", city: "Scottsdale", country: "US", date: Date.UTC(2027, 0, 22) },
  { id: "rms-paris-27", house: "RM Sotheby's", title: "Paris", city: "Paris", country: "FR", date: Date.UTC(2027, 1, 3) },
  { id: "art-retromobile-27", house: "Artcurial", title: "Rétromobile", city: "Paris", country: "FR", date: Date.UTC(2027, 1, 5) },
  { id: "bra-amelia-27", house: "Broad Arrow", title: "The Amelia Auction", city: "Amelia Island", country: "US", date: Date.UTC(2027, 2, 5) },
  { id: "dor-salzburg-27", house: "Dorotheum", title: "Klassische Fahrzeuge", city: "Salzburg", country: "AT", date: Date.UTC(2027, 2, 13) },
  { id: "bon-goodwood-27", house: "Bonhams", title: "Goodwood Members' Meeting", city: "Chichester", country: "GB", date: Date.UTC(2027, 3, 10) },
];

let eventsCache: AuctionEvent[] | null = null;
export function getAuctionEvents(): AuctionEvent[] {
  if (eventsCache) return eventsCache;
  eventsCache = EVENTS.map((e) => {
    const r = rng(`event:${e.id}`);
    const premium = AUCTION_HOUSES.find((h) => h.name === e.house)?.premium ?? false;
    const pool = variants.filter((v) => (premium ? v.value > 120_000 : v.value < 600_000) && v.years[0] < 2020);
    const n = r.int(10, 18);
    const used = new Set<string>();
    const lots: AuctionEvent["lots"] = [];
    for (let i = 0; i < n * 3 && lots.length < n; i++) {
      const v = r.pick(pool);
      if (used.has(v.id) && r.chance(0.7)) continue;
      used.add(v.id);
      const value = getSeries(v.id).at(-1)!.value * r.range(0.9, 1.12);
      const paint = paintFor(r, v);
      const year = buildYearFor(r, v);
      lots.push({
        lotNo: 101 + lots.length * 3 + r.int(0, 2),
        variantId: v.id,
        estimateLow: roundPrice(value * 0.9),
        estimateHigh: roundPrice(value * 1.1),
        year,
        mileage: mileageFor(r, v, year, 2026),
        color: paint.name,
        colorHex: paint.hex,
      });
    }
    lots.sort((a, b) => a.lotNo - b.lotNo);
    return { ...e, lots };
  });
  return eventsCache;
}
