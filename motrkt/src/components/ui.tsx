import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import { amount, cn, curSign, num, ownUsd, pct, trendClass } from "../lib/format";
import { brandById } from "../data/db";
import { t } from "../i18n";
import { LockedBody, PremiumTag, useLock } from "./premium/Locked";

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
        <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pt-4 pb-3">
          <h2 className="panel-title min-w-0">
            {title} {sub && <span className="panel-sub ml-1.5">{sub}</span>}
          </h2>
          {actions && <div className="flex max-w-full flex-wrap items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 px-5 pb-5", !title && !actions && "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Open, borderless page section with a large serif heading — the default building block for editorial pages. */
export function Section({
  title,
  sub,
  actions,
  children,
  className,
  tone = "accent",
  eyebrow,
}: {
  title: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** colour of the short rule above the heading */
  tone?: Tone;
  /** small caps line above the heading */
  eyebrow?: ReactNode;
}) {
  // inside a <Lock> of the lite version: the heading stays, the body is blurred, the controls give way to the mark
  const lock = useLock();
  return (
    <section className={cn("min-w-0", className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-line pb-4">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-3">
            <span className="block h-[3px] w-9 rounded-full" style={{ background: TONE_COLOR[tone] }} aria-hidden />
            {eyebrow && <span className="eyebrow" style={{ color: TONE_COLOR[tone] }}>{eyebrow}</span>}
          </div>
          <h2 className="font-display text-[28px] leading-tight sm:text-[32px]">{title}</h2>
          {sub && <p className="mt-1 text-[14px] text-muted">{sub}</p>}
        </div>
        {lock ? <PremiumTag className="mb-1" /> : actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </header>
      {lock ? <LockedBody {...lock}>{children}</LockedBody> : children}
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

export function Pill({ children, tone = "neutral", className }: { children: ReactNode; tone?: "up" | "down" | "gold" | "neutral" | "warn" | "accent" | "cobalt" | "red"; className?: string }) {
  const tones = {
    up: "text-up border-up/30 bg-up-soft",
    down: "text-down border-down/30 bg-down-soft",
    gold: "text-gold-2 border-gold/35 bg-gold-soft",
    warn: "text-warn border-warn/35 bg-gold-soft",
    accent: "text-accent border-accent/30 bg-accent-soft",
    cobalt: "text-cobalt border-cobalt/30 bg-cobalt-soft",
    red: "text-red border-red/30 bg-red-soft",
    neutral: "text-muted border-line-2 bg-panel/70",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-xs whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/** The colour families of the palette; each maps to a CSS token so light and dark themes swap in one place. */
export type Tone = "accent" | "gold" | "cobalt" | "red" | "up" | "down" | "ink";
export const TONE_COLOR: Record<Tone, string> = {
  accent: "var(--color-accent)",
  gold: "var(--color-gold)",
  cobalt: "var(--color-cobalt)",
  red: "var(--color-red)",
  up: "var(--color-up)",
  down: "var(--color-down)",
  ink: "var(--color-ink)",
};

/** Signed percentage on a soft tinted chip: green up, red down, grey flat. */
export function DeltaBadge({ value, className, digits = 1 }: { value: number; className?: string; digits?: number }) {
  const tone = value > 0.0005 ? "bg-up-soft text-up" : value < -0.0005 ? "bg-down-soft text-down" : "bg-panel-3 text-muted";
  const Icon = value > 0.0005 ? ArrowUpRight : value < -0.0005 ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[12.5px] font-medium tabular-nums", tone, className)}>
      <Icon className="size-3.5 shrink-0" strokeWidth={2.2} />
      {pct(value, { digits })}
    </span>
  );
}

/**
 * A key figure: label, big value, an optional line underneath and an optional mini chart, on a card with a coloured
 * top rule. The value stays in ink; colour only marks which family the figure belongs to.
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "accent",
  chart,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  chart?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("stat-tile flex min-w-0 flex-col", className)} style={{ ["--tile-color" as string]: TONE_COLOR[tone] }}>
      <div className="relative z-[1] flex items-center gap-2">
        {icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full" style={{ color: TONE_COLOR[tone], background: `color-mix(in srgb, ${TONE_COLOR[tone]} 13%, transparent)` }}>
            {icon}
          </span>
        )}
        <span className="text-[13px] leading-tight text-muted">{label}</span>
      </div>
      <div className="relative z-[1] mt-3 font-serif text-[30px] leading-none text-ink">{value}</div>
      {sub && <div className="relative z-[1] mt-2 text-[13px] leading-snug text-muted">{sub}</div>}
      {chart && <div className="relative z-[1] mt-auto pt-3">{chart}</div>}
    </div>
  );
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  color,
  fill = false,
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
      {fill && <path d={`${line} L${width},${height} L0,${height} Z`} fill={stroke} opacity="0.08" />}
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.25" strokeLinejoin="round" />
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
    <div className={cn("h-1 w-full overflow-hidden bg-panel-3", className)}>
      <div className="h-full" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} />
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
    <div className={cn("inline-flex items-center gap-0.5 rounded-full border border-line bg-panel p-0.5", className)}>
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full px-3 py-1 text-[13px] transition-colors",
            o.value === value ? "bg-accent-fill text-on-accent" : "text-muted hover:bg-panel-2 hover:text-ink",
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
  bare,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** no header and no padding: the content lays out the whole box (and brings its own close button, marked data-close) */
  bare?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // onClose is usually a new arrow on every render: keep it in a ref so a parent re-render (e.g. typing into a field
  // whose state lives in the parent) does not re-run the effect and pull focus back to the first element
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    // focus moves into the dialog, stays there (Tab cycles), and returns to the opener when it closes
    const opener = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...(box.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
    const first = focusable().find((el) => !el.hasAttribute("data-close")) ?? box.current;
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return closeRef.current();
      if (e.key !== "Tab" || !box.current) return;
      const els = focusable();
      if (!els.length) return e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (i <= 0 || !box.current.contains(document.activeElement))) {
        e.preventDefault();
        els[els.length - 1].focus();
      } else if (!e.shiftKey && (i === els.length - 1 || !box.current.contains(document.activeElement))) {
        e.preventDefault();
        els[0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={bare ? undefined : titleId}
        aria-label={bare && typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "animate-fade-in w-full border border-line bg-panel shadow-[0_24px_60px_-20px_rgba(20,20,20,0.22)] focus:outline-none",
          bare ? "max-w-[900px] overflow-hidden rounded-[8px]" : "rounded-[3px]",
          !bare && (wide ? "max-w-3xl" : "max-w-lg"),
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {bare ? (
          children
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 id={titleId} className="font-serif text-xl">{title}</h2>
              <button className="btn btn-ghost -mr-2 p-1.5" onClick={onClose} aria-label={t("Schließen", "Close")} data-close>
                <X className="size-4" />
              </button>
            </header>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
            {footer && <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

const EMBLEM_TEXT: Record<string, string> = {
  porsche: "P",
};

/** Neutral brand mark (ring + serif initials) — deliberately not a reproduction of the real logos. */
export function BrandEmblem({ brandId, size = 20 }: { brandId: string; size?: number }) {
  const brand = brandById.get(brandId);
  const text = EMBLEM_TEXT[brandId] ?? brand?.name[0] ?? "?";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="10.8" fill="none" stroke="var(--color-line-2)" strokeWidth="1" />
      <text x="12" y="16" textAnchor="middle" fontSize={text.length > 1 ? 8.5 : 11.5} fill="var(--color-ink)" fontFamily="var(--font-serif)">
        {text}
      </text>
    </svg>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 py-10 text-center font-serif text-[15px] text-muted italic", className)}>{children}</div>;
}

/** Shared tooltip body for Recharts charts. */
export function ChartTooltipBox({ title, rows }: { title: ReactNode; rows: { label: ReactNode; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-[2px] border border-line-2 bg-panel px-3 py-2 text-[13px] shadow-[0_10px_30px_-12px_rgba(20,20,20,0.2)]">
      <div className="mb-1 font-serif text-ink">{title}</div>
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
  tick: { fill: "var(--color-faint)", fontSize: 12, fontFamily: "var(--font-sans)" },
  tickLine: false,
  axisLine: false,
} as const;

/**
 * A typeset amount: digits written out in full in the serif face with lining figures.
 * `compact` rounds to three significant digits (for estimates), never to "k" or "Mio.".
 */
/** An amount in euros, shown in the display currency. `sale`: a sale in dollars keeps its own dollar price in English. */
export function Money({ value, compact, className, sale }: { value: number | null | undefined; compact?: boolean; className?: string; sale?: { currency?: string; priceOriginal?: number | null } }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={cn("money", className)}>–</span>;
  const own = sale ? ownUsd(sale) : null;
  return (
    <span className={cn("money", className)}>
      {value < 0 && "−"}
      <span className="money-cur">{curSign()}</span>
      {own !== null ? num(Math.round(own)) : amount(value, { compact })}
    </span>
  );
}

/**
 * In-app replacement for window.confirm: `const { confirm, dialog } = useConfirm()`, render `{dialog}` once, then
 * `if (await confirm(t("…", "…"))) …`. Resolves false when dismissed.
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: ReactNode; title?: ReactNode; confirmLabel?: string; resolve: (ok: boolean) => void } | null>(null);
  const confirm = useCallback(
    (message: ReactNode, opts: { title?: ReactNode; confirmLabel?: string } = {}) =>
      new Promise<boolean>((resolve) => setState({ message, ...opts, resolve })),
    [],
  );
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const dialog = state ? (
    <Modal
      open
      onClose={() => close(false)}
      title={state.title ?? t("Bitte bestätigen", "Please confirm")}
      footer={
        <>
          <button className="btn" onClick={() => close(false)}>
            {t("Abbrechen", "Cancel")}
          </button>
          <button className="btn btn-gold" onClick={() => close(true)} autoFocus>
            {state.confirmLabel ?? t("Bestätigen", "Confirm")}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted">{state.message}</p>
    </Modal>
  ) : null;
  return { confirm, dialog };
}
