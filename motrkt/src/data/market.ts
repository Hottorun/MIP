import { brandById, generationById, generations, modelById, variantById, variants } from "./db";
import { AS_OF, CONDITION_FACTOR, CONDITION_SCORE, WEEK, WEEKS, SERIES_START, getSales, getSeries } from "./generate";
import type { Holding, PricePoint, Sale, Variant } from "./types";
import { t } from "../i18n";
import { num } from "../lib/format";

/** Derived market metrics, indices and recommendations. */

export type RangeKey = "1M" | "6M" | "1J" | "5J" | "10J" | "Max";
export const RANGES: RangeKey[] = ["1M", "6M", "1J", "5J", "10J", "Max"];
/** Range buttons with labels in the current language (J = Jahr → Y = year). */
export const rangeOptions = (keys: RangeKey[] = RANGES) => keys.map((value) => ({ value, label: t(value, value.replace("J", "Y")) }));
const RANGE_WEEKS: Record<RangeKey, number> = { "1M": 5, "6M": 26, "1J": 52, "5J": 260, "10J": 520, Max: Infinity };

export function sliceRange<T extends { t: number }>(series: T[], range: RangeKey): T[] {
  const weeks = RANGE_WEEKS[range];
  if (!Number.isFinite(weeks)) return series;
  const from = AS_OF - weeks * WEEK;
  return series.filter((p) => p.t >= from);
}

export const last = (s: PricePoint[]) => s[s.length - 1]?.value ?? 0;

export function changeOver(series: PricePoint[], weeks: number): number {
  if (series.length < 2) return 0;
  const i = Math.max(0, series.length - 1 - weeks);
  return series[series.length - 1].value / series[i].value - 1;
}

export function cagrOver(series: PricePoint[], years: number): number {
  if (series.length < 2) return 0;
  const weeks = Math.min(series.length - 1, Math.round(years * 52));
  const ratio = series[series.length - 1].value / series[series.length - 1 - weeks].value;
  return ratio ** (52 / weeks) - 1;
}

export function volatility(series: PricePoint[], weeks = 52): number {
  const s = series.slice(-weeks - 1);
  if (s.length < 3) return 0;
  const rets = s.slice(1).map((p, i) => Math.log(p.value / s[i].value));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(52);
}

export function maxDrawdown(series: PricePoint[], weeks = 260): number {
  let peak = 0;
  let dd = 0;
  for (const p of series.slice(-weeks)) {
    peak = Math.max(peak, p.value);
    dd = Math.min(dd, p.value / peak - 1);
  }
  return dd;
}

export function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const mean = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

// ---------------------------------------------------------------------------------------------
// Indices (chain-linked, equal-weighted)

const indexCache = new Map<string, PricePoint[]>();

export function buildIndex(key: string, variantIds: string[]): PricePoint[] {
  const cached = indexCache.get(key);
  if (cached) return cached;
  const all = variantIds.map((id) => getSeries(id)).filter((s) => s.length);
  const byT = all.map((s) => new Map(s.map((p) => [p.t, p])));
  const out: PricePoint[] = [];
  let level = 100;
  for (let i = 0; i < WEEKS; i++) {
    const t = SERIES_START + i * WEEK;
    const prevT = t - WEEK;
    let sum = 0;
    let n = 0;
    let volume = 0;
    for (const m of byT) {
      const p = m.get(t);
      if (!p) continue;
      volume += p.volume;
      const prev = m.get(prevT);
      if (prev) {
        sum += p.value / prev.value;
        n++;
      }
    }
    if (n) level *= sum / n;
    if (n || out.length) out.push({ t, value: level, volume });
  }
  indexCache.set(key, out);
  return out;
}

export const generationIndex = (genId: string) =>
  buildIndex(`gen:${genId}`, generationById.get(genId)?.variantIds ?? []);
