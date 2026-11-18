import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { brands, variantById, variants, variantTitle } from "../data/db";
import { AS_OF, DAY, getSeries } from "../data/generate";
import { brandIndex, changeOver, cycleData, getMetrics, marketIndex, rangeOptions, rebase, sliceRange, type RangeKey } from "../data/market";
import { auctionCalendar, auctionWindows, auctionYears, bodyPremium, generationRows, hiddenGems, houseStats, mileageBands, monthlyCounts, monthlyLots, topSellers, usPremium, type MonthCount } from "../data/insights";
import { cn, date, eur, num, pct, trendClass } from "../lib/format";
import { axisProps, Card, ChartTooltipBox, Delta, Section, Segmented, Sparkline } from "../components/ui";
import { TrendHeatmap } from "../components/insights/TrendHeatmap";
import { Lock, Locked, useLock } from "../components/premium/Locked";
import { PremiumBanner } from "../components/premium/Upgrade";
import { usePlan } from "../lib/plan";
import { brandColor, yearTicks } from "../components/insights/palette";
import { locale, t } from "../i18n";

const ACCENT = "var(--color-accent)";
const UP = "var(--color-up)";
const DOWN = "var(--color-down)";

const monthName = (m: number, style: "short" | "long" = "short") => new Date(Date.UTC(2020, m, 1)).toLocaleString(locale(), { month: style, timeZone: "UTC" });
const km = (n: number) => `${num(n / 1000)}${t(" Tsd. km", "k km")}`;

const NAV = () => [
  { id: "ueberblick", label: t("Das Wichtigste", "Key points") },
  { id: "markt", label: t("Marktentwicklung", "Market trend") },
  { id: "gewinner", label: t("Gewinner und Verlierer", "Gainers and losers") },
  { id: "geheimtipps", label: t("Geheimtipps", "Hidden gems") },
  { id: "meistverkauft", label: t("Meistverkauft", "Best sellers") },
  { id: "modellreihen", label: t("Modellreihen", "Model lines") },
  { id: "auktionen", label: t("Auktionsmarkt", "Auction market") },
  { id: "preis", label: t("Preisfaktoren", "Price drivers") },
  { id: "monate", label: t("Monat für Monat", "Month by month") },
  { id: "seltenheit", label: t("Seltenheit", "Rarity") },
];

/** Chapter number of a section, as shown in the jump bar and above each heading ("02"). */
const chapter = (id: string) => String(NAV().findIndex((n) => n.id === id) + 1).padStart(2, "0");

export default function Insights() {
  // lite (src/lib/plan.tsx): the report is premium as a whole. Title, chapter bar and every chapter heading stay, so
  // the page reads as its own table of contents; the chapters themselves are blurred.
  return (
    <Lock reason="insights" height={230}>
    <div>
      <InsightsHero />
      <SectionNav />
      <div className="mt-10 space-y-20">
        <Anchor id="ueberblick">
          <KeyFindings />
        </Anchor>
        <Anchor id="markt">
          <MarketTrend />
        </Anchor>
        <Anchor id="gewinner">
          <Movers />
        </Anchor>
        <Anchor id="geheimtipps">
          <HiddenGems />
        </Anchor>
        <Anchor id="meistverkauft">
          <TopSellers />
        </Anchor>
        <Anchor id="modellreihen">
          <ModelLines />
        </Anchor>
        <Anchor id="auktionen">
          <AuctionMarket />
        </Anchor>
        <Anchor id="preis">
          <PriceDrivers />
        </Anchor>
        <Anchor id="monate">
          <Section
            eyebrow={chapterLabel("monate")}
            title={t("Monat für Monat", "Month by month")}
            sub={t("Wertveränderung je Monat über die letzten 12 Monate. Grün steht für Zuwachs, Rot für Rückgang, ein Klick öffnet die Variante.", "Change in value per month over the last 12 months. Green means a gain, red a drop; click to open the variant.")}
          >
            <TrendHeatmap />
          </Section>
        </Anchor>
        <Anchor id="seltenheit">
          <Section
            eyebrow={chapterLabel("seltenheit")}
            title={t("Seltenheit und Rendite", "Rarity and return")}
            sub={t("Zahlen sich seltene Fahrzeuge langfristig aus? Jeder Punkt ist eine Variante, die Größe zeigt den Marktwert.", "Do rare cars pay off in the long run? Each dot is a variant, size shows market value.")}
          >
            <Card>
              <RarityScatter />
            </Card>
          </Section>
        </Anchor>
      </div>
    </div>
    </Lock>
  );
}

function chapterLabel(id: string) {
  return `${t("Kapitel", "Chapter")} ${chapter(id)}`;
}

// ------------------------------------------------------------------------------------------------ building blocks

function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} data-insight-section className="scroll-mt-[136px] space-y-6">
      {children}
    </div>
  );
}

