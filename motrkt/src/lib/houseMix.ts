import type { Sale } from "../data/types";

export const BAT = "Bring a Trailer";
const WINDOW = 3 * 365 * 86_400_000;

/**
 * For display only: the newest `n` sales, with Bring a Trailer on at most `share` of the places. Bring a Trailer sells
 * far more Porsches than any other house, so a plain "newest first" list shows little else. Places it may not take go to
 * the next sales of other houses, newest first, but none more than three years older than the newest sale shown; if
 * there are not enough of those, Bring a Trailer fills them after all. The result is in date order again.
 * Data, market value and statistics are not affected.
 */
export function mixHouses<S extends Pick<Sale, "house" | "date">>(sales: S[], n: number, share = 1 / 3): S[] {
  if (sales.length <= n) return sales;
  const maxBat = Math.max(1, Math.floor(n * share));
  const newest = Math.max(...sales.slice(0, n).map((s) => s.date));
  const out: S[] = [];
  const skipped: S[] = [];
  let bat = 0;
  for (const s of sales) {
    if (out.length >= n) break;
    if (s.house !== BAT) {
      if (newest - s.date > WINDOW) continue;
      out.push(s);
    } else if (bat < maxBat) {
      out.push(s);
      bat++;
    } else skipped.push(s);
  }
  for (const s of skipped) {
    if (out.length >= n) break;
    out.push(s);
  }
  // still short (old other-house sales beyond the window): the plain newest list
  if (out.length < n) return sales.slice(0, n);
  return out.sort((a, b) => b.date - a.date);
}
