import { getAllListings } from "./generate";
import { onRequestListings } from "./real/onRequest";
import type { Listing } from "./types";

/**
 * The cars Cartag offers for sale: the dealers we work with (Karero and Janzen Klassik), with and without a stated
 * price. Every place that shows or counts "for sale now" (buy page, variant page, search, co-pilot) reads this list,
 * so the numbers agree. The other tracked listings (Classic Trader, further dealers) stay in the data and keep feeding
 * the statistics (typical mileage, countries), but are not offered.
 */
export const SHOP_DEALERS = ["Karero", "Janzen Klassik"];
const DEALERS = new Set(SHOP_DEALERS);

let all: Listing[] | undefined;
let byVariant: Map<string, Listing[]> | undefined;

export function shopListings(): Listing[] {
  all ??= [...getAllListings().filter((l) => DEALERS.has(l.source)), ...onRequestListings()];
  return all;
}

export function shopListingsFor(variantId: string): Listing[] {
  if (!byVariant) {
    byVariant = new Map();
    for (const l of shopListings()) {
      const list = byVariant.get(l.variantId) ?? [];
      list.push(l);
      byVariant.set(l.variantId, list);
    }
  }
  return byVariant.get(variantId) ?? [];
}