/** Sticky jump bar under the site header; the section in view is underlined. */
function SectionNav() {
  const items = NAV();
  const [active, setActive] = useState(items[0].id);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-insight-section]")];
    const onScroll = () => {
      const y = 150;
      let cur = els[0]?.id;
      for (const el of els) if (el.getBoundingClientRect().top <= y) cur = el.id;
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    barRef.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <nav aria-label={t("Abschnitte", "Sections")} className="sticky top-[72px] z-20 -mx-5 mt-6 border-b border-line bg-bg/95 px-5 backdrop-blur-sm sm:-mx-8 sm:px-8">
      <div ref={barRef} className="no-scrollbar flex gap-6 overflow-x-auto">
        {items.map((it, i) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            data-id={it.id}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "flex shrink-0 items-baseline gap-1.5 whitespace-nowrap border-b-2 py-3 text-[13.5px] transition-colors",
              active === it.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <span className={cn("text-[11px] font-semibold tabular-nums", active === it.id ? "text-accent" : "text-faint")}>{String(i + 1).padStart(2, "0")}</span>
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

/** The reading of a chart in one or two sentences, led by a small petrol label. */
function Takeaway({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mt-5 max-w-3xl text-[14.5px] leading-relaxed text-ink/85", className)}>
      <span className="mr-2 eyebrow text-accent">{t("Einordnung", "Reading")}</span>
      {children}
    </p>
  );
}

function Kpi({ label, value, delta, note }: { label: string; value: ReactNode; delta?: ReactNode; note?: string }) {
  return (
    <div className="min-w-0 border-t border-line pt-3">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-[30px] leading-none tabular-nums">{value}</dd>
      {(delta || note) && (
        <dd className="mt-2 text-[13px] text-muted">
          {delta} {note}
        </dd>
      )}
    </div>
  );
}

/** Headline figure in the page head, with its history as a small line. */
/**
 * Small line chart that uses its full height, so rises and dips read clearly: a soft petrol area under the line,
 * two hairlines for the highest and lowest value with their figures on the left, a dot at today. An optional
 * dashed second line (the long-term trend) shares the scale.
 */
function MiniChart({ values, trend, format, height = 56, className }: { values: number[]; trend?: number[]; format: (v: number) => string; height?: number; className?: string }) {
  const id = useId();
  if (values.length < 2) return null;
  const all = trend ? [...values, ...trend] : values;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const H = 100;
  const pad = 8;
  const x = (i: number, n: number) => (i / (n - 1)) * 100;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i, vs.length).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  const endY = (y(values[values.length - 1]) / H) * 100;
  return (
    <div className={cn("relative", className)} style={{ height }}>
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={0} x2={100} y1={pad} y2={pad} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={100} y1={H - pad} y2={H - pad} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={`${line(values)} L100,${H} L0,${H} Z`} fill={`url(#${id})`} />
        {trend && <path d={line(trend)} fill="none" stroke="var(--color-faint)" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={line(values)} fill="none" stroke={ACCENT} strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="absolute right-0 size-[7px] -translate-y-1/2 translate-x-1/2 rounded-full border-[1.5px] border-bg" style={{ top: `${endY}%`, background: ACCENT }} />
      <span className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[10px] leading-none text-faint tabular-nums" style={{ top: `${pad}%` }}>
        {format(hi)}
      </span>
      <span className="pointer-events-none absolute left-0 pt-0.5 text-[10px] leading-none text-faint tabular-nums" style={{ top: `${100 - pad}%` }}>
        {format(lo)}
      </span>
    </div>
  );
}

/**
 * Twelve monthly bars for the last 12 months, the tallest labelled on the left. With `ghost`, a dark tick marks the
 * same month a year earlier on each bar, so the change against the prior year is visible bar by bar.
 */
function MonthBars({ months, ghost = false, height = 60, className }: { months: MonthCount[]; ghost?: boolean; height?: number; className?: string }) {
  const hi = Math.max(1, ...months.map((m) => (ghost ? Math.max(m.now, m.before) : m.now)));
  const label = (end: number) => new Date(end - DAY).toLocaleString(locale(), { month: "short", timeZone: "UTC" });
  return (
    <div className={className}>
      <div className="relative border-b border-line" style={{ height }}>
        <span className="absolute inset-x-0 top-0 border-t border-line" aria-hidden />
        <span className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[10px] leading-none text-faint tabular-nums">{num(hi)}</span>
        <div className="absolute inset-0 flex items-end gap-[3px] pl-0">
          {months.map((m) => (
            <div key={m.end} className="relative h-full flex-1" title={`${label(m.end)}: ${num(m.now)}${ghost ? ` (${t("Vorjahr", "prior year")} ${num(m.before)})` : ""}`}>
              <span className="absolute inset-x-[2px] bottom-0 rounded-t-[2px]" style={{ height: `${(m.now / hi) * 100}%`, background: ACCENT, opacity: 0.85 }} />
              {ghost && <span className="absolute inset-x-0 h-0 border-t-2 border-ink/55" style={{ bottom: `${(m.before / hi) * 100}%` }} />}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-faint">
        <span>{label(months[0].end)}</span>
        <span>{label(months[months.length - 1].end)}</span>
      </div>
    </div>
  );
}

function HeroKpi({ label, value, delta, note, chart, chartNote, className }: { label: string; value: ReactNode; delta?: ReactNode; note?: string; chart: ReactNode; chartNote: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col justify-between gap-4", className)}>
      <div>
        <dt className="text-[13px] text-muted">{label}</dt>
        <dd className="mt-2 font-serif text-[36px] leading-none tabular-nums sm:text-[40px]">{value}</dd>
        {(delta || note) && (
          <dd className="mt-2 text-[12.5px] text-muted">
            {delta} {note}
          </dd>
        )}
      </div>
      <dd>
        <div className="mt-3">{chart}</div>
        <div className="mt-2 text-[11px] text-faint">{chartNote}</div>
      </dd>
    </div>
  );
}

type BarRow = { key: string; label: string; href?: string; value: number; display: string; note?: string; muted?: boolean };

/** Ranked horizontal bars in plain HTML: label, bar from a shared zero line, value. Negative values grow to the left. */
function RankBars({ rows, tone = "sign", max }: { rows: BarRow[]; tone?: "sign" | "accent"; /** shared top of the scale when one list is split into columns */ max?: number }) {
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0, max ?? 0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((r) => {
        const left = r.value < 0 ? ((r.value - lo) / span) * 100 : zero;
        const width = (Math.abs(r.value) / span) * 100;
        const color = tone === "accent" ? ACCENT : r.value >= 0 ? UP : DOWN;
        const label = r.href ? (
          <Link to={r.href} className="truncate hover:text-accent hover:underline hover:underline-offset-4">
            {r.label}
          </Link>
        ) : (
          <span className="truncate">{r.label}</span>
        );
        return (
          <li key={r.key} className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_4.25rem] items-center gap-3 py-1.5 text-[13.5px] sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem]" title={r.note ? `${r.label}: ${r.display} · ${r.note}` : `${r.label}: ${r.display}`}>
            <span className={cn("flex min-w-0 flex-col", r.muted && "text-muted")}>
              {label}
              {r.note && <span className="truncate text-[11.5px] text-faint">{r.note}</span>}
            </span>
            <span className="relative h-2.5 rounded-full bg-panel-2">
              {lo < 0 && <span className="absolute inset-y-[-4px] w-px bg-line-2" style={{ left: `${zero}%` }} />}
              <span className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `max(${width}%, 3px)`, background: color, opacity: r.muted ? 0.5 : 0.85 }} />
            </span>
            <span className={cn("text-right font-medium tabular-nums", tone === "sign" && trendClass(r.value))}>{r.display}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ overview

/** Page head: title, scope and the three headline figures of the market. */
function InsightsHero() {
  const { now, before } = auctionWindows();
  const idxSeries = marketIndex();
  const idx = changeOver(idxSeries, 52);
  const measured = variants.filter((v) => v.measured).length;
  const lotsChange = now.lots / before.lots - 1;
  const best = topSellers().rows[0];
  const { premium } = usePlan();
  return (
    <header>
      <div className="eyebrow text-accent">{t(`Marktbericht · Stand ${date(AS_OF)}`, `Market report · as of ${date(AS_OF)}`)}</div>
      <h1 className="mt-2 font-display text-[44px] leading-tight sm:text-[52px]">Insights</h1>
      <p className="mt-1 max-w-3xl text-[14.5px] leading-relaxed text-muted">
        {t(
          `Wertentwicklung, Auktionsgeschehen und was den Preis bestimmt, berechnet aus ${measured} bewerteten Varianten und allen erfassten Auktionsergebnissen.`,
          `Value trends, auction activity and what drives prices, computed from ${measured} valued variants and every recorded auction result.`,
        )}
      </p>
      {!premium && (
        <div className="mt-7">
          <PremiumBanner reason="insights" title={t(`${NAV().length} Kapitel zum Markt, aus allen erfassten Verkäufen`, `${NAV().length} chapters on the market, from every recorded sale`)}>
            {t(
              "Welche Varianten gewinnen, welche unterschätzt sind, was Laufleistung und Karosserie am Preis ändern und wann Auktionen am besten laufen.",
              "Which variants are gaining, which are underrated, what mileage and body style do to the price and when auctions perform best.",
            )}
          </PremiumBanner>
        </div>
      )}
      <Locked reason="insights" teaser={t("Marktindex, meistverkaufte Variante und Auktionsvolumen der letzten 12 Monate", "Market index, best-selling variant and auction volume of the last 12 months")} height={200} className="mt-8">
      <dl className={cn("grid gap-7 border-t border-line pt-6 md:grid-cols-3 md:gap-0", premium && "mt-8")}>
        <HeroKpi
          className="md:pr-8"
          label={t("Marktindex, 12 Monate", "Market index, 12 months")}
          value={<span className={trendClass(idx)}>{pct(idx)}</span>}
          note={t("über alle bewerteten Varianten", "across all valued variants")}
          chart={<MiniChart values={idxSeries.slice(-53).map((p) => p.value)} format={(v) => num(v, 1)} height={60} />}
          chartNote={t("Indexverlauf der letzten 12 Monate, wöchentlich", "Index over the last 12 months, weekly")}
        />
        <HeroKpi
          className="md:border-l md:border-line md:px-8"
          label={t("Meistverkaufte Variante, 12 Monate", "Best-selling variant, 12 months")}
          value={
            best ? (
              <Link to={`/markt/${best.id}`} className="block text-[26px] leading-tight hover:text-accent sm:text-[28px]">
                {variantTitle(variantById.get(best.id)!, { brand: false })}
              </Link>
            ) : (
              "–"
            )
          }
          note={best ? t(`${best.sold} Verkäufe, Median ${eur(best.median, { compact: true })}`, `${best.sold} sales, median ${eur(best.median, { compact: true })}`) : undefined}
          chart={best ? <MonthBars months={monthlyCounts((s) => s.variantId === best.id && s.price !== null)} /> : null}
          chartNote={t("Verkäufe dieser Variante je Monat, letzte 12 Monate", "Sales of this variant per month, last 12 months")}
        />
        <HeroKpi
          className="md:border-l md:border-line md:pl-8"
          label={t("Versteigerte Fahrzeuge, 12 Monate", "Cars auctioned, 12 months")}
          value={num(now.lots)}
          delta={<Delta value={lotsChange} arrow={false} digits={0} />}
          note={t("ggü. Vorjahr", "vs. prior year")}
          chart={<MonthBars months={monthlyLots()} ghost />}
          chartNote={
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              {t("Je Monat, letzte 12 Monate;", "Per month, last 12 months;")}
              <span className="inline-block h-0 w-3 border-t-2 border-ink/55" aria-hidden />
              {t("Vorjahr", "prior year")}
            </span>
          }
        />
      </dl>
      </Locked>
    </header>
  );
}

/** The four headline stories of the page, each linking to its section. */
function KeyFindings() {
  const items = useMemo(() => {
    const all = variants.filter((v) => v.measured).map((v) => ({ v, m: getMetrics(v.id) }));
    const top = [...all].sort((a, b) => b.m.change12m - a.m.change12m)[0];
    const line = [...generationRows()].sort((a, b) => b.change12m - a.change12m)[0];
    const bands = mileageBands();
    const low = bands.filter((b) => b.to !== null && b.to <= 30_000);
    const high = bands.filter((b) => b.from >= 100_000);
    const gem = hiddenGems()[0];
    const out: { id: string; kicker: string; value: ReactNode; text: string }[] = [];
    if (top)
      out.push({
        id: "gewinner",
        kicker: t("Stärkste Variante", "Top variant"),
        value: <span className="text-up">{pct(top.m.change12m)}</span>,
        text: t(`${variantTitle(top.v)} in den letzten 12 Monaten.`, `${variantTitle(top.v)} over the last 12 months.`),
      });
    if (line)
      out.push({
        id: "modellreihen",
        kicker: t("Stärkste Modellreihe", "Top model line"),
        value: <span className="text-up">{pct(line.change12m)}</span>,
        text: t(`${line.label}, Median aus ${line.variants} Varianten.`, `${line.label}, median of ${line.variants} variants.`),
      });
    if (low.length && high.length) {
      const hi = Math.min(...high.map((b) => b.effect));
      out.push({
        id: "preis",
        kicker: t("Laufleistung", "Mileage"),
        value: <span className="text-down">{pct(hi, { digits: 0 })}</span>,
        text: t(
          `Abschlag für Fahrzeuge über 100.000 km, wenig gefahrene bringen bis zu ${pct(Math.max(...low.map((b) => b.effect)), { digits: 0 })}.`,
          `Discount for cars over 100,000 km; low-mileage cars fetch up to ${pct(Math.max(...low.map((b) => b.effect)), { digits: 0 })}.`,
        ),
      });
    }
    if (gem) {
      const gv = variantById.get(gem.id)!;
      out.push({
        id: "geheimtipps",
        kicker: t("Geheimtipp", "Hidden gem"),
        value: <span className="text-accent">{pct(gem.gap, { digits: 0 })}</span>,
        text: t(`${variantTitle(gv)} liegt so weit unter seinem langfristigen Trend und legt wieder zu.`, `${variantTitle(gv)} trades this far below its long-term trend and is rising again.`),
      });
    }
    return out.sort((x, y) => chapter(x.id).localeCompare(chapter(y.id)));
  }, []);
  return (
    <Section eyebrow={chapterLabel("ueberblick")} title={t("Das Wichtigste in Kürze", "Key points at a glance")} sub={t("Vier Beobachtungen aus den aktuellen Daten, ein Klick führt zum Kapitel", "Four observations from the current data; click to jump to the chapter")}>
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it, i) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="group flex flex-col gap-1.5 border-t-2 border-line pt-4 transition-colors hover:border-accent"
          >
            <span className="flex items-baseline gap-2">
              <span className="text-[11.5px] font-semibold tabular-nums text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span className="eyebrow text-muted">{it.kicker}</span>
            </span>
            <span className="font-serif text-[32px] leading-tight tabular-nums">{it.value}</span>
            <span className="text-[13.5px] leading-snug text-muted">{it.text}</span>
            <span className="mt-auto flex items-center gap-1 pt-1 text-[12.5px] text-ink/60 transition-colors group-hover:text-accent">
              {t("Zum Kapitel", "Go to chapter")} {chapter(it.id)} <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </a>
        ))}
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ market trend

function MarketTrend() {
  const [range, setRange] = useState<RangeKey>("Max");
  const data = useMemo(() => sliceRange(marketIndex(), range), [range]);
  const cycle = useMemo(() => cycleData(marketIndex()), []);
  const last = cycle[cycle.length - 1];
  const gap = last.value / last.trend - 1;
  const peak = cycle.reduce((a, b) => (b.value > a.value ? b : a));
  const change = data.length ? data[data.length - 1].value / data[0].value - 1 : 0;
  const short = range === "1M" || range === "6M" || range === "1J";
  const lo = Math.min(...data.map((p) => p.value));
  const hi = Math.max(...data.map((p) => p.value));
  const pad = (hi - lo) * 0.12 || 1;
  const hiPt = data.find((p) => p.value === hi);
  const loPt = data.find((p) => p.value === lo);
  const marker = (p: { t: number; value: number } | undefined, label: string, pos: "top" | "bottom") =>
    p ? (
      <ReferenceDot
        x={p.t}
        y={p.value}
        r={4}
        fill="var(--color-panel)"
        stroke={ACCENT}
        strokeWidth={2}
        ifOverflow="extendDomain"
        label={{ value: `${label} ${num(p.value)}`, position: pos, offset: 10, fontSize: 11, fill: "var(--color-muted)" }}
      />
    ) : null;
  return (
    <Section eyebrow={chapterLabel("markt")} title={t("Marktentwicklung", "Market trend")} sub={t("Gesamtindex aller bewerteten Varianten, gleich gewichtet", "Overall index of all valued variants, equally weighted")}>
      <Card
        title={
          <span className="flex items-baseline gap-3">
            <span className={cn("font-serif text-[26px] tabular-nums", trendClass(change))}>{pct(change)}</span>
            <span className="text-[13px] font-normal text-muted">{t(`seit ${date(data[0]?.t ?? AS_OF)}`, `since ${date(data[0]?.t ?? AS_OF)}`)}</span>
          </span>
        }
        actions={<Segmented options={rangeOptions(["1J", "5J", "10J", "Max"])} value={range} onChange={setRange} />}
      >
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="mkt-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={short ? undefined : yearTicks(data[0]?.t ?? AS_OF, AS_OF)} tickFormatter={(v) => date(v, short ? "short" : "year")} minTickGap={short ? 40 : 8} {...axisProps} />
              <YAxis {...axisProps} width={40} domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]} tickFormatter={(v) => num(Number(v))} />
              <Tooltip
                cursor={{ stroke: "var(--color-line-2)" }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <ChartTooltipBox
                      title={date(Number(label))}
                      rows={[
                        { label: "Index", value: num(Number(payload[0].value), 1), color: ACCENT },
                        { label: t("seit Beginn", "since start"), value: pct(Number(payload[0].value) / data[0].value - 1) },
                      ]}
                    />
                  ) : null
                }
              />
              <Area dataKey="value" stroke={ACCENT} strokeWidth={2} fill="url(#mkt-fill)" dot={false} activeDot={{ r: 4, fill: ACCENT, stroke: "var(--color-panel)", strokeWidth: 2 }} isAnimationActive={false} />
              {marker(hiPt, t("Hoch", "High"), "top")}
              {loPt !== hiPt && marker(loPt, t("Tief", "Low"), "bottom")}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Takeaway>
        {t(
          <>
            Der Gesamtmarkt liegt im Jahresmittel <strong className={trendClass(gap)}>{pct(Math.abs(gap), { signed: false })}</strong> {gap >= 0 ? "über" : "unter"} seinem langfristigen Trend.{" "}
            {peak.year === last.year ? "Das laufende Jahr ist zugleich das bisher stärkste." : `Das bisherige Hoch im Jahresmittel wurde ${peak.year} erreicht, ${last.value >= peak.value * 0.97 ? "der Markt nähert sich diesem Niveau wieder." : `aktuell liegt der Markt ${pct(1 - last.value / peak.value, { signed: false, digits: 0 })} darunter.`}`}
          </>,
          <>
            On an annual average the overall market is <strong className={trendClass(gap)}>{pct(Math.abs(gap), { signed: false })}</strong> {gap >= 0 ? "above" : "below"} its long-term trend.{" "}
            {peak.year === last.year ? "The current year is also the strongest so far." : `The highest annual average was reached in ${peak.year}; ${last.value >= peak.value * 0.97 ? "the market is approaching that level again." : `the market is currently ${pct(1 - last.value / peak.value, { signed: false, digits: 0 })} below it.`}`}
          </>,
        )}
      </Takeaway>
      {brands.length > 1 && (
        <div className="mt-8">
          <BrandComparison />
        </div>
      )}
    </Section>
  );
}

function BrandComparison() {
  const [range, setRange] = useState<RangeKey>("5J");
  const data = useMemo(() => {
    const from = sliceRange(marketIndex(), range)[0].t;
    const rows = new Map<number, Record<string, number>>();
    for (const b of brands) {
      for (const p of rebase(brandIndex(b.id), from)) {
        const row = rows.get(p.t) ?? { t: p.t };
        row[b.id] = p.value;
        rows.set(p.t, row);
      }
    }
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [range]);
  return (
    <Card title={t("Markenindizes", "Brand indices")} sub={t("indexiert = 100 zu Beginn", "indexed = 100 at the start")} actions={<Segmented options={rangeOptions(["1J", "5J", "10J"])} value={range} onChange={setRange} />}>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(v) => date(v, "year")} {...axisProps} />
            <YAxis {...axisProps} width={40} domain={["auto", "auto"]} />
            <ReferenceLine y={100} stroke="var(--color-line-2)" />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={date(Number(label))}
                    rows={payload.map((p) => ({ label: brands.find((b) => b.id === p.dataKey)?.name ?? String(p.dataKey), value: num(Number(p.value), 1), color: brandColor(String(p.dataKey)) }))}
                  />
                ) : null
              }
            />
            {brands.map((b) => (
              <Line key={b.id} dataKey={b.id} name={b.name} stroke={brandColor(b.id)} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
            ))}
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------ movers

function Movers() {
  const [metric, setMetric] = useState<"12m" | "5y">("12m");
  const { up, down, rising, total } = useMemo(() => {
    const key = metric === "12m" ? "change12m" : "cagr5";
    const all = variants.filter((v) => v.measured).map((v) => ({ v, m: getMetrics(v.id) }));
    const sorted = [...all].sort((a, b) => b.m[key] - a.m[key]);
    return { up: sorted.slice(0, 5), down: sorted.slice(-5).reverse(), rising: all.filter((x) => x.m[key] > 0).length, total: all.length };
  }, [metric]);
  const weeks = metric === "12m" ? 53 : 261;
  const list = (rows: typeof up, title: string, dir: "up" | "down") => (
    <Card
      title={
        <span className="flex items-center gap-2.5">
          <span className={cn("flex size-7 items-center justify-center rounded-full", dir === "up" ? "bg-up-soft text-up" : "bg-down-soft text-down")}>
            {dir === "up" ? <TrendingUp className="size-4" strokeWidth={1.8} /> : <TrendingDown className="size-4" strokeWidth={1.8} />}
          </span>
          {title}
        </span>
      }
    >
      <ol className="-mx-2">
        {rows.map(({ v, m }, i) => {
          const s = getSeries(v.id).slice(-weeks);
          const step = Math.max(1, Math.floor(s.length / 40));
          const value = metric === "12m" ? m.change12m : m.cagr5;
          return (
            <li key={v.id}>
              <Link to={`/markt/${v.id}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[2px] px-2 py-2.5 transition-colors hover:bg-panel-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_88px_4.5rem]">
                <span className={cn("font-serif text-[18px] leading-none tabular-nums", i === 0 ? "text-accent" : "text-faint")}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[14.5px]">{variantTitle(v)}</span>
                  <span className="text-[12.5px] text-muted tabular-nums">{eur(m.value, { compact: true })}</span>
                </span>
                <Sparkline values={s.filter((_, j) => j % step === 0 || j === s.length - 1).map((p) => p.value)} width={88} height={28} className="hidden sm:block" />
                <Delta value={value} className="justify-end text-[14px]" />
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
  return (
    <Section
      eyebrow={chapterLabel("gewinner")}
      title={t("Gewinner und Verlierer", "Gainers and losers")}
      sub={metric === "12m" ? t("Varianten mit der größten Wertveränderung in den letzten 12 Monaten", "Variants with the largest change in value over the last 12 months") : t("Varianten mit der höchsten und niedrigsten Rendite pro Jahr über 5 Jahre", "Variants with the highest and lowest annual return over 5 years")}
      actions={
        <Segmented
          options={[
            { value: "12m", label: t("12 Monate", "12 months") },
            { value: "5y", label: t("Pro Jahr, 5 Jahre", "Per year, 5 years") },
          ]}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {list(up, t("Stärkste Zuwächse", "Biggest gains"), "up")}
        {list(down, t("Stärkste Rückgänge", "Biggest drops"), "down")}
      </div>
      <Takeaway>
        {t(
          <>
            <strong>{rising}</strong> von {total} Varianten liegen {metric === "12m" ? "nach 12 Monaten" : "über fünf Jahre"} im Plus, {total - rising} im Minus. Die kleinen Linien zeigen den Wertverlauf im selben Zeitraum.
          </>,
          <>
            <strong>{rising}</strong> of {total} variants are up {metric === "12m" ? "over 12 months" : "over five years"}, {total - rising} are down. The small lines show the value trend over the same period.
          </>,
        )}
      </Takeaway>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ hidden gems

function HiddenGems() {
  const [all, setAll] = useState(false);
  const gems = hiddenGems();
  // with the lite data (no value histories, src/lib/plan.tsx) there is nothing to find: the chapter keeps its
  // heading in the locked preview all the same
  const lock = useLock();
  if (!gems.length) return lock ? <Section eyebrow={chapterLabel("geheimtipps")} title={t("Geheimtipps", "Hidden gems")} sub={t("Varianten, die unter ihrem langfristigen Wertetrend liegen, aber wieder zulegen.", "Variants trading below their long-term value trend that are gaining again.")}><div className="h-40 rounded-[4px] bg-panel-2" /></Section> : null;
  const shown = all ? gems : gems.slice(0, 6);
  const top = gems[0];
  const topV = variantById.get(top.id)!;
  return (
    <Section
      eyebrow={chapterLabel("geheimtipps")}
      title={t("Geheimtipps", "Hidden gems")}
      sub={t(
        "Varianten, die unter ihrem langfristigen Wertetrend liegen, aber in den letzten drei Monaten wieder zulegen. Nur mit mindestens sechs Verkäufen in zwei Jahren.",
        "Variants trading below their long-term value trend that have gained again over the last three months. Only with at least six sales in two years.",
      )}
      actions={
        gems.length > 6 ? (
          <button onClick={() => setAll((a) => !a)} className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
            {all ? t("Weniger anzeigen", "Show fewer") : t(`Alle ${gems.length} anzeigen`, `Show all ${gems.length}`)}
          </button>
        ) : undefined
      }
    >
      <ol className="grid gap-x-10 lg:grid-cols-2">
        {shown.map((g, i) => {
          const v = variantById.get(g.id)!;
          return (
            <li key={g.id} className="border-t border-line first:border-t-0 lg:[&:nth-child(2)]:border-t-0">
              <Link to={`/markt/${g.id}`} className="group grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-4 sm:grid-cols-[1.5rem_minmax(0,1fr)_170px_auto]">
                <span className={cn("font-serif text-[18px] leading-none tabular-nums", i === 0 ? "text-accent" : "text-faint")}>{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-serif text-[16px] leading-snug transition-colors group-hover:text-accent sm:truncate">{variantTitle(v)}</span>
                  <span className="text-[12.5px] text-muted tabular-nums">
                    {eur(g.value, { compact: true })} · {t(`${g.sold24} Verkäufe in 2 Jahren`, `${g.sold24} sales in 2 years`)}
                  </span>
                </span>
                <MiniChart values={g.spark.map((p) => p.value)} trend={g.spark.map((p) => p.trend)} format={(v) => eur(v, { compact: true })} height={48} className="my-2 hidden sm:block" />
                <span className="text-right">
                  <span className="block font-serif text-[20px] leading-none tabular-nums text-accent">{pct(g.gap, { digits: 0 })}</span>
                  <span className="mt-1 block text-[11.5px] whitespace-nowrap text-muted">
                    {t("unter Trend", "below trend")} · <span className="text-up">{pct(g.change3m)}</span> {t("3 Mon.", "3 mo.")}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 flex items-center gap-3 text-[11.5px] text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-5 rounded-full" style={{ background: ACCENT }} /> {t("Marktwert, 5 Jahre", "Market value, 5 years")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-[1.5px] border-dashed border-faint" /> {t("langfristiger Trend", "long-term trend")}
        </span>
      </p>
      <Takeaway>
        {t(
          <>
            Am deutlichsten unter seinem Trend liegt der <strong>{variantTitle(topV)}</strong>: {pct(-top.gap, { signed: false, digits: 0 })} unter dem Wert, den sein langjähriger Anstieg von {pct(top.trendPa, { signed: false })} pro Jahr erwarten ließe, und seit drei Monaten wieder im Plus. Eine Garantie ist das nicht: Ein Abstand zum Trend kann sich auch über sinkende Trends schließen. Keine Anlageberatung.
          </>,
          <>
            Furthest below its trend is the <strong>{variantTitle(topV)}</strong>: {pct(-top.gap, { signed: false, digits: 0 })} below the value its long-run rise of {pct(top.trendPa, { signed: false })} a year would suggest, and up again over three months. That is no guarantee: a gap can also close through a falling trend. Not investment advice.
          </>,
        )}
      </Takeaway>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ top sellers

function TopSellers() {
  const { rows, total } = topSellers();
  if (!rows.length) return null;
  const top = rows.slice(0, 10);
  const share = top.reduce((a, r) => a + r.sold, 0) / total;
  const first = variantById.get(top[0].id)!;
  return (
    <Section
      eyebrow={chapterLabel("meistverkauft")}
      title={t("Meistverkauft", "Best sellers")}
      sub={t(`Die Varianten mit den meisten Zuschlägen in den letzten 12 Monaten, von ${num(total)} verkauften Fahrzeugen`, `The variants with the most sales over the last 12 months, out of ${num(total)} cars sold`)}
    >
      <ol>
        {top.map((r, i) => {
          const v = variantById.get(r.id)!;
          return (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <Link
                to={`/markt/${r.id}`}
                className="group grid grid-cols-[1.5rem_minmax(0,1fr)_3rem] items-center gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[1.5rem_minmax(0,16rem)_minmax(0,1fr)_3rem_9rem]"
              >
                <span className={cn("font-serif text-[18px] leading-none tabular-nums", i === 0 ? "text-accent" : "text-faint")}>{i + 1}</span>
                <span className="min-w-0 font-serif text-[15.5px] leading-snug transition-colors group-hover:text-accent sm:truncate">{variantTitle(v)}</span>
                <span className="col-span-3 col-start-2 row-start-2 h-2 rounded-full bg-panel-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <span className="block h-full rounded-full" style={{ width: `${(r.sold / top[0].sold) * 100}%`, background: ACCENT, opacity: i === 0 ? 1 : 0.75 }} />
                </span>
                <span className="text-right font-serif text-[18px] tabular-nums sm:col-start-4">{r.sold}</span>
                <span className="hidden text-right text-[12.5px] text-muted tabular-nums sm:block">
                  {t("Median", "Median")} {eur(r.median, { compact: true })} · <span className={trendClass(r.change12m)}>{pct(r.change12m, { digits: 0 })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <Takeaway>
        {t(
          <>
            Der <strong>{variantTitle(first)}</strong> wechselte {top[0].sold} Mal den Besitzer, öfter als jede andere Variante. Die zehn meistverkauften Varianten machen zusammen <strong>{pct(share, { signed: false, digits: 0 })}</strong> aller Verkäufe aus. Wer hier sucht, findet die größte Auswahl und die verlässlichsten Preise.
          </>,
          <>
            The <strong>{variantTitle(first)}</strong> changed hands {top[0].sold} times, more than any other variant. The ten best sellers together account for <strong>{pct(share, { signed: false, digits: 0 })}</strong> of all sales. Here buyers find the widest choice and the most reliable prices.
          </>,
        )}
      </Takeaway>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ model lines

function ModelLines() {
  const [metric, setMetric] = useState<"12m" | "5y">("12m");
  const [all, setAll] = useState(false);
  const rows = useMemo(() => {
    const key = metric === "12m" ? "change12m" : "cagr5";
    return [...generationRows()].sort((a, b) => b[key] - a[key]);
  }, [metric]);
  const key = metric === "12m" ? "change12m" : "cagr5";
  const shown = all ? rows : rows.length > 14 ? [...rows.slice(0, 7), ...rows.slice(-7)] : rows;
  const best = rows[0];
  const worst = rows[rows.length - 1];
  const positive = rows.filter((r) => r[key] > 0).length;
  return (
    <Section
      eyebrow={chapterLabel("modellreihen")}
      title={t("Modellreihen im Vergleich", "Model lines compared")}
      sub={t("Wertentwicklung je Modellreihe, Median der bewerteten Varianten", "Value trend per model line, median of the valued variants")}
      actions={
        <Segmented
          options={[
            { value: "12m", label: t("12 Monate", "12 months") },
            { value: "5y", label: t("Pro Jahr, 5 Jahre", "Per year, 5 years") },
          ]}
          value={metric}
          onChange={setMetric}
        />
      }
    >
      <Card
        title={all || rows.length <= 14 ? t(`Alle ${rows.length} Modellreihen`, `All ${rows.length} model lines`) : t("Die sieben stärksten und schwächsten", "The seven strongest and weakest")}
        actions={
          rows.length > 14 ? (
            <button onClick={() => setAll((a) => !a)} className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
              {all ? t("Weniger anzeigen", "Show fewer") : t(`Alle ${rows.length} anzeigen`, `Show all ${rows.length}`)}
            </button>
          ) : undefined
        }
      >
        <RankBars
          rows={shown.map((r) => ({
            key: r.id,
            label: r.label,
            href: r.href,
            value: r[key],
            display: pct(r[key]),
            note: `${r.variants} ${t("Varianten", "variants")} · ${t("Median", "median")} ${eur(r.value, { compact: true })}`,
          }))}
        />
      </Card>
      {best && worst && (
        <Takeaway>
          {metric === "12m"
            ? t(
                <>
                  {positive} von {rows.length} Modellreihen haben in 12 Monaten zugelegt. Vorne liegt der <strong>{best.label}</strong> ({pct(best.change12m)}), am schwächsten entwickelte sich der <strong>{worst.label}</strong> ({pct(worst.change12m)}).
                </>,
                <>
                  {positive} of {rows.length} model lines gained over 12 months. The <strong>{best.label}</strong> leads ({pct(best.change12m)}), the <strong>{worst.label}</strong> was weakest ({pct(worst.change12m)}).
                </>,
              )
            : t(
                <>
                  Über fünf Jahre hat der <strong>{best.label}</strong> mit {pct(best.cagr5)} pro Jahr am stärksten zugelegt; {positive} von {rows.length} Modellreihen liegen im Plus.
                </>,
                <>
                  Over five years the <strong>{best.label}</strong> gained most, {pct(best.cagr5)} a year; {positive} of {rows.length} model lines are up.
                </>,
              )}
        </Takeaway>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ auction market

function AuctionMarket() {
  const years = useMemo(() => auctionYears().filter((y) => y.lots >= 200), []);
  const first = years[0];
  const last = years[years.length - 1];
  const full = years.filter((y) => !y.partial);
  const prev = full[full.length - 1];
  const peak = full.reduce((a, b) => (b.sellThrough > a.sellThrough ? b : a), full[0]);
  const partialNote = last?.partial ? t(`${last.year} bis ${date(AS_OF)}`, `${last.year} up to ${date(AS_OF)}`) : null;

  const houses = houseStats();
  const cal = auctionCalendar();
  const calData = cal.months.map((v, m) => ({ m, label: monthName(m), v }));
  const top2 = [...calData].sort((a, b) => b.v - a.v).slice(0, 2);
  const avg = cal.months.reduce((s, v) => s + v, 0) / 12;
  const best = houses[0];
  const worst = houses[houses.length - 1];
  const houseRows = houses.map((h) => ({
    key: h.house,
    label: h.house,
    value: h.sellThrough,
    display: pct(h.sellThrough, { signed: false, digits: 0 }),
    note: `${num(h.lots)} ${t("Lose", "lots")}${h.online ? ` · ${t("online", "online")}` : ""}`,
  }));
  const half = Math.ceil(houseRows.length / 2);

  if (!first || !last || !prev) return null;
  return (
    <Section
      eyebrow={chapterLabel("auktionen")}
      title={t("Auktionsmarkt", "Auction market")}
      sub={t("Wie viele Lose einen Käufer finden, wann versteigert wird und bei welchem Haus. Alle erfassten Lose der Varianten auf Carbay, verkauft und nicht verkauft.", "How many lots find a buyer, when sales happen and at which house. All recorded lots of the variants on Carbay, sold and unsold.")}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("Verkaufsquote je Jahr", "Sell-through per year")} sub={t("Anteil der Lose mit Zuschlag", "Share of lots that sold")}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={years} margin={{ top: 8, right: 4, left: -2, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="year" {...axisProps} tickFormatter={(y) => `’${String(y).slice(2)}`} interval={0} />
                <YAxis {...axisProps} width={44} domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v) => pct(Number(v), { signed: false, digits: 0 })} />
                <Tooltip
                  cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const r = active && payload?.length ? (payload[0].payload as (typeof years)[number]) : null;
                    return r ? (
                      <ChartTooltipBox
                        title={r.partial ? partialNote! : String(r.year)}
                        rows={[
                          { label: t("Verkaufsquote", "Sell-through"), value: pct(r.sellThrough, { signed: false, digits: 0 }), color: ACCENT },
                          { label: t("Lose", "Lots"), value: num(r.lots) },
                        ]}
                      />
                    ) : null;
                  }}
                />
                <Bar dataKey="sellThrough" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28}>
                  {years.map((y) => (
                    <Cell key={y.year} fill={ACCENT} fillOpacity={y.partial ? 0.4 : y.year === peak.year ? 1 : 0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {t(
              <>
                {last.partial ? `${last.year} bisher` : last.year} <strong className="text-ink">{pct(last.sellThrough, { signed: false, digits: 0 })}</strong> nach {pct(prev.sellThrough, { signed: false, digits: 0 })} im Jahr {prev.year}. Das Hoch gab es {peak.year} mit {pct(peak.sellThrough, { signed: false, digits: 0 })} (kräftiger Balken), {first.year} waren es nur {pct(first.sellThrough, { signed: false, digits: 0 })}.
                {partialNote && ` Der blasse Balken zeigt ${partialNote}, das Jahr ist noch nicht abgeschlossen.`}
              </>,
              <>
                {last.partial ? `${last.year} so far` : last.year}: <strong className="text-ink">{pct(last.sellThrough, { signed: false, digits: 0 })}</strong>, after {pct(prev.sellThrough, { signed: false, digits: 0 })} in {prev.year}. The peak was {peak.year} at {pct(peak.sellThrough, { signed: false, digits: 0 })} (solid bar); in {first.year} it was only {pct(first.sellThrough, { signed: false, digits: 0 })}.
                {partialNote && ` The pale bar shows ${partialNote}; the year is not yet complete.`}
              </>,
            )}
          </p>
        </Card>
        <Card title={t("Saison", "Season")} sub={t(`Saalauktionen je Monat, Durchschnitt ${cal.from}–${cal.to}`, `Live auctions per month, average ${cal.from}–${cal.to}`)}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calData} margin={{ top: 8, right: 4, left: -2, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} />
                <YAxis {...axisProps} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const r = active && payload?.length ? (payload[0].payload as (typeof calData)[number]) : null;
                    return r ? <ChartTooltipBox title={monthName(r.m, "long")} rows={[{ label: t("Ø Lose", "Avg. lots"), value: num(r.v), color: ACCENT }]} /> : null;
                  }}
                />
                <ReferenceLine y={avg} stroke="var(--color-line-2)" strokeDasharray="4 3" label={{ value: t("Schnitt", "Avg."), position: "insideTopRight", fontSize: 10.5, fill: "var(--color-faint)" }} />
                <Bar dataKey="v" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={28}>
                  {calData.map((d) => (
                    <Cell key={d.m} fill={ACCENT} fillOpacity={top2.some((x) => x.m === d.m) ? 1 : 0.45} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {top2.length === 2 && (
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              {t(
                <>
                  Hochsaison im <strong className="text-ink">{monthName(top2[0].m, "long")}</strong> und <strong className="text-ink">{monthName(top2[1].m, "long")}</strong>, jeweils mindestens {pct(top2[1].v / avg - 1, { signed: false, digits: 0 })} über dem Monatsschnitt. Dann finden Verkäufer die meisten Bieter und Käufer die größte Auswahl.
                </>,
                <>
                  Peak season in <strong className="text-ink">{monthName(top2[0].m, "long")}</strong> and <strong className="text-ink">{monthName(top2[1].m, "long")}</strong>, each at least {pct(top2[1].v / avg - 1, { signed: false, digits: 0 })} above the monthly average. Sellers find the most bidders then, buyers the widest choice.
                </>,
              )}
            </p>
          )}
        </Card>
      </div>
      {houseRows.length > 0 && (
        <Card className="mt-6" title={t("Verkaufsquote je Auktionshaus", "Sell-through by auction house")} sub={t("letzte fünf Jahre, Häuser mit mindestens 150 Losen", "last five years, houses with at least 150 lots")}>
          <div className="grid gap-x-10 lg:grid-cols-2">
            <RankBars tone="accent" rows={houseRows.slice(0, half)} />
            {houseRows.length > half && <RankBars tone="accent" rows={houseRows.slice(half)} max={houseRows[0].value} />}
          </div>
        </Card>
      )}
      {best && worst && (
        <Takeaway>
          {t(
            <>
              Bei <strong>{best.house}</strong> finden {pct(best.sellThrough, { signed: false, digits: 0 })} der Fahrzeuge einen Käufer, bei <strong>{worst.house}</strong> nur {pct(worst.sellThrough, { signed: false, digits: 0 })}. Sehr hohe Quoten deuten meist auf Versteigerungen ohne Mindestpreis hin, niedrige auf ehrgeizige Mindestpreise.
            </>,
            <>
              At <strong>{best.house}</strong> {pct(best.sellThrough, { signed: false, digits: 0 })} of cars find a buyer, at <strong>{worst.house}</strong> only {pct(worst.sellThrough, { signed: false, digits: 0 })}. Very high rates usually point to no-reserve sales, low ones to ambitious reserves.
            </>,
          )}
        </Takeaway>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ price drivers

function PriceDrivers() {
  const bands = mileageBands();
  const us = usPremium();
  const body = bodyPremium();
  const data = bands.map((b) => ({ ...b, label: b.to === null ? `> ${num(b.from / 1000)}` : b.from === 0 ? `< ${num(b.to / 1000)}` : `${num(b.from / 1000)}–${num(b.to / 1000)}`, long: b.to === null ? `> ${km(b.from)}` : b.from === 0 ? `< ${km(b.to)}` : `${num(b.from / 1000)}–${km(b.to)}` }));
  const low = bands.filter((b) => b.to !== null && b.to <= 30_000);
  const high = bands.filter((b) => b.from >= 100_000);
  const lowEffect = low.length ? Math.max(...low.map((b) => b.effect)) : null;
  const highEffect = high.length ? Math.min(...high.map((b) => b.effect)) : null;
  const n = bands.reduce((s, b) => s + b.n, 0);

  return (
    <Section eyebrow={chapterLabel("preis")} title={t("Was den Preis bestimmt", "What drives the price")} sub={t("Gemessen an tatsächlich bezahlten Auktionspreisen, jeweils im Vergleich zum Marktwert derselben Variante", "Measured on prices actually paid at auction, each compared with the market value of the same variant")}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {data.length >= 3 && (
          <Card title={t("Laufleistung", "Mileage")} sub={t(`Preisabweichung vom Variantendurchschnitt, ${num(n)} Verkäufe`, `Price difference to the variant average, ${num(n)} sales`)}>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 14 }}>
                  <CartesianGrid stroke="var(--color-line)" vertical={false} />
                  <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} label={{ value: t("Laufleistung in Tsd. km", "Mileage in thousand km"), position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--color-faint)" }} />
                  <YAxis {...axisProps} width={48} tickFormatter={(v) => pct(Number(v), { digits: 0 })} />
                  <ReferenceLine y={0} stroke="var(--color-line-2)" />
                  <Tooltip
                    cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                    content={({ active, payload }) => {
                      const r = active && payload?.length ? (payload[0].payload as (typeof data)[number]) : null;
                      return r ? (
                        <ChartTooltipBox
                          title={r.long}
                          rows={[
                            { label: t("Preiseffekt", "Price effect"), value: pct(r.effect), color: r.effect >= 0 ? UP : DOWN },
                            { label: t("Verkäufe", "Sales"), value: num(r.n) },
                          ]}
                        />
                      ) : null;
                    }}
                  />
                  <Bar dataKey="effect" radius={2} isAnimationActive={false} maxBarSize={44}>
                    {data.map((b) => (
                      <Cell key={b.from} fill={b.effect >= 0 ? UP : DOWN} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {lowEffect !== null && highEffect !== null && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
                {t(
                  <>
                    Wenig gefahrene Fahrzeuge erzielen bis zu <strong className="whitespace-nowrap text-up">{pct(lowEffect, { signed: false, digits: 0 })}</strong> mehr als der Durchschnitt ihrer Variante, Fahrzeuge mit über 100.000 km bis zu <strong className="whitespace-nowrap text-down">{pct(-highEffect, { signed: false, digits: 0 })}</strong> weniger.
                  </>,
                  <>
                    Low-mileage cars fetch up to <strong className="whitespace-nowrap text-up">{pct(lowEffect, { signed: false, digits: 0 })}</strong> more than their variant's average, cars over 100,000 km up to <strong className="whitespace-nowrap text-down">{pct(-highEffect, { signed: false, digits: 0 })}</strong> less.
                  </>,
                )}
              </p>
            )}
          </Card>
        )}
        <div className="grid content-start gap-6">
          {(us.classicLive !== null || us.modernLive !== null) && (
            <Card title={t("USA gegenüber Europa", "USA vs. Europe")} sub={t("gleiche Variante, Auktion", "same variant, auction")}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {us.classicLive !== null && <Kpi label={t("Klassiker", "Classics")} value={<span className={trendClass(us.classicLive)}>{pct(us.classicLive, { digits: 0 })}</span>} />}
                {us.modernLive !== null && <Kpi label={t("Moderne Fahrzeuge", "Modern cars")} value={<span className={trendClass(us.modernLive)}>{pct(us.modernLive, { digits: 0 })}</span>} />}
              </dl>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                {t(
                  "So viel höher liegen US-Zuschläge im Schnitt. Unser Marktwert rechnet diesen Unterschied heraus, damit Preise aus beiden Märkten vergleichbar sind.",
                  "This is how much higher US hammer prices are on average. Our market value corrects for this difference so prices from both markets are comparable.",
                )}
              </p>
            </Card>
          )}
          {(body.Cabriolet || body.Targa) && (
            <Card title={t("Karosserie", "Body style")} sub={t("gegenüber dem Coupé derselben Variante", "vs. the coupé of the same variant")}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                {body.Cabriolet && <Kpi label="Cabriolet" value={<span className={trendClass(body.Cabriolet.effect)}>{pct(body.Cabriolet.effect, { digits: 0 })}</span>} note={t(`${body.Cabriolet.variants} Varianten`, `${body.Cabriolet.variants} variants`)} />}
                {body.Targa && <Kpi label="Targa" value={<span className={trendClass(body.Targa.effect)}>{pct(body.Targa.effect, { digits: 0 })}</span>} note={t(`${body.Targa.variants} Varianten`, `${body.Targa.variants} variants`)} />}
              </dl>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                {t("Die Karosserieform verändert den Preis weit weniger als Laufleistung oder Markt.", "Body style moves the price far less than mileage or market.")}
              </p>
            </Card>
          )}
        </div>
      </div>
    </Section>
  );
}

// ------------------------------------------------------------------------------------------------ rarity

type Point = { id: string; title: string; x: number; y: number; z: number; value: number };

function RarityScatter() {
  const navigate = useNavigate();
  const points = useMemo(
    () =>
      variants
        .filter((v) => v.measured)
        .map((v): Point => {
          const m = getMetrics(v.id);
          return { id: v.id, title: variantTitle(v), x: m.rarityScore, y: m.cagr5 * 100, z: Math.sqrt(m.value), value: m.value };
        }),
    [],
  );
  const rare = points.filter((p) => p.x >= 70);
  const common = points.filter((p) => p.x < 40);
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const cagr = t("Rendite p. a. 5 J.", "Return p.a. 5Y");
  return (
    <>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
            <CartesianGrid stroke="var(--color-line)" />
            <XAxis type="number" dataKey="x" name={t("Seltenheit", "Rarity")} {...axisProps} domain={[0, 100]} label={{ value: t("Seltenheit (0–100)", "Rarity (0–100)"), position: "insideBottomRight", offset: -4, fontSize: 11, fill: "var(--color-faint)" }} />
            <YAxis type="number" dataKey="y" name={cagr} {...axisProps} width={44} tickFormatter={(v) => pct(Number(v) / 100, { signed: false, digits: 0 })} />
            <ZAxis type="number" dataKey="z" range={[25, 420]} />
            <ReferenceLine y={0} stroke="var(--color-line-2)" />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && payload?.length ? (payload[0].payload as Point) : null;
                return p ? (
                  <ChartTooltipBox
                    title={p.title}
                    rows={[
                      { label: t("Seltenheit", "Rarity"), value: `${p.x} / 100` },
                      { label: cagr, value: pct(p.y / 100) },
                      { label: t("Marktwert", "Market value"), value: eur(p.value) },
                    ]}
                  />
                ) : null;
              }}
            />
            <Scatter
              data={points}
              fill={ACCENT}
              fillOpacity={0.6}
              cursor="pointer"
              isAnimationActive={false}
              onClick={(d: unknown) => {
                const id = (d as { payload?: Point; id?: string }).payload?.id ?? (d as { id?: string }).id;
                if (id) navigate(`/markt/${id}`);
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {rare.length >= 5 && common.length >= 5 && (
        <Takeaway>
          {t(
            <>
              Sehr seltene Varianten (Seltenheit ab 70) legten im Median <strong>{pct(med(rare.map((p) => p.y)) / 100)}</strong> pro Jahr zu, häufige (unter 40) <strong>{pct(med(common.map((p) => p.y)) / 100)}</strong>. Ein Klick auf einen Punkt öffnet die Marktseite der Variante.
            </>,
            <>
              Very rare variants (rarity 70+) gained a median <strong>{pct(med(rare.map((p) => p.y)) / 100)}</strong> a year, common ones (below 40) <strong>{pct(med(common.map((p) => p.y)) / 100)}</strong>. Click a dot to open its market page.
            </>,
          )}
        </Takeaway>
      )}
    </>
  );
}
