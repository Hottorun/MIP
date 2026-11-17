import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { brands, variants, variantTitle } from "../data/db";
import { AS_OF, getSeries } from "../data/generate";
import { brandIndex, changeOver, cycleData, getMetrics, marketIndex, rangeOptions, rebase, sliceRange, type RangeKey } from "../data/market";
import { auctionCalendar, auctionWindows, auctionYears, bodyPremium, generationRows, houseStats, mileageBands, usPremium } from "../data/insights";
import { cn, date, eur, num, pct, trendClass } from "../lib/format";
import { axisProps, Card, ChartTooltipBox, Delta, Section, Segmented, Sparkline } from "../components/ui";
import { TrendHeatmap } from "../components/insights/TrendHeatmap";
import { brandColor, yearTicks } from "../components/insights/palette";
import { locale, t } from "../i18n";

const GOLD = "var(--color-gold)";
const UP = "var(--color-up)";
const DOWN = "var(--color-down)";

const pp = (a: number, b: number) => {
  const d = (a - b) * 100;
  return `${d >= 0 ? "+" : "−"}${num(Math.abs(d), 1)} ${t("Pp.", "pp")}`;
};
const monthName = (m: number, style: "short" | "long" = "short") => new Date(Date.UTC(2020, m, 1)).toLocaleString(locale(), { month: style, timeZone: "UTC" });
const km = (n: number) => `${num(n / 1000)}${t(" Tsd. km", "k km")}`;

const NAV = () => [
  { id: "ueberblick", label: t("Überblick", "Overview") },
  { id: "markt", label: t("Marktentwicklung", "Market trend") },
  { id: "gewinner", label: t("Gewinner und Verlierer", "Gainers and losers") },
  { id: "modellreihen", label: t("Modellreihen", "Model lines") },
  { id: "auktionen", label: t("Auktionsmarkt", "Auction market") },
  { id: "preis", label: t("Preisfaktoren", "Price drivers") },
  { id: "haeuser", label: t("Häuser und Termine", "Houses and timing") },
  { id: "monate", label: t("Monat für Monat", "Month by month") },
  { id: "seltenheit", label: t("Seltenheit", "Rarity") },
];

