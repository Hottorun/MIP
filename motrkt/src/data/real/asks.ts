import data from "./asks.json";

/**
 * Asking prices of cars for sale in Europe that enter the market value (scripts/market/model.py): Classic Trader
 * listings and hand-recorded listings (mobile.de, Elferspot, Kleinanzeigen, dealers). One row per listing, dated the
 * last day it was seen, price as asked and converted to EUR.
 */
export type Ask = {
  id: string;
  variant: string;
  date: string;
  eur: number;
  price: number;
  cur: string;
  km: number | null;
  year: number;
  title: string;
  seller: string;
  sellerName: string | null;
  country: string;
  url: string;
  source: string;
};

const ALL = data as Ask[];
const byVariant = new Map<string, Ask[]>();
for (const a of ALL) {
  const l = byVariant.get(a.variant) ?? [];
  l.push(a);
  byVariant.set(a.variant, l);
}

export const ASKS_TOTAL = ALL.length;

/** Listings of a variant, highest price first. */
export function asksFor(variantId: string): Ask[] {
  return byVariant.get(variantId) ?? [];
}