export const modelIndex = (modelId: string) =>
  buildIndex(`model:${modelId}`, variants.filter((v) => v.modelId === modelId).map((v) => v.id));
export const brandIndex = (brandId: string) =>
  buildIndex(`brand:${brandId}`, variants.filter((v) => v.brandId === brandId).map((v) => v.id));
export const marketIndex = () => buildIndex("market", variants.map((v) => v.id));

/** Rebase several series to 100 at the first common point of the range, for comparison charts. */
export function rebase(series: PricePoint[], from: number): { t: number; value: number }[] {
  const s = series.filter((p) => p.t >= from);
  if (!s.length) return [];
  const base = s[0].value;
  return s.map((p) => ({ t: p.t, value: (p.value / base) * 100 }));
}

// ---------------------------------------------------------------------------------------------
// Variant metrics

export type Momentum = "Stark" | "Moderat" | "Neutral" | "Schwach";
export type Recommendation = { label: "Kaufen" | "Halten" | "Beobachten"; code: "BUY" | "HOLD" | "WATCH"; score: number };

export type Metrics = {
  value: number;
  change1m: number;
  change3m: number;
  change6m: number;
  change12m: number;
  cagr5: number;
  vol1y: number;
  maxDD5: number;
  rarityScore: number;
  rarityPercentile: number;
  liquidity: number;
  avgPrice12m: number;
  medianMileage: number;
  avgCondition: number;
  momentum: Momentum;
  momentumScore: number;
  quarterlyVolume: number;
  auctionShare: number;
  sellThrough: number;
  premiumVsEstimate: number;
  sales12m: number;
  recommendation: Recommendation;
  thesis: string;
};

const metricsCache = new Map<string, Metrics>();

function momentumOf(change3m: number): [Momentum, number] {
  const annualised = (1 + change3m) ** 4 - 1;
  if (annualised > 0.12) return ["Stark", annualised];
  if (annualised > 0.04) return ["Moderat", annualised];
  if (annualised > -0.04) return ["Neutral", annualised];
  return ["Schwach", annualised];
}

export function momentumOfSeries(series: PricePoint[]) {
  return momentumOf(changeOver(series, 13));
}

function rarityOf(v: Variant) {
  const rarer = variants.filter((o) => o.production > v.production).length;
  const percentile = Math.round((rarer / (variants.length - 1)) * 100);
  const gen = generationById.get(v.generationId)!;
  const genTotal = gen.variantIds.reduce((s, id) => s + variantById.get(id)!.production, 0);
  const family = gen.variantIds.length > 1 ? 100 * (1 - v.production / genTotal) : percentile;
  return { percentile, score: Math.max(1, Math.min(99, Math.round(0.55 * percentile + 0.45 * family))) };
}

export function saleStats(sales: Sale[]) {
  const auctions = sales.filter((s) => s.source === "Auktion");
  const sold = auctions.filter((s) => s.price !== null);
  const premiums = sold
    .filter((s) => s.estimateLow && s.estimateHigh)
    .map((s) => s.price! / ((s.estimateLow! + s.estimateHigh!) / 2) - 1);
  return {
    auctionShare: sales.length ? auctions.length / sales.length : 0,
    sellThrough: auctions.length ? sold.length / auctions.length : 0,
    premiumVsEstimate: mean(premiums),
  };
}

