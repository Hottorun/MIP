import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { brandIndex, changeOver, cycleData, getMetrics, marketIndex, mean, rangeOptions, rebase, sliceRange, type RangeKey } from "../data/market";
import type { Variant } from "../data/types";
import { cn, date, eur, num, pct } from "../lib/format";
import { axisProps, Card, ChartTooltipBox, Segmented } from "../components/ui";
import { TrendHeatmap } from "../components/insights/TrendHeatmap";
import { brandColor, yearTicks } from "../components/insights/palette";
import { t } from "../i18n";
import { tr } from "../i18n/terms";

const ERAS: { readonly label: string; test: (v: Variant) => boolean }[] = [
  { get label() { return t("Bis 1969", "Up to 1969"); }, test: (v) => v.years[0] < 1970 },
  { label: "1970–1989", test: (v) => v.years[0] >= 1970 && v.years[0] < 1990 },
  { label: "1990–1999", test: (v) => v.years[0] >= 1990 && v.years[0] < 2000 },
  { label: "2000–2014", test: (v) => v.years[0] >= 2000 && v.years[0] < 2015 },
  { get label() { return t("ab 2015", "from 2015"); }, test: (v) => v.years[0] >= 2015 },
];
const TAGS: { readonly label: string; test: (v: Variant) => boolean }[] = [
  { label: "Turbo", test: (v) => v.tags.includes("Turbo") },
  { get label() { return tr("Leichtbau"); }, test: (v) => v.tags.includes("Leichtbau") },
  { get label() { return tr("Allrad"); }, test: (v) => v.tags.includes("Allrad") },
  { label: "Hybrid", test: (v) => v.tags.includes("Hybrid") },
  { get label() { return t("Ohne", "None"); }, test: (v) => !v.tags.length },
];

function segmentRows(defs: typeof ERAS) {
  return defs
    .map((d) => {
      const vs = variants.filter((v) => v.measured && d.test(v));
      return {
        label: d.label,
        count: vs.length,
        change12m: mean(vs.map((v) => getMetrics(v.id).change12m)) * 100,
        cagr5: mean(vs.map((v) => getMetrics(v.id).cagr5)) * 100,
      };
    })
    .filter((r) => r.count > 0);
}

export default function Insights() {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Insights</h1>
        <p className="mt-1 text-[14px] text-muted">
          {t(`Wie sich der Markt für alle ${variants.length} Varianten entwickelt, Stand ${date(AS_OF)}.`, `How the market for all ${variants.length} variants is moving, as of ${date(AS_OF)}.`)}
        </p>
      </div>
      <Reports />
      <div className={cn("grid gap-6", brands.length > 1 && "xl:grid-cols-2")}>
        <MarketCycle />
        {brands.length > 1 && <BrandComparison />}
      </div>
      <TrendHeatmap />
      <div className="grid gap-6 xl:grid-cols-2">
        <Segments />
        <RiskScatter mode="rarity" />
      </div>
    </div>
  );
}

function MarketCycle() {
  const data = useMemo(() => cycleData(marketIndex()), []);
  const lastRow = data[data.length - 1];
  const gap = lastRow.value / lastRow.trend - 1;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a));
  const yoy = changeOver(marketIndex(), 52);
  return (
    <Card title={t("Marktzyklus", "Market cycle")} sub={t("Carbay-Gesamtindex, Jahresmittel", "Carbay overall index, annual average")}>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} width={40} domain={["auto", "auto"]} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={String(label)}
                    rows={[
                      { label: "Index", value: num(Number(payload[0].payload.value), 1), color: "var(--color-gold)" },
                      { label: t("Langfristiger Trend", "Long-term trend"), value: num(Number(payload[0].payload.trend), 1), color: "var(--color-muted)" },
                    ]}
                  />
                ) : null
              }
            />
            <Line dataKey="value" stroke="var(--color-gold)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--color-gold)" }} isAnimationActive={false} />
            <Line dataKey="trend" stroke="var(--color-muted)" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-ink/85">
        {t(
          <>
            Der Gesamtmarkt liegt aktuell <strong className={gap >= 0 ? "text-up" : "text-down"}>{pct(Math.abs(gap), { signed: false })}</strong>{" "}
            {gap >= 0 ? "über" : "unter"} seinem langfristigen Trend ({pct(yoy)} in 12 Monaten). Das bisherige Hoch im Jahresmittel wurde {peak.year} erreicht
            {peak.year === lastRow.year
              ? " – der Zyklus befindet sich in einer Expansionsphase."
              : `; seitdem ${lastRow.value >= peak.value * 0.97 ? "nähert sich der Markt diesem Niveau wieder an." : "hat sich der Markt konsolidiert."}`}
          </>,
          <>
            The overall market is currently <strong className={gap >= 0 ? "text-up" : "text-down"}>{pct(Math.abs(gap), { signed: false })}</strong>{" "}
            {gap >= 0 ? "above" : "below"} its long-term trend ({pct(yoy)} in 12 months). The highest annual average so far was reached in {peak.year}
            {peak.year === lastRow.year
              ? " – the cycle is in an expansion phase."
              : `; since then ${lastRow.value >= peak.value * 0.97 ? "the market has been approaching that level again." : "the market has consolidated."}`}
          </>,
        )}
      </p>
    </Card>
  );
}

