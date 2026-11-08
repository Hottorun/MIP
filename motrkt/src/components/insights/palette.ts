/** Distinct chart colours per brand (the emblem colours are too similar to tell apart in charts). */
export const BRAND_CHART_COLORS: Record<string, string> = {
  porsche: "#8b6232",
  ferrari: "#9a3b2c",
};

export const SERIES_PALETTE = ["#8b6232", "#3f5e4a", "#9a3b2c", "#4d6378", "#6e4a63", "#b08a3e", "#4c7a73", "#8f8170", "#a5592f", "#6f7a3a"];

export const brandColor = (brandId: string) => BRAND_CHART_COLORS[brandId] ?? "#a38f77";

/** Diverging red/green cell colour for a change ratio, saturating at ±`cap`. */
export function divergingColor(ratio: number, cap = 0.06): string {
  const a = Math.min(1, Math.abs(ratio) / cap);
  if (Math.abs(ratio) < 0.001) return "rgba(163,143,119,0.15)";
  return ratio > 0 ? `rgba(79,107,58,${0.12 + a * 0.68})` : `rgba(154,59,44,${0.12 + a * 0.68})`;
}

/** Jan-1 ticks for time axes (every `step` years) so year labels never repeat. */
export function yearTicks(first: number, last: number): number[] {
  const y0 = new Date(first).getUTCFullYear() + 1;
  const y1 = new Date(last).getUTCFullYear();
  const span = y1 - y0 + 1;
  const step = span > 8 ? 2 : 1;
  const out: number[] = [];
  for (let y = y0; y <= y1; y += step) out.push(Date.UTC(y, 0, 1));
  return out;
}
