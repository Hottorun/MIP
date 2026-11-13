import { isEn, locale } from "../i18n";
import model from "../data/real/market-model.json";

/**
 * Formatting helpers in the current language: German (de-DE) "€ 378.000", "+12,4 %", "14. Sep. 2025";
 * English (en-GB) "$420,000" (converted, see toDisplay), "+12.4%", "14 Sept 2025".
 */

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(digits: number) {
  const key = `${locale()}:${digits}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f;
}
const eur0 = { format: (v: number) => nf(0).format(v) };

/**
 * Display currency: euros in German, US dollars in English. All amounts are stored in euros; the English app converts
 * them at the ECB rate of the market data's as-of day (market-model.json "fx"), and converts entered amounts back.
 */
const USD_PER_EUR: number | null = (model as { fx?: { USD?: number } }).fx?.USD ?? null;
const inUsd = () => isEn() && USD_PER_EUR !== null;
/** Currency sign of the display currency. */
export const curSign = () => (inUsd() ? "$" : "€");
/** ECB rate used for dollars and its day, or null when the app shows euros. */
export const usdRate = (): { rate: number; date: string } | null =>
  inUsd() ? { rate: USD_PER_EUR!, date: (model as { fx?: { date?: string } }).fx?.date ?? "" } : null;

/**
 * Euro amount in the display currency. A converted amount keeps the roundness of the euro amount
 * (a value rounded to thousands stays rounded to thousands), so converted figures don't look more precise than they are.
 */
export function toDisplay(eurValue: number): number {
  if (!inUsd()) return eurValue;
  const v = eurValue * USD_PER_EUR!;
  let step = 1;
  while (step < 1000 && eurValue !== 0 && Math.round(eurValue) % (step * 10) === 0) step *= 10;
  return Math.round(v / step) * step;
}
/** A sale's own dollar price when the app shows dollars and the sale was in dollars (no round trip through euros). */
export const ownUsd = (s: { currency?: string; priceOriginal?: number | null }): number | null =>
  inUsd() && s.currency === "USD" && s.priceOriginal ? s.priceOriginal : null;
/** A sale's price or high bid (given in euros) as text, in the sale's own dollars where that applies. */
export function saleAmount(eurValue: number, s: { currency?: string; priceOriginal?: number | null }): string {
  const own = ownUsd(s);
  return own !== null ? "$" + nf(0).format(Math.round(own)) : eur(eurValue);
}

/** Amount entered in the display currency, in euros (for storing and filtering). */
export const fromDisplay = (shown: number): number => (inUsd() ? shown / USD_PER_EUR! : shown);

/** Round to three significant digits (106.432 → 106.000, 2.327.073 → 2.330.000) – for estimates and ranges. */
export function roundValue(value: number): number {
  const abs = Math.abs(value);
  if (abs < 1000) return Math.round(value);
  const step = 10 ** (Math.floor(Math.log10(abs)) - 2);
  return Math.round(value / step) * step;
}

/** Amounts are always written out in full ("€ 2.330.000"), never abbreviated; `compact` rounds to three significant digits. */
export function eur(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  const shown = toDisplay(value);
  const v = opts.compact ? roundValue(shown) : Math.round(shown);
  return `${v < 0 ? "−" : ""}${curSign()}${isEn() ? "" : " "}${eur0.format(Math.abs(v))}`;
}

/** Digits of an amount without the currency sign ("2.330.000"), for the typeset <Money> component. */
export function amount(value: number, opts: { compact?: boolean } = {}): string {
  const shown = toDisplay(value);
  const v = opts.compact ? roundValue(shown) : Math.round(shown);
  return eur0.format(Math.abs(v));
}

export function num(value: number, digits = 0): string {
  return nf(digits).format(value);
}

export function km(value: number | null): string {
  if (!value) return "–";
  return `${eur0.format(Math.round(value))} km`;
}

/** Signed percentage from a ratio: 0.124 → "+12,4 %" (de) / "+12.4%" (en) */
export function pct(ratio: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const { signed = true, digits = 1 } = opts;
  if (!Number.isFinite(ratio)) return "–";
  const s = nf(digits).format(ratio * 100);
  return `${signed && ratio > 0 ? "+" : ""}${s.replace("-", "−")}${isEn() ? "" : " "}%`;
}

export function date(t: number, style: "short" | "medium" | "month" | "year" = "medium"): string {
  const d = new Date(t);
  if (style === "year") return String(d.getUTCFullYear());
  if (style === "month") return d.toLocaleDateString(locale(), { month: "short", year: "numeric", timeZone: "UTC" });
  if (style === "short") return d.toLocaleDateString(locale(), { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function trendClass(ratio: number): string {
  if (ratio > 0.0005) return "text-up";
  if (ratio < -0.0005) return "text-down";
  return "text-muted";
}

export function flag(iso: string): string {
  if (iso.length !== 2) return "";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** A price range in short form: "€ 95–140 Tsd." / "$106k–156k", "€ 1,2–1,6 Mio." / "$1.3m–1.8m". */
export function eurRange(loEur: number, hiEur: number): string {
  const en = isEn();
  const s = curSign();
  const lo = toDisplay(loEur), hi = toDisplay(hiEur);
  if (hi >= 1_000_000) {
    const f = (v: number) => nf(1).format(Math.round(v / 100_000) / 10);
    return en ? `${s}${f(lo)}m–${f(hi)}m` : `${s} ${f(lo)}–${f(hi)} Mio.`;
  }
  const k = (v: number) => nf(0).format(Math.round(v / 1000));
  return en ? `${s}${k(lo)}k–${k(hi)}k` : `${s} ${k(lo)}–${k(hi)} Tsd.`;
}
