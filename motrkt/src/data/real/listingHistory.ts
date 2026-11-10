import data from "./listing-history.json";

/**
 * Every listing followed over time (scripts/market/track.py, runs with the daily update): first and last day seen,
 * asking-price changes and whether it has gone offline (sold or withdrawn). Keyed by listing URL.
 */
export type ListingHistory = {
  src: string;
  variant: string | null;
  cur: string;
  first: string;
  last: string;
  status: "active" | "gone";
  goneOn?: string;
  /** [day, price] at the first sighting and at each change of at least 1 %. */
  prices: [string, number][];
};

type Data = {
  summary: {
    asOf: string;
    days: Record<string, string[]>;
    tracked: number;
    active: number;
    gone: number;
    priceCuts: number;
    priceRaises: number;
    medianCut: number | null;
    goneMedianDaysOnline: number | null;
    goneMedianFirstToLast: number | null;
  };
  listings: Record<string, ListingHistory>;
};

const D = data as unknown as Data;

export const TRACKING = D.summary;

export function historyOf(url: string): ListingHistory | undefined {
  return url ? D.listings[url] : undefined;
}

/** Whole days between two ISO days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
