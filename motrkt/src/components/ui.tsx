import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import { cn, pct, trendClass } from "../lib/format";
import { brandById } from "../data/db";

export function Card({
  title,
  sub,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <h2 className="panel-title truncate">
            {title} {sub && <span className="panel-sub ml-1">{sub}</span>}
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 px-4 pb-4", !title && !actions && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Signed percentage with arrow, coloured by direction. */
export function Delta({ value, className, arrow = true, digits = 1 }: { value: number; className?: string; arrow?: boolean; digits?: number }) {
  const Icon = value > 0.0005 ? ArrowUpRight : value < -0.0005 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", trendClass(value), className)}>
      {arrow && <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />}
      {pct(value, { digits })}
    </span>
  );
}

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "up" | "down" | "gold" | "neutral" | "warn"; className?: string }) {
  const tones = {
    up: "bg-up/12 text-up border-up/30",
    down: "bg-down/12 text-down border-down/30",
    gold: "bg-gold/12 text-gold-2 border-gold/35",
    warn: "bg-warn/12 text-warn border-warn/30",
    neutral: "bg-panel-3 text-muted border-line",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  color,
  fill = true,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  if (values.length < 2) return <svg width={width} height={height} className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const stroke = color ?? (values[values.length - 1] >= values[0] ? "var(--color-up)" : "var(--color-down)");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} preserveAspectRatio="none">
      {fill && <path d={`${line} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.12" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

/** Ring chart: either a single ratio (0..1) or segments. */
export function Donut({
  segments,
  size = 96,
  thickness = 10,
  children,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  children?: ReactNode;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-panel-3)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - (segments.length > 1 ? 1.5 : 0))} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

export function ScoreBar({ value, max = 100, color = "var(--color-gold)", className }: { value: number; max?: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-panel-3", className)}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly T[] | { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const opts = (options as (T | { value: T; label: ReactNode })[]).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className={cn("inline-flex rounded-lg border border-line bg-panel-2 p-0.5", className)}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs transition-colors",
            o.value === value ? "bg-gold/20 text-gold-2" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn("panel animate-fade-in w-full shadow-2xl shadow-black/50", wide ? "max-w-3xl" : "max-w-lg")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label="Schließen">
            <X className="size-4" />
          </button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

const EMBLEM_TEXT: Record<string, string> = {
  porsche: "P",
  ferrari: "F",
};

/** Neutral brand mark (shield + initials) — deliberately not a reproduction of the real logos. */
export function BrandEmblem({ brandId, size = 20 }: { brandId: string; size?: number }) {
  const brand = brandById.get(brandId);
  const color = brand?.color ?? "#999";
  const text = EMBLEM_TEXT[brandId] ?? brand?.name[0] ?? "?";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path d="M12 1.5 21 4.5v7.2c0 5.2-3.8 9.3-9 10.8-5.2-1.5-9-5.6-9-10.8V4.5z" fill="#1d2027" stroke={color} strokeWidth="1.3" />
      <text x="12" y="15.2" textAnchor="middle" fontSize={text.length > 1 ? 7.5 : 10} fontWeight="700" fill={color} fontFamily="system-ui, sans-serif">
        {text}
      </text>
    </svg>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted", className)}>{children}</div>;
}

/** Shared tooltip body for Recharts charts. */
export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line-2 bg-panel-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted">
            {r.color && <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tabular-nums text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export const axisProps = {
  stroke: "var(--color-faint)",
  tick: { fill: "var(--color-muted)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
