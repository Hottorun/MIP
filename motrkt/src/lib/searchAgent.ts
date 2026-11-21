import { locale, t } from "../i18n";

/** Client side of the search agent (server/searchApi.ts): the customer's search orders and the reviewers' sources. */

export type Match = {
  id: string;
  score: number;
  reason: string;
  concerns: string;
  matchedAt: string;
  isNew: boolean;
  url: string;
  title: string;
  year: number | null;
  km: number | null;
  price: number | null;
  currency: string | null;
  pricePrev: number | null;
  priceChangedAt: string | null;
  location: string | null;
  gearbox: string | null;
  body: string | null;
  color: string | null;
  image: string | null;
  details: string;
  firstSeenAt: string;
  gone: boolean;
  dealer: string;
};

export type Order = {
  id: string;
  title: string;
  query: string;
  variantId: string | null;
  variantTitle: string | null;
  priceMax: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  kmMax: number | null;
  active: boolean;
  createdAt: string;
  lastRunAt: string | null;
  /** queued or being analysed right now */
  running: boolean;
  /** switched on, but beyond the number of orders the account may run: it rests until a place is free */
  waiting: boolean;
  /** "quota": skipped by the last run for the same reason; anything else is that run's error */
  error: string | null;
  summary: string | null;
  summaryAt: string | null;
  matches: Match[];
};

/** How many orders the account may run: `included` with its plan (lite none, premium three), `extra` by subscription. */
export type Allowance = { premium: boolean; included: number; extra: number; allowed: number };
/** What one further order costs per billing period of `months` months (server/searchPayments.ts). */
export type Addon = { amount: number; currency: string; months: number; recurring: boolean };
export type AddonSubscription = { quantity: number; status: "active" | "ending" | "past_due"; until: string | null };
export type Orders = { plan: Allowance; addon: Addon | null; subscriptions: AddonSubscription[]; ai: boolean; sources: number; orders: Order[] };

/** The order form as typed; empty strings are "no limit". */
export type OrderDraft = { query: string; variantId: string; priceMax: string; yearFrom: string; yearTo: string; kmMax: string };
export const EMPTY_DRAFT: OrderDraft = { query: "", variantId: "", priceMax: "", yearFrom: "", yearTo: "", kmMax: "" };
export const draftOf = (o: Order): OrderDraft => ({
  query: o.query,
  variantId: o.variantId ?? "",
  priceMax: o.priceMax?.toString() ?? "",
  yearFrom: o.yearFrom?.toString() ?? "",
  yearTo: o.yearTo?.toString() ?? "",
  kmMax: o.kmMax?.toString() ?? "",
});

export type Source = {
  id: string;
  url: string;
  host: string;
  name: string;
  note: string;
  active: boolean;
  createdBy: string;
  createdAt: string;
  scannedAt: string | null;
  scanOk: boolean | null;
  scanError: string | null;
  scanNote: string | null;
  running: boolean;
  listings: number;
  gone: number;
};
export type Run = { id: string; kind: "source" | "order"; label: string; startedAt: string; seconds: number; ok: boolean; error: string | null; tokensIn: number; tokensOut: number; fetches: number; found: number; usd: number };
export type Admin = {
  ai: boolean;
  cron: boolean;
  model: string;
  orders: { active: number; users: number };
  usage: { runs: number; tokensIn: number; tokensOut: number; usd: number };
  sources: Source[];
  runs: Run[];
};
export type SourceListing = { id: string; url: string; title: string; year: number | null; km: number | null; price: number | null; currency: string | null; pricePrev: number | null; location: string | null; details: string; firstSeenAt: string; lastSeenAt: string; goneAt: string | null };

/** A dealer's asking price in the currency of the listing (not converted to the app's display currency). */
export function askingPrice(price: number | null, currency: string | null): string {
  if (price === null) return t("Preis auf Anfrage", "Price on request");
  if (!currency) return new Intl.NumberFormat(locale()).format(price);
  try {
    return new Intl.NumberFormat(locale(), { style: "currency", currency, maximumFractionDigits: 0 }).format(price);
  } catch {
    return `${new Intl.NumberFormat(locale()).format(price)} ${currency}`;
  }
}

/** "21. Nov., 06:12": day and time in the visitor's time zone. */
export const dayTime = (iso: string) => new Date(iso).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
