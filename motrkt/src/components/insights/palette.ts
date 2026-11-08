/** Distinct chart colours per brand (the emblem colours are too similar to tell apart in charts). */
export const BRAND_CHART_COLORS: Record<string, string> = {
  porsche: "#d4a24c",
  ferrari: "#e8615a",
};

export const SERIES_PALETTE = ["#d4a24c", "#5f8fd6", "#e8615a", "#4fc48c", "#c27cf0", "#e8b04a", "#6fd3d0", "#b9bec6", "#f08a5d", "#8fd14f"];

export const brandColor = (brandId: string) => BRAND_CHART_COLORS[brandId] ?? "#8b919b";

/** Diverging red/green cell colour for a change ratio, saturating at ±`cap`. */
export function divergingColor(ratio: number, cap = 0.06): string {
  const a = Math.min(1, Math.abs(ratio) / cap);
  if (Math.abs(ratio) < 0.001) return "rgba(139,145,155,0.12)";
  return ratio > 0 ? `rgba(79,196,140,${0.12 + a * 0.68})` : `rgba(232,97,90,${0.12 + a * 0.68})`;
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
