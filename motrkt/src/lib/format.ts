import { isEn, locale } from "../i18n";

/**
 * Formatting helpers in the current language: German (de-DE) "€ 378.000", "+12,4 %", "14. Sep. 2025";
 * English (en-GB) "€378,000", "+12.4%", "14 Sept 2025".
 */

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(digits: number) {
  const key = `${locale()}:${digits}`;
  let f = fmtCache.get(key);
  if (!f) fmtCache.set(key, (f = new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })));
  return f;
}
const eur0 = { format: (v: number) => nf(0).format(v) };

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
  const v = opts.compact ? roundValue(value) : Math.round(value);
  return `${v < 0 ? "−" : ""}€${isEn() ? "" : " "}${eur0.format(Math.abs(v))}`;
}

/** Digits of an amount without the currency sign ("2.330.000"), for the typeset <Money> component. */
export function amount(value: number, opts: { compact?: boolean } = {}): string {
  const v = opts.compact ? roundValue(value) : Math.round(value);
  return eur0.format(Math.abs(v));
}

export function num(value: number, digits = 0): string {
  return nf(digits).format(value);
}

export function km(value: number): string {
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