function BrandComparison() {
  const [range, setRange] = useState<RangeKey>("5J");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
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
  const short = range === "1M" || range === "6M" || range === "1J";
  const lastRow = data[data.length - 1] ?? {};
  const toggle = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Card title={t("Markenindizes", "Brand indices")} sub={t("indexiert = 100 zu Beginn", "indexed = 100 at the start")} actions={<Segmented options={rangeOptions()} value={range} onChange={setRange} />}>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={short ? undefined : yearTicks(data[0]?.t ?? AS_OF, AS_OF)} tickFormatter={(t) => date(t, short ? "short" : "year")} minTickGap={short ? 40 : 8} {...axisProps} />
            <YAxis {...axisProps} width={40} domain={["auto", "auto"]} />
            <ReferenceLine y={100} stroke="var(--color-line-2)" />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={date(Number(label))}
                    rows={[...payload]
                      .sort((a, b) => Number(b.value) - Number(a.value))
                      .map((p) => ({ label: brands.find((b) => b.id === p.dataKey)?.name ?? String(p.dataKey), value: num(Number(p.value), 1), color: brandColor(String(p.dataKey)) }))}
                  />
                ) : null
              }
            />
            {brands
              .filter((b) => !hidden.has(b.id))
              .map((b) => (
                <Line key={b.id} dataKey={b.id} stroke={brandColor(b.id)} strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {brands.map((b) => (
          <button key={b.id} onClick={() => toggle(b.id)} className={cn("chip", hidden.has(b.id) && "opacity-40")} title={t("Ein-/ausblenden", "Show/hide")}>
            <span className="size-2 rounded-full" style={{ background: brandColor(b.id) }} />
            {b.name}
            {lastRow[b.id] !== undefined && <span className="tabular-nums text-faint">{pct(lastRow[b.id] / 100 - 1, { digits: 0 })}</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Segments() {
  const [by, setBy] = useState<"era" | "tag">("era");
  const data = useMemo(() => segmentRows(by === "era" ? ERAS : TAGS), [by]);
  return (
    <Card
      title={t("Segmentanalyse", "Segment analysis")}
      sub={t("Durchschnittliche Wertentwicklung je Gruppe", "Average value growth per group")}
      actions={
        <Segmented
          options={[
            { value: "era", label: t("Nach Baujahr", "By build year") },
            { value: "tag", label: t("Nach Merkmal", "By feature") },
          ]}
          value={by}
          onChange={setBy}
        />
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
            <CartesianGrid stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="label" {...axisProps} />
            <YAxis {...axisProps} width={44} tickFormatter={(v) => pct(Number(v) / 100, { signed: false, digits: 0 })} />
            <ReferenceLine y={0} stroke="var(--color-line-2)" />
            <Tooltip
              cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={`${label} · ${payload[0].payload.count} ${t("Varianten", "variants")}`}
                    rows={[
                      { label: "Ø 12M", value: pct(Number(payload[0].payload.change12m) / 100), color: "var(--color-gold)" },
                      { label: t("Ø CAGR 5J", "Ø CAGR 5Y"), value: pct(Number(payload[0].payload.cagr5) / 100), color: "var(--color-line-2)" },
                    ]}
                  />
                ) : null
              }
            />
            <Legend wrapperStyle={{ fontSize: 13, color: "var(--color-muted)" }} formatter={(v) => (v === "change12m" ? t("Letzte 12 Monate", "Last 12 months") : t("Pro Jahr, letzte 5 Jahre", "Per year, last 5 years"))} />
            <Bar dataKey="change12m" fill="var(--color-gold)" isAnimationActive={false} />
            <Bar dataKey="cagr5" fill="var(--color-line-2)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

type Point = { id: string; title: string; x: number; y: number; z: number; value: number };

function RiskScatter({ mode }: { mode: "rarity" | "vol" }) {
  const navigate = useNavigate();
  const byBrand = useMemo(
    () =>
      brands.map((b) => ({
        brand: b,
        points: variants
          .filter((v) => v.measured && v.brandId === b.id)
          .map((v): Point => {
            const m = getMetrics(v.id);
            return { id: v.id, title: variantTitle(v), x: mode === "rarity" ? m.rarityScore : m.vol1y * 100, y: m.cagr5 * 100, z: Math.sqrt(m.value), value: m.value };
          }),
      })),
    [mode],
  );
  const xLabel = mode === "rarity" ? "Rarity Score" : t("Volatilität 1J", "Volatility 1Y");
  const cagr = t("CAGR 5J", "CAGR 5Y");
  return (
    <Card
      title={mode === "rarity" ? t("Seltenheit vs. Rendite", "Rarity vs. return") : t("Rendite-Risiko-Profil", "Return-risk profile")}
      sub={mode === "rarity" ? t("Rarity Score vs. CAGR 5J, Größe = Marktwert", "Rarity score vs. CAGR 5Y, size = market value") : t("Volatilität vs. CAGR 5J", "Volatility vs. CAGR 5Y")}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
            <CartesianGrid stroke="var(--color-line)" />
            <XAxis type="number" dataKey="x" name={xLabel} {...axisProps} domain={mode === "rarity" ? [0, 100] : ["auto", "auto"]} tickFormatter={(v) => (mode === "rarity" ? String(v) : pct(Number(v) / 100, { signed: false, digits: 0 }))} />
            <YAxis type="number" dataKey="y" name={cagr} {...axisProps} width={44} tickFormatter={(v) => pct(Number(v) / 100, { signed: false, digits: 0 })} />
            <ZAxis type="number" dataKey="z" range={mode === "rarity" ? [25, 420] : [40, 40]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && payload?.length ? (payload[0].payload as Point) : null;
                return p ? (
                  <ChartTooltipBox
                    title={p.title}
                    rows={[
                      { label: xLabel, value: mode === "rarity" ? `${p.x} / 100` : pct(p.x / 100, { signed: false }) },
                      { label: cagr, value: pct(p.y / 100) },
                      { label: t("Marktwert", "Market value"), value: eur(p.value) },
                    ]}
                  />
                ) : null;
              }}
            />
            {byBrand.map(({ brand, points }) => (
              <Scatter
                key={brand.id}
                name={brand.name}
                data={points}
                fill={brandColor(brand.id)}
                fillOpacity={0.75}
                cursor="pointer"
                isAnimationActive={false}
                onClick={(d: unknown) => {
                  const id = (d as { payload?: Point; id?: string }).payload?.id ?? (d as { id?: string }).id;
                  if (id) navigate(`/markt/${id}`);
                }}
              />
            ))}
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Reports() {
  const reports = useMemo(() => {
    const all = variants.filter((v) => v.measured).map((v) => ({ v, m: getMetrics(v.id) }));
    const eras = segmentRows(ERAS).sort((a, b) => b.change12m - a.change12m);
    const byChange = [...all].sort((a, b) => b.m.change12m - a.m.change12m);
    const top = byChange[0];
    const flop = byChange[byChange.length - 1];
    const liquid = all.filter((x) => x.m.sales12m >= 10).sort((a, b) => b.m.sellThrough - a.m.sellThrough)[0];
    const brandRows = brands.map((b) => ({ b, c: changeOver(brandIndex(b.id), 52) })).sort((a, b) => b.c - a.c);
    const sharpe = [...all].filter((x) => x.m.vol1y > 0).sort((a, b) => b.m.cagr5 / b.m.vol1y - a.m.cagr5 / a.m.vol1y)[0];
    const momentum = all.filter((x) => x.m.momentum === "Stark").length;

    const first = eras[0];
    const lastEra = eras[eras.length - 1];
    const lead = brandRows[0].b.name;
    const tail = brandRows[brandRows.length - 1];
    return [
      {
        title: t(`Stärkstes Segment: ${first.label}`, `Strongest segment: ${first.label}`),
        body: t(
          `Fahrzeuge mit Baujahr ${first.label} legten im Schnitt ${pct(first.change12m / 100)} in 12 Monaten zu – schwächstes Segment ist ${lastEra.label} (${pct(lastEra.change12m / 100)}).`,
          `Cars in the ${first.label} segment gained ${pct(first.change12m / 100)} on average in 12 months – the weakest segment is ${lastEra.label} (${pct(lastEra.change12m / 100)}).`,
        ),
        href: "/modelle",
        cta: t("Modelle ansehen", "Browse models"),
      },
      {
        title: `${t("Top-Performer", "Top performer")}: ${variantTitle(top.v)}`,
        body: t(
          `${pct(top.m.change12m)} in 12 Monaten auf ${eur(top.m.value)}. Momentum ${top.m.momentum.toLowerCase()}, Rarity ${top.m.rarityScore}/100.`,
          `${pct(top.m.change12m)} in 12 months to ${eur(top.m.value)}. Momentum ${tr(top.m.momentum).toLowerCase()}, rarity ${top.m.rarityScore}/100.`,
        ),
        href: `/markt/${top.v.id}`,
        cta: t("Marktdaten", "Market data"),
      },
      {
        title: `${t("Größter Rücksetzer", "Biggest drop")}: ${variantTitle(flop.v)}`,
        body: t(
          `${pct(flop.m.change12m)} in 12 Monaten – Marktwert jetzt ${eur(flop.m.value)}. Mögliche Einstiegschance, wenn die Fundamentaldaten (CAGR 5J ${pct(flop.m.cagr5)}) intakt sind.`,
          `${pct(flop.m.change12m)} in 12 months – market value now ${eur(flop.m.value)}. A possible entry point if the fundamentals (CAGR 5Y ${pct(flop.m.cagr5)}) are intact.`,
        ),
        href: `/markt/${flop.v.id}`,
        cta: t("Analyse öffnen", "Open analysis"),
      },
      {
        title: `${t("Höchste Verkaufsquote", "Highest sell-through rate")}: ${variantTitle(liquid.v)}`,
        body: t(
          `${pct(liquid.m.sellThrough, { signed: false, digits: 0 })} der Auktionslose wurden verkauft (${liquid.m.sales12m} Transaktionen in 12M), Ø Zuschlag ${pct(liquid.m.premiumVsEstimate)} vs. Schätzung.`,
          `${pct(liquid.m.sellThrough, { signed: false, digits: 0 })} of auction lots sold (${liquid.m.sales12m} transactions in 12M), average hammer price ${pct(liquid.m.premiumVsEstimate)} vs. estimate.`,
        ),
        href: `/auktionen?q=${encodeURIComponent(variantTitle(liquid.v))}`,
        cta: t("Auktionen", "Auctions"),
      },
      {
        brand: true,
        title: `${t("Marke mit Rückenwind", "Brand with momentum")}: ${lead}`,
        body: t(
          `Der ${lead}-Index stieg um ${pct(brandRows[0].c)} in 12 Monaten; Schlusslicht ist ${tail.b.name} (${pct(tail.c)}). ${momentum} von ${all.length} Varianten zeigen starkes Momentum.`,
          `The ${lead} index rose ${pct(brandRows[0].c)} in 12 months; ${tail.b.name} brings up the rear (${pct(tail.c)}). ${momentum} of ${all.length} variants show strong momentum.`,
        ),
        href: `/modelle?marke=${brandRows[0].b.id}`,
        cta: t(`${lead}-Modelle`, `${lead} models`),
      },
      {
        title: `${t("Bestes Rendite-Risiko-Verhältnis", "Best return-to-risk ratio")}: ${variantTitle(sharpe.v)}`,
        body: t(
          `CAGR 5J ${pct(sharpe.m.cagr5)} bei nur ${pct(sharpe.m.vol1y, { signed: false })} Volatilität – Quote ${num(sharpe.m.cagr5 / sharpe.m.vol1y, 2)}.`,
          `CAGR 5Y ${pct(sharpe.m.cagr5)} with only ${pct(sharpe.m.vol1y, { signed: false })} volatility – ratio ${num(sharpe.m.cagr5 / sharpe.m.vol1y, 2)}.`,
        ),
        href: `/markt/${sharpe.v.id}`,
        cta: t("Marktdaten", "Market data"),
      },
    ];
  }, []);

  return (
    <section className="grid gap-x-10 gap-y-8 border-y border-line py-8 md:grid-cols-3">
      {reports
        .filter((r) => brands.length > 1 || !("brand" in r))
        .slice(0, 3)
        .map((r) => (
          <Link key={r.title} to={r.href} className="group flex flex-col">
            <h2 className="font-serif text-[19px] leading-snug group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{r.title}</h2>
            <p className="mt-2 flex-1 text-[14px] leading-relaxed text-muted">{r.body}</p>
            <span className="mt-3 text-[13px] text-ink">{r.cta}</span>
          </Link>
        ))}
    </section>
  );
}

