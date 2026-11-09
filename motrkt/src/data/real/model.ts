import data from "./market-model.json";

/**
 * Market model built from real auction results (scripts/market: Bring a Trailer, RM Sotheby's, Gooding, Bonhams,
 * Broad Arrow, Artcurial). Per segment a robust time index (kernel-weighted medians of log prices), per variant a price
 * level relative to it and, with 12+ sales, a variant-specific drift (shrunk towards the index where sales are thin). Prices are converted to EUR at the ECB rate of
 * the sale day. See METHOD below for the wording shown in the app.
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
  series?: number[];
};

type Raw = { asOf: string; grid: number[]; index: Record<string, number[]>; variants: Record<string, RawEntry>; total: number; sources: Record<string, number> };

const raw = data as unknown as Raw;

export type MarketBasis = {
  /** Median market value today (EUR), null when no sale is recorded. */
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
};

export const SEGMENT_LABEL: Record<string, string> = {
  A: "356 und 912",
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
  };
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

/**
 * Model value at time t. Variants without own sales follow their segment index, scaled to `fallbackValue`
 * (the catalog estimate) – their level is an estimate, the shape is measured.
 */
export function modelValueAt(variantId: string, t: number, fallbackValue: number): number | null {
  const e = raw.variants[variantId];
  if (!e) return null;
  if (e.series && e.value) return interp(e.series, t);
  const idx = raw.index[e.index];
  if (!idx) return null;
  return fallbackValue * interp(idx.map((x) => Math.exp(x)), t);
}