export function getMetrics(variantId: string): Metrics {
  const cached = metricsCache.get(variantId);
  if (cached) return cached;
  const v = variantById.get(variantId)!;
  const series = getSeries(variantId);
  const sales = getSales(variantId);
  const yearAgo = AS_OF - 52 * WEEK;
  const sales12 = sales.filter((s) => s.date >= yearAgo);
  const sold12 = sales12.filter((s) => s.price !== null);
  const stats = saleStats(sales12);
  const quarterlyVolume = sales.length ? sales.length / 20 : 0;
  const change3m = changeOver(series, 13);
  const [momentum, momentumScore] = momentumOf(change3m);
  const rarity = rarityOf(v);
  const liquidity = Math.max(5, Math.min(99, Math.round(15 + 24 * Math.log10(1 + quarterlyVolume) + 45 * (stats.sellThrough - 0.7))));
  const cagr5 = cagrOver(series, 5);
  const vol1y = volatility(series);
  const maxDD5 = maxDrawdown(series);
  const value = last(series);
  const avg52 = mean(series.slice(-52).map((p) => p.value));

  const score =
    cagr5 * 2.6 +
    momentumScore * 0.9 +
    (rarity.score - 50) / 220 +
    (liquidity - 50) / 320 -
    Math.max(0, vol1y - 0.16) * 1.4 -
    Math.max(0, -maxDD5 - 0.2) * 0.6 +
    (avg52 / value - 1) * 0.8;
  const recommendation: Recommendation =
    score > 0.3 ? { label: "Kaufen", code: "BUY", score } : score > 0.12 ? { label: "Halten", code: "HOLD", score } : { label: "Beobachten", code: "WATCH", score };

  const m: Metrics = {
    value,
    change1m: changeOver(series, 4),
    change3m,
    change6m: changeOver(series, 26),
    change12m: changeOver(series, 52),
    cagr5,
    vol1y,
    maxDD5,
    rarityScore: rarity.score,
    rarityPercentile: rarity.percentile,
    liquidity,
    avgPrice12m: mean(sold12.map((s) => s.price!)),
    medianMileage: median(sales12.map((s) => s.mileage).filter((k) => k > 0)),
    avgCondition: mean(sales12.filter((s) => !s.conditionUnknown).map((s) => CONDITION_SCORE[s.condition])),
    momentum,
    momentumScore,
    quarterlyVolume,
    auctionShare: stats.auctionShare,
    sellThrough: stats.sellThrough,
    premiumVsEstimate: stats.premiumVsEstimate,
    sales12m: sales12.length,
    recommendation,
    // Built on read, so it follows the interface language.
    get thesis() {
      return buildThesis(v, m);
    },
  };
  metricsCache.set(variantId, m);
  return m;
}

function buildThesis(v: Variant, m: Metrics): string {
  const parts: string[] = [];
  const units = num(v.production);
  if (m.rarityScore >= 80) parts.push(t(`Hohe Seltenheit (${units} Stück)`, `Very rare (${units} built)`));
  else if (m.rarityScore >= 55) parts.push(t(`Begrenzte Stückzahl (${units} Stück)`, `Limited production (${units} built)`));
  else parts.push(t(`Breite Basis (${units} Stück), gute Vergleichbarkeit`, `Large production (${units} built), easy to compare`));
  if (m.momentum === "Stark") parts.push(t("starke Nachfrage", "strong demand"));
  else if (m.momentum === "Moderat") parts.push(t("solide Nachfrage", "solid demand"));
  else if (m.momentum === "Schwach") parts.push(t("aktuell nachlassende Nachfrage", "demand currently easing"));
  if (m.cagr5 > 0.08) parts.push(t("überdurchschnittliche Wertentwicklung", "above-average value growth"));
  else if (m.cagr5 > 0.04) parts.push(t("stetige Wertentwicklung", "steady value growth"));
  if (m.liquidity >= 60) parts.push(t("liquider Markt", "liquid market"));
  else if (m.liquidity < 35) parts.push(t("dünner Markt mit längeren Verkaufszeiten", "thin market with longer selling times"));
  const tail =
    m.recommendation.code === "BUY"
      ? t("langfristig wertstabil.", "holds its value over the long run.")
      : m.recommendation.code === "HOLD"
        ? t("Bestand halten, Zukauf nur unter Marktwert.", "hold, only add below market value.")
        : t("Einstieg erst bei klarerem Trend.", "wait for a clearer trend before buying.");
  return `${parts.join(", ")} – ${tail}`;
}

