import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
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
import { AS_OF } from "../data/generate";
import { brandIndex, changeOver, cycleData, getMetrics, marketIndex, rangeOptions, rebase, sliceRange, type RangeKey } from "../data/market";
import { auctionCalendar, auctionWindows, auctionYears, bodyPremium, generationRows, houseStats, mileageBands, usPremium } from "../data/insights";
import { cn, date, eur, num, pct, trendClass } from "../lib/format";
import { axisProps, Card, ChartTooltipBox, Delta, Section, Segmented } from "../components/ui";
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

export default function Insights() {
  return (
    <div className="space-y-16">
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Insights</h1>
        <p className="mt-1 text-[14px] text-muted">
          {t(
            `Der Markt auf einen Blick: Wertentwicklung, Auktionsgeschehen und was den Preis bestimmt. Stand ${date(AS_OF)}, ${variants.filter((v) => v.measured).length} bewertete Varianten.`,
            `The market at a glance: value trends, auction activity and what drives prices. As of ${date(AS_OF)}, ${variants.filter((v) => v.measured).length} valued variants.`,
          )}
        </p>
      </div>
      <KpiRow />
      <MarketTrend />
      <Movers />
      <ModelLines />
      <AuctionMarket />
      <PriceDrivers />
      <HousesAndCalendar />
      <TrendHeatmap />
      <Section title={t("Seltenheit und Rendite", "Rarity and return")} sub={t("Zahlen sich seltene Fahrzeuge langfristig aus? Jeder Punkt ist eine Variante, die Größe zeigt den Marktwert.", "Do rare cars pay off in the long run? Each dot is a variant, size shows market value.")}>
        <RarityScatter />
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ building blocks

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

type BarRow = { key: string; label: string; href?: string; value: number; display: string; note?: string; muted?: boolean };

/** Ranked horizontal bars in plain HTML: label, bar from a shared zero line, value. Negative values grow to the left. */
function RankBars({ rows, tone = "sign" }: { rows: BarRow[]; tone?: "sign" | "gold" }) {
  const lo = Math.min(0, ...rows.map((r) => r.value));
  const hi = Math.max(0, ...rows.map((r) => r.value));
  const span = hi - lo || 1;
  const zero = (-lo / span) * 100;
  return (
    <ul className="space-y-1">
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
          <li key={r.key} className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.25rem] items-center gap-3 rounded-[2px] py-1 text-[13.5px] hover:bg-panel-2 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem]" title={r.note ? `${r.label}: ${r.display} · ${r.note}` : `${r.label}: ${r.display}`}>
            <span className={cn("flex min-w-0 flex-col", r.muted && "text-muted")}>
              {label}
              {r.note && <span className="truncate text-[11.5px] text-faint">{r.note}</span>}
            </span>
            <span className="relative h-3">
              {lo < 0 && <span className="absolute inset-y-[-3px] w-px bg-line-2" style={{ left: `${zero}%` }} />}
              <span className="absolute inset-y-0 rounded-[2px]" style={{ left: `${left}%`, width: `max(${width}%, 2px)`, background: color, opacity: r.muted ? 0.5 : 0.85 }} />
            </span>
            <span className="text-right tabular-nums">{r.display}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ KPI row

function KpiRow() {
  const { now, before } = auctionWindows();
  const idx = changeOver(marketIndex(), 52);
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
      <Kpi label={t("Marktindex, 12 Monate", "Market index, 12 months")} value={<span className={trendClass(idx)}>{pct(idx)}</span>} note={t("über alle Varianten", "across all variants")} />
      <Kpi
        label={t("Verkaufsquote", "Sell-through rate")}
        value={pct(now.sellThrough, { signed: false, digits: 0 })}
        delta={<span className={trendClass(now.sellThrough - before.sellThrough)}>{pp(now.sellThrough, before.sellThrough)}</span>}
        note={t("ggü. Vorjahr", "vs. prior year")}
      />
      <Kpi
        label={t("Versteigerte Fahrzeuge, 12 Monate", "Cars auctioned, 12 months")}
        value={num(now.lots)}
        delta={<Delta value={now.lots / before.lots - 1} arrow={false} digits={0} />}
        note={t("ggü. Vorjahr", "vs. prior year")}
      />
      <Kpi
        label={t("Anteil Online-Auktionen", "Share of online auctions")}
        value={pct(now.onlineShare, { signed: false, digits: 0 })}
        delta={<span className="text-ink/80">{pp(now.onlineShare, before.onlineShare)}</span>}
        note={t("ggü. Vorjahr", "vs. prior year")}
      />
    </dl>
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
  return (
    <Section
      title={t("Marktentwicklung", "Market trend")}
      sub={t("Gesamtindex aller bewerteten Varianten, gewichtet nach Marktwert", "Overall index of all valued variants, weighted by market value")}
      actions={<Segmented options={rangeOptions(["1J", "5J", "10J", "Max"])} value={range} onChange={setRange} />}
    >
      <div className="flex items-baseline gap-3">
        <span className={cn("font-serif text-[26px] tabular-nums", trendClass(change))}>{pct(change)}</span>
        <span className="text-[13px] text-muted">{t(`im gewählten Zeitraum, seit ${date(data[0]?.t ?? AS_OF)}`, `in the selected period, since ${date(data[0]?.t ?? AS_OF)}`)}</span>
      </div>
      <div className="mt-3 h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={short ? undefined : yearTicks(data[0]?.t ?? AS_OF, AS_OF)} tickFormatter={(v) => date(v, short ? "short" : "year")} minTickGap={short ? 40 : 8} {...axisProps} />
            <YAxis {...axisProps} width={40} domain={["auto", "auto"]} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? <ChartTooltipBox title={date(Number(label))} rows={[{ label: "Index", value: num(Number(payload[0].value), 1), color: GOLD }]} /> : null
              }
            />
            <Line dataKey="value" stroke={GOLD} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
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
  const { up, down, rising, total } = useMemo(() => {
    const all = variants.filter((v) => v.measured).map((v) => ({ v, m: getMetrics(v.id) }));
    const sorted = [...all].sort((a, b) => b.m.change12m - a.m.change12m);
    return { up: sorted.slice(0, 5), down: sorted.slice(-5).reverse(), rising: all.filter((x) => x.m.change12m > 0).length, total: all.length };
  }, []);
  const list = (rows: typeof up) => (
    <ol className="divide-y divide-line border-y border-line">
      {rows.map(({ v, m }, i) => (
        <li key={v.id}>
          <Link to={`/markt/${v.id}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-3 py-2.5 transition-colors hover:bg-panel-2">
            <span className="text-[12px] tabular-nums text-faint">{i + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14.5px]">{variantTitle(v)}</span>
              <span className="text-[12.5px] text-muted tabular-nums">{eur(m.value, { compact: true })}</span>
            </span>
            <Delta value={m.change12m} className="text-[14px]" />
          </Link>
        </li>
      ))}
    </ol>
  );
  return (
    <Section title={t("Gewinner und Verlierer", "Gainers and losers")} sub={t("Varianten mit der größten Wertveränderung in den letzten 12 Monaten", "Variants with the largest change in value over the last 12 months")}>
      <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-[13px] text-muted">{t("Stärkste Zuwächse", "Biggest gains")}</h3>
          {list(up)}
        </div>
        <div>
          <h3 className="mb-2 text-[13px] text-muted">{t("Stärkste Rückgänge", "Biggest drops")}</h3>
          {list(down)}
        </div>
      </div>
      <Takeaway>
        {t(
          <>
            <strong>{rising}</strong> von {total} Varianten sind in den letzten 12 Monaten im Wert gestiegen, {total - rising} gefallen.
          </>,
          <>
            <strong>{rising}</strong> of {total} variants rose in value over the last 12 months, {total - rising} fell.
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
      {!all && rows.length > 14 && <p className="mb-3 text-[12.5px] text-faint">{t("Die sieben stärksten und die sieben schwächsten Modellreihen", "The seven strongest and the seven weakest model lines")}</p>}
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
      {rows.length > 14 && (
        <button onClick={() => setAll((a) => !a)} className="mt-3 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline">
          {all ? t("Weniger anzeigen", "Show fewer") : t(`Alle ${rows.length} Modellreihen anzeigen`, `Show all ${rows.length} model lines`)}
        </button>
      )}
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

  const chart = (dataKey: "sellThrough" | "onlineShare", label: string) => (
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
      <div className="grid gap-6 lg:grid-cols-2">
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
        <Card title={t("Anteil Online-Auktionen", "Share of online auctions")} sub={t("Bring a Trailer, Cars & Bids, PCARMARKET", "Bring a Trailer, Cars & Bids, PCARMARKET")}>
          {chart("onlineShare", t("Online-Anteil", "Online share"))}
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink/85">
            {t(
              <>
                {first.year} liefen nur <strong>{pct(first.onlineShare, { signed: false, digits: 0 })}</strong> der Lose online, {last.partial ? "heute" : last.year} sind es <strong>{pct(last.onlineShare, { signed: false, digits: 0 })}</strong>. Der Markt hat sich vom Auktionssaal ins Netz verlagert.
              </>,
              <>
                In {first.year} only <strong>{pct(first.onlineShare, { signed: false, digits: 0 })}</strong> of lots ran online, {last.partial ? "today" : `in ${last.year}`} it is <strong>{pct(last.onlineShare, { signed: false, digits: 0 })}</strong>. The market has moved from the saleroom to the internet.
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
