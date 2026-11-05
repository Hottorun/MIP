/** German-locale formatting helpers (de-DE): "€ 378.000", "+12,4 %", "14. Sep. 2025". */

const eur0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function eur(value: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "–";
  if (opts.compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `€ ${num1.format(value / 1_000_000)} Mio.`;
    if (abs >= 10_000) return `€ ${eur0.format(Math.round(value / 1000))}k`;
  }
  return `€ ${eur0.format(Math.round(value))}`;
}

export function num(value: number, digits = 0): string {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export function km(value: number): string {
  return `${eur0.format(Math.round(value))} km`;
}

/** Signed percentage from a ratio: 0.124 → "+12,4 %" */
export function pct(ratio: number, opts: { signed?: boolean; digits?: number } = {}): string {
  const { signed = true, digits = 1 } = opts;
  if (!Number.isFinite(ratio)) return "–";
  const s = new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio * 100);
  return `${signed && ratio > 0 ? "+" : ""}${s.replace("-", "−")} %`;
}

export function date(t: number, style: "short" | "medium" | "month" | "year" = "medium"): string {
  const d = new Date(t);
  if (style === "year") return String(d.getUTCFullYear());
  if (style === "month") return d.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" });
  if (style === "short") return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
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