/** Monthly changes for the last `months` months (oldest first), used by the trend heatmap. */
export function monthlyChanges(series: PricePoint[], months = 6): number[] {
  const out: number[] = [];
  for (let m = months - 1; m >= 0; m--) {
    const end = series.length - 1 - Math.round(m * 4.33);
    const start = end - 4;
    if (start < 0) out.push(0);
    else out.push(series[end].value / series[start].value - 1);
  }
  return out;
}

/** Yearly average index level plus long-run exponential trend — the "Marktzyklus" chart. */
export function cycleData(series: PricePoint[]) {
  const byYear = new Map<number, number[]>();
  for (const p of series) {
    const y = new Date(p.t).getUTCFullYear();
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(p.value);
  }
  const rows = [...byYear.entries()].map(([year, vals]) => ({ year, value: mean(vals) }));
  const base = rows[0]?.value ?? 1;
  const norm = rows.map((r) => ({ year: r.year, value: (r.value / base) * 100 }));
  // least-squares fit of log(value) ~ a + b·year
  const xs = norm.map((r) => r.year);
  const ys = norm.map((r) => Math.log(r.value));
  const xm = mean(xs);
  const ym = mean(ys);
  const b = xs.reduce((s, x, i) => s + (x - xm) * (ys[i] - ym), 0) / Math.max(1e-9, xs.reduce((s, x) => s + (x - xm) ** 2, 0));
  const a = ym - b * xm;
  return norm.map((r) => ({ ...r, trend: Math.exp(a + b * r.year) }));
}

/** Rough inflation factor from a launch year to today (German CPI approximation). */
export function inflationFactor(year: number): number {
  let f = 1;
  for (let y = year; y < new Date(AS_OF).getUTCFullYear(); y++) {
    f *= 1 + (y < 1975 ? 0.04 : y < 1995 ? 0.03 : y < 2021 ? 0.015 : y < 2024 ? 0.06 : 0.022);
  }
  return f;
}

// ---------------------------------------------------------------------------------------------
// Portfolio

export function holdingValue(h: Holding): number {
  return last(getSeries(h.variantId)) * CONDITION_FACTOR[h.condition];
}

export function holdingSeries(h: Holding): PricePoint[] {
  return getSeries(h.variantId)
    .filter((p) => p.t >= h.purchaseDate)
    .map((p) => ({ ...p, value: p.value * CONDITION_FACTOR[h.condition] }));
}

/** Weekly total portfolio value: purchase price is booked until the holding is in the series. */
export function portfolioSeries(holdings: Holding[]): PricePoint[] {
  if (!holdings.length) return [];
  const start = Math.min(...holdings.map((h) => h.purchaseDate));
  const out: PricePoint[] = [];
  for (let t = SERIES_START; t <= AS_OF; t += WEEK) {
    if (t < start) continue;
    let total = 0;
    for (const h of holdings) {
      if (h.purchaseDate > t) continue;
      const s = getSeries(h.variantId);
      const idx = Math.floor((t - s[0].t) / WEEK);
      total += idx >= 0 && idx < s.length ? s[idx].value * CONDITION_FACTOR[h.condition] : h.purchasePrice;
    }
    out.push({ t, value: total, volume: 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Convenience lookups for UI

export function topMovers(ids: string[], n = 3) {
  const rows = ids.map((id) => ({ id, change: getMetrics(id).change12m })).sort((a, b) => b.change - a.change);
  return { winners: rows.slice(0, n), losers: rows.slice(-n).reverse() };
}

export function familyVariantIds(variantId: string): string[] {
  const v = variantById.get(variantId)!;
  return variants.filter((o) => o.modelId === v.modelId).map((o) => o.id);
}

export function brandName(id: string) {
  return brandById.get(id)?.name ?? id;
}

export function modelName(id: string) {
  return modelById.get(id)?.name ?? id;
}

export const allGenerations = generations;
