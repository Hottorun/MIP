/** Distinct chart colours per brand (the emblem colours are too similar to tell apart in charts). */
export const BRAND_CHART_COLORS: Record<string, string> = {
  porsche: "#8f6d33",
};

export const SERIES_PALETTE = ["#8f6d33", "#1f1d1a", "#8b847a", "#c4a76a", "#5c4a33", "#b8a07a", "#4a453e", "#d6c49d", "#6e5326", "#a39a8c"];

export const brandColor = (brandId: string) => BRAND_CHART_COLORS[brandId] ?? "#8b847a";

/** Diverging red/green cell colour for a change ratio, saturating at ±`cap`. */
export function divergingColor(ratio: number, cap = 0.06): string {
  const a = Math.min(1, Math.abs(ratio) / cap);
  if (Math.abs(ratio) < 0.001) return "rgba(139,132,122,0.15)";
  return ratio > 0 ? `rgba(61,107,64,${0.12 + a * 0.68})` : `rgba(163,58,43,${0.12 + a * 0.68})`;
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
