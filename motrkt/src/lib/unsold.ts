import type { Sale } from "../data/types";
import { eur, saleAmount } from "./format";
import { t } from "../i18n";

const R = { rounded: true };

/**
 * What is known about the price of an unsold auction lot: the house's estimate (RM Sotheby's, Gooding) or the highest
 * bid (Bring a Trailer). For display only: neither is a sale price, so neither enters the market value or any statistic.
 */
export function unsoldPrice(s: Pick<Sale, "price" | "estimateLow" | "estimateHigh" | "highBid" | "currency" | "priceOriginal">): string | null {
  if (s.price !== null) return null;
  if (s.estimateLow && s.estimateHigh) return t(`Schätzung ${estimateRange(s.estimateLow, s.estimateHigh)}`, `Estimate ${estimateRange(s.estimateLow, s.estimateHigh)}`);
  if (s.highBid) return t(`Höchstgebot ${eur(s.highBid, R)}`, `High bid ${saleAmount(s.highBid, s, R)}`);
  return null;
}

/** "400.000 € – 450.000 €", or one amount where low and high are the same (RM's asking price after the sale stands in for the estimate). */
export function estimateRange(low: number, high: number): string {
  return low === high ? eur(low, R) : `${eur(low, R)} – ${eur(high, R)}`;
}
