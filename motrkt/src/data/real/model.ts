import data from "./market-model.json";

/**
 * Market model (scripts/market/model.py): German/European market value per variant from five kinds of evidence,
 * each converted to EUR at the ECB rate of its day:
 *  - EU_AUC  auction results and documented sales in Europe (the reference scale: what buyers in Europe actually paid)
 *  - EU_ASK  asking prices of cars for sale in Europe (Classic Trader; hand-recorded listings)
 *  - US_AUC  live auction results in North America (RM Sotheby's, Gooding, Broad Arrow …; hand-recorded US sales)
 *  - US_ONL  online auctions in North America (Bring a Trailer, Cars & Bids, PCARMARKET)
 *  - US_ASK  asking prices of dealers in the USA and Canada (hand-recorded)
 * The gap of each channel to European auction results is measured from variants that have both, and removed; how much
 * a channel can move a variant's value is capped by how much that gap varies between variants. The US channels share
 * one such cap, so all US evidence together cannot outweigh the European evidence beyond it.
 * A value is published only with at least `minN` records; otherwise the variant shows its individual records only.
 */

type RawEntry = {
  value: number | null;
  n: number;
  n12?: number;
  n24?: number;
  lo?: number | null;
  hi?: number | null;
  first?: string;
  last?: string;
  index: string;
  own?: boolean;
  houses?: Record<string, number>;
  gearbox?: Record<string, [number, number]>;
  body?: Record<string, [number, number]>;
  series?: number[] | null;
  family?: string;
  ch?: Partial<Record<Channel, number>>;
  share?: Partial<Record<Channel, number>>;
  chLevel?: Partial<Record<Channel, number>>;
  /** Records left out as implausible: deviation from the variant's level (0.65 = 65 % above). */
  out?: { id: string; eur: number; dev: number; ch: Channel }[];
};

export type Channel = "EU_AUC" | "EU_ASK" | "US_AUC" | "US_ONL" | "US_ASK";

/** Display order of the channels: European evidence first. */
export const CHANNEL_ORDER: Channel[] = ["EU_AUC", "EU_ASK", "US_AUC", "US_ONL", "US_ASK"];
const NO_CHANNELS: Record<Channel, number> = { EU_AUC: 0, EU_ASK: 0, US_AUC: 0, US_ONL: 0, US_ASK: 0 };

type Raw = {
  asOf: string;
  grid: number[];
  index: Record<string, number[]>;
  variants: Record<string, RawEntry>;
  total: number;
  sources: Record<string, number>;
  channels: Partial<Record<Channel, number>>;
  offsets: Record<string, Partial<Record<Channel, number>>>;
  scatter: Record<Channel, number>;
  bias: Record<Channel, number>;
  offsetPairs: Record<string, { pairs: Record<string, [number, number]>; own: boolean }>;
  minN: number;
};

const raw = data as unknown as Raw;

export type MarketBasis = {
  /** Market value today on the European transaction scale (EUR); null with fewer than MIN_RECORDS records. */
  value: number | null;
  /** Sales the value rests on (all years since 2015) and those of the last 12 / 24 months. */
  n: number;
  n12: number;
  n24: number;
  /** Middle half of the time-adjusted prices of the last three years. */
  lo: number | null;
  hi: number | null;
  first?: string;
  last?: string;
  /** true: own price trend (12+ sales); false: trend of the market segment. */
  own: boolean;
  segment: string;
  houses: Record<string, number>;
  /** Measured price effect against the median: [effect, number of sales]. */
  gearbox: Record<string, [number, number]>;
  body: Record<string, [number, number]>;
  /** Records per kind of evidence, their share of the value (precision weights) and their own level today. */
  channels: Record<Channel, number>;
  share: Partial<Record<Channel, number>>;
  level: Partial<Record<Channel, number>>;
  /** Measured offset of asking prices and US results against European auction results (log scale) for this family. */
  offsets: Record<Channel, number>;
  family: string;
};

export const SEGMENT_LABEL: Record<string, string> = {
  A: "356, 912 und 914",
  T: "Transaxle: 924, 944, 968 und 928",
  B: "Luftgekühlte 911 (930, 964, 993)",
  C: "Wassergekühlte 911",
  D: "911 GT- und Sondermodelle",
  E: "Boxster, Cayman und 718",
  E2: "Boxster, Cayman und 718 (GT- und Sondermodelle)",
  F: "Supersportwagen",
  G: "Rennwagen",
  H: "356 und luftgekühlte 911 über 250.000 €",
  COLLECT: "Klassiker und Rennwagen gesamt",
  MODERN: "Moderne Porsche gesamt",
};

