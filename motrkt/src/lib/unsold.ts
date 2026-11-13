import type { Sale } from "../data/types";
import { eur, saleAmount } from "./format";
import { t } from "../i18n";

/**
 * What is known about the price of an unsold auction lot: the house's estimate (RM Sotheby's, Gooding) or the highest
 * bid (Bring a Trailer). For display only: neither is a sale price, so neither enters the market value or any statistic.
 */
export function unsoldPrice(s: Pick<Sale, "price" | "estimateLow" | "estimateHigh" | "highBid" | "currency" | "priceOriginal">): string | null {
  if (s.price !== null) return null;
  if (s.estimateLow && s.estimateHigh) return t(`Schätzung ${eur(s.estimateLow)} – ${eur(s.estimateHigh)}`, `Estimate ${eur(s.estimateLow)} – ${eur(s.estimateHigh)}`);
  if (s.highBid) return t(`Höchstgebot ${eur(s.highBid)}`, `High bid ${saleAmount(s.highBid, s)}`);
  return null;
}
