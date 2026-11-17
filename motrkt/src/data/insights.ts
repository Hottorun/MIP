import { generationById, modelById, variantById, variants, genName, modelName } from "./db";
import { AS_OF, DAY, getSeries } from "./generate";
import { changeOver, cagrOver, generationIndex, getMetrics, median } from "./market";
import { realSales as realSalesByVariant, type RealSale } from "./real/sales";
import { MODEL_OFFSETS, marketBasis, modelValueAt } from "./real/model";
import type { Body } from "./types";

/**
 * Market-wide figures for the Insights page, computed from the real auction records (sales.csv) and the market model
 * at load time, so they follow every data update. Only what the records state well enough is used: sold or not, house,
 * date, venue, body style, mileage (about a third of the records) and the model's measured channel offsets.
 */

const YEAR = 365 * DAY;
const realSales: RealSale[] = [...realSalesByVariant.byVariant.values()].flat();
const ONLINE = new Set(["Bring a Trailer", "Cars & Bids", "Cars and Bids", "PCARMARKET"]);
const isOnline = (s: RealSale) => ONLINE.has(s.house);
const sold = (s: RealSale) => s.price !== null;
const yearOf = (t: number) => new Date(t).getUTCFullYear();

const memo = <T>(f: () => T) => {
  let v: T | undefined;
  return () => (v ??= f());
};

// ------------------------------------------------------------------------------------------------ auction market

export type YearRow = { year: number; lots: number; sold: number; online: number; sellThrough: number; onlineShare: number; partial: boolean };

/** Lots, sell-through rate and share of online auctions per calendar year. */
export const auctionYears = memo((): YearRow[] => {
  const by = new Map<number, { lots: number; sold: number; online: number }>();
  for (const s of realSales) {
    const y = yearOf(s.date);
    const r = by.get(y) ?? { lots: 0, sold: 0, online: 0 };
    r.lots++;
    if (sold(s)) r.sold++;
    if (isOnline(s)) r.online++;
    by.set(y, r);
  }
  const lastYear = yearOf(AS_OF);
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, r]) => ({ year, ...r, sellThrough: r.sold / r.lots, onlineShare: r.online / r.lots, partial: year === lastYear }));
});

export type Window = { lots: number; sellThrough: number; onlineShare: number };

function windowStats(from: number, to: number): Window {
  const xs = realSales.filter((s) => s.date > from && s.date <= to);
  return {
    lots: xs.length,
    sellThrough: xs.length ? xs.filter(sold).length / xs.length : 0,
    onlineShare: xs.length ? xs.filter(isOnline).length / xs.length : 0,
  };
}

/** The last 12 months against the 12 months before. */
export const auctionWindows = memo(() => ({ now: windowStats(AS_OF - YEAR, AS_OF), before: windowStats(AS_OF - 2 * YEAR, AS_OF - YEAR) }));

export type MonthCount = { end: number; now: number; before: number };

/**
 * The last 12 months in 12 equal slices (oldest first): how many lots matched `keep` in each, and in the same slice a
 * year earlier. The slices end at the data cut-off, so together they cover exactly the 12-month figures above.
 */
export function monthlyCounts(keep: (s: RealSale) => boolean): MonthCount[] {
  const step = YEAR / 12;
  const out: MonthCount[] = Array.from({ length: 12 }, (_, i) => ({ end: AS_OF - (11 - i) * step, now: 0, before: 0 }));
  for (const s of realSales) {
    const age = AS_OF - s.date;
    if (age < 0 || age >= 2 * YEAR || !keep(s)) continue;
    const k = Math.floor(age / step);
    if (k < 12) out[11 - k].now++;
    else out[23 - k].before++;
  }
  return out;
}

/** Auctioned lots per month over the last 12 months (all lots, as in auctionWindows). */
export const monthlyLots = memo(() => monthlyCounts(() => true));

export type HouseRow = { house: string; lots: number; sellThrough: number; online: boolean };