export default function Insights() {
  return (
    <div>
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Insights</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-muted">
          {t(
            `Der Markt auf einen Blick: Wertentwicklung, Auktionsgeschehen und was den Preis bestimmt. Stand ${date(AS_OF)}, ${variants.filter((v) => v.measured).length} bewertete Varianten.`,
            `The market at a glance: value trends, auction activity and what drives prices. As of ${date(AS_OF)}, ${variants.filter((v) => v.measured).length} valued variants.`,
          )}
        </p>
      </div>
      <SectionNav />
      <div className="mt-8 space-y-16">
        <Anchor id="ueberblick">
          <KpiRow />
          <KeyFindings />
        </Anchor>
        <Anchor id="markt">
          <MarketTrend />
        </Anchor>
        <Anchor id="gewinner">
          <Movers />
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
        <Anchor id="haeuser">
          <HousesAndCalendar />
        </Anchor>
        <Anchor id="monate">
          <TrendHeatmap />
        </Anchor>
        <Anchor id="seltenheit">
          <Section title={t("Seltenheit und Rendite", "Rarity and return")} sub={t("Zahlen sich seltene Fahrzeuge langfristig aus? Jeder Punkt ist eine Variante, die Größe zeigt den Marktwert.", "Do rare cars pay off in the long run? Each dot is a variant, size shows market value.")}>
            <Card>
              <RarityScatter />
            </Card>
          </Section>
        </Anchor>
      </div>
    </div>
  );
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
      <div ref={barRef} className="no-scrollbar flex gap-5 overflow-x-auto">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            data-id={it.id}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 py-3 text-[13.5px] transition-colors",
              active === it.id ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {it.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Takeaway({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-3xl text-[14.5px] leading-relaxed text-ink/85">{children}</p>;
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

/** Headline figure with its history as a small line. */
function KpiCard({ label, value, delta, note, spark, sparkNote }: { label: string; value: ReactNode; delta?: ReactNode; note?: string; spark: number[]; sparkNote: string }) {
  return (
    <div className="panel flex min-w-0 flex-col justify-between gap-4 p-4 sm:p-5">
      <div>
        <div className="text-[13px] text-muted">{label}</div>
        <div className="mt-1.5 font-serif text-[30px] leading-none tabular-nums sm:text-[34px]">{value}</div>
        {(delta || note) && (
          <div className="mt-2 text-[12.5px] text-muted">
            {delta} {note}
          </div>
        )}
      </div>
      <div>
        <Sparkline values={spark} width={220} height={34} color={GOLD} fill className="block h-[34px] w-full" />
        <div className="mt-1 text-[11px] text-faint">{sparkNote}</div>
      </div>
    </div>
  );
}

type BarRow = { key: string; label: string; href?: string; value: number; display: string; note?: string; muted?: boolean };

/** Ranked horizontal bars in plain HTML: label, bar from a shared zero line, value. Negative values grow to the left. */
function RankBars({ rows, tone = "sign" }: { rows: BarRow[]; tone?: "sign" | "gold" }) {
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <ul className="divide-y divide-line/70">
      {rows.map((r) => {
        const left = r.value < 0 ? ((r.value - lo) / span) * 100 : zero;
        const width = (Math.abs(r.value) / span) * 100;
        const color = tone === "gold" ? GOLD : r.value >= 0 ? UP : DOWN;
        const label = r.href ? (
          <Link to={r.href} className="truncate hover:text-gold hover:underline hover:underline-offset-4">
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

function KpiRow() {
  const { now, before } = auctionWindows();
  const idxSeries = marketIndex();
  const idx = changeOver(idxSeries, 52);
  const years = auctionYears().filter((y) => y.lots >= 200);
  const full = years.filter((y) => !y.partial);
  const since = years[0]?.year;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <KpiCard
        label={t("Marktindex, 12 Monate", "Market index, 12 months")}
        value={<span className={trendClass(idx)}>{pct(idx)}</span>}
        note={t("über alle bewerteten Varianten", "across all valued variants")}
        spark={idxSeries.filter((_, i) => i % 4 === 0).map((p) => p.value)}
        sparkNote={t(`Verlauf seit ${date(idxSeries[0].t, "year")}`, `Trend since ${date(idxSeries[0].t, "year")}`)}
      />
      <KpiCard
        label={t("Verkaufsquote, 12 Monate", "Sell-through, 12 months")}
        value={pct(now.sellThrough, { signed: false, digits: 0 })}
        delta={<span className={trendClass(now.sellThrough - before.sellThrough)}>{pp(now.sellThrough, before.sellThrough)}</span>}
        note={t("ggü. Vorjahr", "vs. prior year")}
        spark={years.map((y) => y.sellThrough)}
        sparkNote={t(`je Jahr seit ${since}`, `per year since ${since}`)}
      />
      <KpiCard
        label={t("Versteigerte Fahrzeuge, 12 Monate", "Cars auctioned, 12 months")}
        value={num(now.lots)}
        delta={<Delta value={now.lots / before.lots - 1} arrow={false} digits={0} />}
        note={t("ggü. Vorjahr", "vs. prior year")}
        spark={full.map((y) => y.lots)}
        sparkNote={t(`je Jahr seit ${since}`, `per year since ${since}`)}
      />
    </div>
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
    const cal = auctionCalendar();
    const peakMonth = cal.months.indexOf(Math.max(...cal.months));
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
    out.push({
      id: "haeuser",
      kicker: t("Auktionskalender", "Auction calendar"),
      value: monthName(peakMonth, "long"),
      text: t("Der Monat mit den meisten Saalauktionen, die beste Zeit für Auswahl und Bieter.", "The month with the most live auctions, the best time for choice and bidders."),
    });
    return out;
  }, []);
  return (
    <div className="panel grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
      {items.map((it, i) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className={cn("group flex flex-col gap-1.5 p-4 transition-colors hover:bg-panel-2 sm:p-5", i % 2 === 1 && "sm:border-l sm:border-line xl:border-l-0", i >= 2 && "sm:border-t sm:border-line xl:border-t-0")}
        >
          <span className="text-[12px] uppercase tracking-[0.08em] text-faint">{it.kicker}</span>
          <span className="font-serif text-[24px] leading-tight tabular-nums">{it.value}</span>
          <span className="text-[13px] leading-snug text-muted">{it.text}</span>
          <span className="mt-auto pt-1 text-[12.5px] text-ink/70 group-hover:text-gold">{t("Zum Abschnitt", "Go to section")} →</span>
        </a>
      ))}
    </div>
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
  return (
    <Section title={t("Marktentwicklung", "Market trend")} sub={t("Gesamtindex aller bewerteten Varianten, gewichtet nach Marktwert", "Overall index of all valued variants, weighted by market value")}>
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
                  <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
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
                        { label: "Index", value: num(Number(payload[0].value), 1), color: GOLD },
                        { label: t("seit Beginn", "since start"), value: pct(Number(payload[0].value) / data[0].value - 1) },
                      ]}
                    />
                  ) : null
                }
              />
              <Area dataKey="value" stroke={GOLD} strokeWidth={2} fill="url(#mkt-fill)" dot={false} activeDot={{ r: 4, fill: GOLD, stroke: "var(--color-panel)", strokeWidth: 2 }} isAnimationActive={false} />
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
  const list = (rows: typeof up, title: string) => (
    <Card title={title}>
      <ol className="-mx-2">
        {rows.map(({ v, m }, i) => {
          const s = getSeries(v.id).slice(-weeks);
          const step = Math.max(1, Math.floor(s.length / 40));
          const value = metric === "12m" ? m.change12m : m.cagr5;
          return (
            <li key={v.id}>
              <Link to={`/markt/${v.id}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[2px] px-2 py-2.5 transition-colors hover:bg-panel-2 sm:grid-cols-[1.25rem_minmax(0,1fr)_88px_4.5rem]">
                <span className="text-[12px] tabular-nums text-faint">{i + 1}</span>
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
        {list(up, t("Stärkste Zuwächse", "Biggest gains"))}
        {list(down, t("Stärkste Rückgänge", "Biggest drops"))}
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

  const chart = (dataKey: "sellThrough", label: string) => (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={years} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
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
                    { label, value: pct(r[dataKey], { signed: false, digits: 0 }), color: GOLD },
                    { label: t("Lose", "Lots"), value: num(r.lots) },
                  ]}
                />
              ) : null;
            }}
          />
          <Bar dataKey={dataKey} radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={28}>
            {years.map((y) => (
              <Cell key={y.year} fill={GOLD} fillOpacity={y.partial ? 0.45 : 0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );

  if (!first || !last || !prev) return null;
  return (
    <Section title={t("Auktionsmarkt", "Auction market")} sub={t("Alle erfassten Auktionslose der Varianten auf Carbay, verkauft und nicht verkauft", "All recorded auction lots of the variants on Carbay, sold and unsold")}>
      <div>
        <Card title={t("Verkaufsquote", "Sell-through rate")} sub={t("Anteil der Lose mit Zuschlag", "Share of lots that sold")}>
          {chart("sellThrough", t("Verkaufsquote", "Sell-through"))}
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
            {t(
              <>
                {last.partial ? `${last.year} bisher` : last.year} <strong>{pct(last.sellThrough, { signed: false, digits: 0 })}</strong> nach {pct(prev.sellThrough, { signed: false, digits: 0 })} im Jahr {prev.year}. Den höchsten Wert gab es {peak.year} mit {pct(peak.sellThrough, { signed: false, digits: 0 })}, {first.year} waren es nur {pct(first.sellThrough, { signed: false, digits: 0 })}.
              </>,
              <>
                {last.partial ? `${last.year} so far` : last.year}: <strong>{pct(last.sellThrough, { signed: false, digits: 0 })}</strong>, after {pct(prev.sellThrough, { signed: false, digits: 0 })} in {prev.year}. The peak was {peak.year} at {pct(peak.sellThrough, { signed: false, digits: 0 })}; in {first.year} it was only {pct(first.sellThrough, { signed: false, digits: 0 })}.
              </>,
            )}
          </p>
        </Card>
      </div>
      {partialNote && <p className="mt-3 text-[12.5px] text-faint">{t(`Heller Balken: ${partialNote}, Jahr noch nicht abgeschlossen.`, `Lighter bar: ${partialNote}, year not yet complete.`)}</p>}
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
    <Section title={t("Was den Preis bestimmt", "What drives the price")} sub={t("Gemessen an tatsächlich bezahlten Auktionspreisen, jeweils im Vergleich zum Marktwert derselben Variante", "Measured on prices actually paid at auction, each compared with the market value of the same variant")}>
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

// ------------------------------------------------------------------------------------------------ houses and calendar

function HousesAndCalendar() {
  const houses = houseStats();
  const cal = auctionCalendar();
  const calData = cal.months.map((v, m) => ({ m, label: monthName(m), v }));
  const top2 = [...calData].sort((a, b) => b.v - a.v).slice(0, 2);
  const avg = cal.months.reduce((s, v) => s + v, 0) / 12;
  const best = houses[0];
  const worst = houses[houses.length - 1];
  return (
    <Section title={t("Auktionshäuser und Termine", "Auction houses and timing")} sub={t("Wo und wann Fahrzeuge versteigert werden, letzte fünf Jahre", "Where and when cars are auctioned, last five years")}>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t("Verkaufsquote je Auktionshaus", "Sell-through by auction house")} sub={t("Häuser mit mindestens 150 Losen", "Houses with at least 150 lots")}>
          <RankBars
            tone="gold"
            rows={houses.map((h) => ({
              key: h.house,
              label: h.house,
              value: h.sellThrough,
              display: pct(h.sellThrough, { signed: false, digits: 0 }),
              note: `${num(h.lots)} ${t("Lose", "lots")}${h.online ? ` · ${t("online", "online")}` : ""}`,
            }))}
          />
          {best && worst && (
            <p className="mt-4 text-[13.5px] leading-relaxed text-ink/85">
              {t(
                <>
                  Bei {best.house} finden {pct(best.sellThrough, { signed: false, digits: 0 })} der Fahrzeuge einen Käufer, bei {worst.house} nur {pct(worst.sellThrough, { signed: false, digits: 0 })}. Sehr hohe Quoten deuten meist auf Versteigerungen ohne Mindestpreis hin, niedrige auf ehrgeizige Mindestpreise.
                </>,
                <>
                  At {best.house} {pct(best.sellThrough, { signed: false, digits: 0 })} of cars find a buyer, at {worst.house} only {pct(worst.sellThrough, { signed: false, digits: 0 })}. Very high rates usually point to no-reserve sales, low ones to ambitious reserves.
                </>,
              )}
            </p>
          )}
        </Card>
        <Card title={t("Auktionskalender", "Auction calendar")} sub={t(`Saalauktionen je Monat, Durchschnitt ${cal.from}–${cal.to}`, `Live auctions per month, average ${cal.from}–${cal.to}`)}>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={calData} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval={0} tick={{ ...axisProps.tick, fontSize: 11 }} />
                <YAxis {...axisProps} width={44} />
                <Tooltip
                  cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                  content={({ active, payload }) => {
                    const r = active && payload?.length ? (payload[0].payload as (typeof calData)[number]) : null;
                    return r ? <ChartTooltipBox title={monthName(r.m, "long")} rows={[{ label: t("Ø Lose", "Avg. lots"), value: num(r.v), color: GOLD }]} /> : null;
                  }}
                />
                <Bar dataKey="v" radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={28}>
                  {calData.map((d) => (
                    <Cell key={d.m} fill={GOLD} fillOpacity={top2.some((x) => x.m === d.m) ? 0.95 : 0.55} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {top2.length === 2 && (
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
              {t(
                <>
                  Die meisten Fahrzeuge kommen im <strong>{monthName(top2[0].m, "long")}</strong> und im <strong>{monthName(top2[1].m, "long")}</strong> unter den Hammer, jeweils mindestens {pct(top2[1].v / avg - 1, { signed: false, digits: 0 })} mehr als im Monatsschnitt. Wer verkaufen will, findet dann die meisten Bieter, wer kaufen will, die größte Auswahl.
                </>,
                <>
                  Most cars go under the hammer in <strong>{monthName(top2[0].m, "long")}</strong> and <strong>{monthName(top2[1].m, "long")}</strong>, each at least {pct(top2[1].v / avg - 1, { signed: false, digits: 0 })} above the monthly average. Sellers find the most bidders then, buyers the widest choice.
                </>,
              )}
            </p>
          )}
        </Card>
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
              fill={GOLD}
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