export const MODEL_AS_OF = Date.parse(`${raw.asOf}T00:00:00Z`);
export const MODEL_SALES_TOTAL = raw.total;
export const MODEL_SOURCES = raw.sources;
export const MODEL_CHANNELS: Record<Channel, number> = { ...NO_CHANNELS, ...raw.channels };
export const MODEL_OFFSETS = raw.offsets;
export const MODEL_BIAS = raw.bias;
/** Per family: the pairwise channel gaps behind the offsets, as [log gap, number of variants compared]. */
export const MODEL_OFFSET_PAIRS = raw.offsetPairs;
/** Records a variant needs before a market value is published. */
export const MIN_RECORDS = raw.minN;

export function marketBasis(variantId: string): MarketBasis | undefined {
  const e = raw.variants[variantId];
  if (!e) return undefined;
  return {
    value: e.value,
    n: e.n,
    n12: e.n12 ?? 0,
    n24: e.n24 ?? 0,
    lo: e.lo ?? null,
    hi: e.hi ?? null,
    first: e.first,
    last: e.last,
    own: e.own ?? false,
    segment: e.index,
    houses: e.houses ?? {},
    gearbox: e.gearbox ?? {},
    body: e.body ?? {},
    channels: { ...NO_CHANNELS, ...e.ch },
    share: e.share ?? {},
    level: e.chLevel ?? {},
    offsets: { ...NO_CHANNELS, ...raw.offsets[e.family ?? "COLLECT"] },
    family: e.family ?? "COLLECT",
  };
}

/**
 * Auction results of a variant left out of the value because their price is implausibly far from comparable cars
 * (too high or too low; see OUT_K in model.py), by record id with the deviation (0.65 = 65 % above).
 */
export function outliersOf(variantId: string): Map<string, number> {
  return new Map((raw.variants[variantId]?.out ?? []).map((x) => [x.id, x.dev]));
}

/** Log-linear interpolation on the monthly grid. */
function interp(values: number[], t: number): number {
  const g = raw.grid;
  if (t <= g[0]) return values[0];
  if (t >= g[g.length - 1]) return values[values.length - 1];
  let lo = 0;
  let hi = g.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (g[mid] <= t) lo = mid;
    else hi = mid;
  }
  const a = (t - g[lo]) / (g[hi] - g[lo]);
  return Math.exp(Math.log(values[lo]) * (1 - a) + Math.log(values[hi]) * a);
}

export const MODEL_START = raw.grid[0];

/** Model value at time t; null for variants without a published value (too few records). */
export function modelValueAt(variantId: string, t: number): number | null {
  const e = raw.variants[variantId];
  if (!e?.series || !e.value) return null;
  return interp(e.series, t);
}

/** Cars built before the 964 (1989): condition, originality and history move the price far more than on younger cars. */
export const EARLY_CLASSIC_BEFORE = 1989;
/**
 * A value counts as clear only when the middle half of its records is narrower than this share of the value
 * and it rests on at least CLEAR_MIN_N records; mostly younger cars. Every other value is shown as approximate, with its range.
 */
const CLEAR_SPREAD = 0.25;
const CLEAR_MIN_N = 20;

/**
 * Typical price range (middle half of the records) for variants whose value is not clear-cut: early classics before the
 * 964, and any variant whose records scatter or are few. Scaled to the value shown (body style, current week). Null for clear values.
 */
export function valueSpread(variant: { id: string; years: [number, number | null] }, shown: number): { lo: number; hi: number } | null {
  const e = raw.variants[variant.id];
  if (!e?.value || !e.lo || !e.hi) return null;
  if (variant.years[0] >= EARLY_CLASSIC_BEFORE && (e.hi - e.lo) / e.value < CLEAR_SPREAD && e.n >= CLEAR_MIN_N) return null;
  return valueRange(variant, shown);
}

/** Typical price range (middle half of the records) of any measured variant, scaled to the value shown. */
export function valueRange(variant: { id: string }, shown: number): { lo: number; hi: number } | null {
  const e = raw.variants[variant.id];
  if (!e?.value || !e.lo || !e.hi || !(shown > 0)) return null;
  const k = shown / e.value;
  return { lo: e.lo * k, hi: e.hi * k };
}