/** Sell-through rate of the auction houses with at least `min` lots in the last five years. */
export const houseStats = memo((): HouseRow[] => {
  const min = 150;
  const by = new Map<string, { lots: number; sold: number }>();
  for (const s of realSales) {
    if (s.date <= AS_OF - 5 * YEAR) continue;
    const r = by.get(s.house) ?? { lots: 0, sold: 0 };
    r.lots++;
    if (sold(s)) r.sold++;
    by.set(s.house, r);
  }
  return [...by.entries()]
    .filter(([, r]) => r.lots >= min)
    .map(([house, r]) => ({ house, lots: r.lots, sellThrough: r.sold / r.lots, online: ONLINE.has(house) }))
    .sort((a, b) => b.sellThrough - a.sellThrough);
});

/** Live (not online) auction lots per calendar month, averaged over the last five full years: the auction calendar. */
export const auctionCalendar = memo(() => {
  const last = yearOf(AS_OF) - 1;
  const first = last - 4;
  const counts = Array(12).fill(0) as number[];
  for (const s of realSales) {
    const d = new Date(s.date);
    const y = d.getUTCFullYear();
    if (y < first || y > last || isOnline(s)) continue;
    counts[d.getUTCMonth()]++;
  }
  return { months: counts.map((n) => n / 5), from: first, to: last };
});

// ------------------------------------------------------------------------------------------------ price factors

export type Band = { from: number; to: number | null; n: number; effect: number };
const BANDS = [0, 10_000, 30_000, 60_000, 100_000, 150_000];

/**
 * Price by mileage: each sold car's price against its variant's market value on the sale day, centred on the variant's
 * own median (so venue and variant level drop out), then the median per mileage band. Variants with fewer than 8 sales
 * with mileage are left out; bands with fewer than 80 cars are not shown.
 */
export const mileageBands = memo((): Band[] => {
  const byVariant = new Map<string, [number, number][]>();
  for (const s of realSales) {
    if (!sold(s) || !(s.mileage > 0)) continue;
    const v = modelValueAt(s.variantId, s.date);
    if (!v) continue;
    const l = byVariant.get(s.variantId) ?? [];
    l.push([s.mileage, Math.log(s.price! / v)]);
    byVariant.set(s.variantId, l);
  }
  const bands: number[][] = BANDS.map(() => []);
  for (const l of byVariant.values()) {
    if (l.length < 8) continue;
    const mid = median(l.map(([, r]) => r));
    for (const [km, r] of l) {
      let i = BANDS.length - 1;
      while (km < BANDS[i]) i--;
      bands[i].push(r - mid);
    }
  }
  return BANDS.map((from, i) => ({ from, to: BANDS[i + 1] ?? null, n: bands[i].length, effect: bands[i].length ? Math.exp(median(bands[i])) - 1 : 0 })).filter(
    (b) => b.n >= 80,
  );
});

/** How far US auction results sit above European ones for the same variant (the model's measured channel offsets). */
export const usPremium = memo(() => {
  const o = MODEL_OFFSETS as Record<string, Record<string, number>>;
  const f = (k: string, c: string) => (o[k]?.[c] !== undefined ? Math.exp(o[k][c]) - 1 : null);
  return { classicLive: f("COLLECT", "US_AUC"), modernLive: f("MODERN", "US_AUC"), classicOnline: f("COLLECT", "US_ONL"), modernOnline: f("MODERN", "US_ONL") };
});

/**
 * Median price effect of an open body (Cabriolet, Targa) against the coupé of the same variant, over the variants
 * where the model measured both (each at least 6 records).
 */
export const bodyPremium = memo(() => {
  const out: Partial<Record<Body, { effect: number; variants: number }>> = {};
  for (const body of ["Cabriolet", "Targa"] as Body[]) {
    const xs: number[] = [];
    for (const v of variants) {
      const b = v.measured ? marketBasis(v.id)?.body : undefined;
      if (b?.[body] && b.Coupé) xs.push((1 + b[body]![0]) / (1 + b.Coupé[0]) - 1);
    }
    if (xs.length >= 8) out[body] = { effect: median(xs), variants: xs.length };
  }
  return out;
});

// ------------------------------------------------------------------------------------------------ groups

export type GroupRow = { id: string; label: string; href: string; variants: number; change12m: number; cagr5: number; value: number };

/** Market value index per model line (generation) with at least two measured variants. */
export const generationRows = memo((): GroupRow[] => {
  const rows: GroupRow[] = [];
  for (const g of generationById.values()) {
    const model = modelById.get(g.modelId)!;
    if (model.category === "motorsport") continue;
    const measured = g.variantIds.map((id) => variantById.get(id)!).filter((v) => v?.measured);
    if (measured.length < 2) continue;
    const idx = generationIndex(g.id);
    if (idx.length < 60) continue;
    const label = g.name !== model.name ? `${modelName(model)} (${genName(g)})` : modelName(model);
    rows.push({
      id: g.id,
      label,
      href: `/markt/${measured.sort((a, b) => getMetrics(b.id).value - getMetrics(a.id).value)[0].id}`,
      variants: measured.length,
      change12m: changeOver(idx, 52),
      cagr5: cagrOver(idx, 5),
      value: median(measured.map((v) => getMetrics(v.id).value)),
    });
  }
  return rows;
});

// ------------------------------------------------------------------------------------------------ top sellers

export type SellerRow = { id: string; sold: number; median: number; change12m: number };

/** Variants with the most sold auction lots in the last 12 months, and their share of all sold lots. */
export const topSellers = memo(() => {
  const from = AS_OF - YEAR;
  const prices = new Map<string, number[]>();
  let total = 0;
  for (const s of realSales) {
    if (!sold(s) || s.date <= from || s.date > AS_OF || !variantById.get(s.variantId)?.measured) continue;
    total++;
    const list = prices.get(s.variantId) ?? [];
    list.push(s.price!);
    prices.set(s.variantId, list);
  }
  const rows: SellerRow[] = [...prices.entries()]
    .map(([id, p]) => ({ id, sold: p.length, median: median(p), change12m: getMetrics(id).change12m }))
    .sort((a, b) => b.sold - a.sold);
  return { rows, total };
});

// ------------------------------------------------------------------------------------------------ hidden gems

export type GemRow = {
  id: string;
  value: number;
  /** market value relative to the long-term trend today, e.g. −0.12 = 12 % below */
  gap: number;
  change3m: number;
  /** long-term trend growth per year */
  trendPa: number;
  sold24: number;
  /** last five years, monthly: market value and trend */
  spark: { value: number; trend: number }[];
};

/**
 * Variants that look cheap against their own history: the market value lies at least 5 % below the long-term trend
 * (least-squares fit of the log value over the whole series), the trend itself points up, the last three months
 * were positive and at least six cars sold at auction in two years, so the reading rests on real prices.
 */
export const hiddenGems = memo((): GemRow[] => {
  const from24 = AS_OF - 2 * YEAR;
  const sold24 = new Map<string, number>();
  for (const s of realSales) if (sold(s) && s.date >= from24) sold24.set(s.variantId, (sold24.get(s.variantId) ?? 0) + 1);
  const out: GemRow[] = [];
  for (const v of variants) {
    if (!v.measured) continue;
    const n = sold24.get(v.id) ?? 0;
    if (n < 6) continue;
    const series = getSeries(v.id);
    if (series.length < 260) continue;
    const xs = series.map((p) => p.t / YEAR);
    const ys = series.map((p) => Math.log(p.value));
    const xm = xs.reduce((a, b) => a + b, 0) / xs.length;
    const ym = ys.reduce((a, b) => a + b, 0) / ys.length;
    const b = xs.reduce((acc, x, i) => acc + (x - xm) * (ys[i] - ym), 0) / Math.max(1e-9, xs.reduce((acc, x) => acc + (x - xm) ** 2, 0));
    const a = ym - b * xm;
    const trendAt = (t: number) => Math.exp(a + (b * t) / YEAR);
    const last = series[series.length - 1];
    const gap = last.value / trendAt(last.t) - 1;
    const m = getMetrics(v.id);
    if (gap > -0.05 || b <= 0 || m.change3m <= 0) continue;
    const recent = series.slice(-261);
    const spark = recent.filter((_, i) => i % 4 === 0 || i === recent.length - 1).map((p) => ({ value: p.value, trend: trendAt(p.t) }));
    out.push({ id: v.id, value: m.value, gap, change3m: m.change3m, trendPa: Math.exp(b) - 1, sold24: n, spark });
  }
  return out.sort((x, y) => x.gap - y.gap);
});
