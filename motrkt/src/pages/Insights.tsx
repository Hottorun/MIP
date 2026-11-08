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
import { brandIndex, changeOver, cycleData, getMetrics, marketIndex, mean, RANGES, rebase, sliceRange, type RangeKey } from "../data/market";
import type { Variant } from "../data/types";
import { cn, date, eur, num, pct } from "../lib/format";
import { axisProps, Card, ChartTooltipBox, Segmented } from "../components/ui";
import { TrendHeatmap } from "../components/insights/TrendHeatmap";
import { brandColor, yearTicks } from "../components/insights/palette";

const ERAS: { label: string; test: (v: Variant) => boolean }[] = [
  { label: "Bis 1969", test: (v) => v.years[0] < 1970 },
  { label: "1970–1989", test: (v) => v.years[0] >= 1970 && v.years[0] < 1990 },
  { label: "1990–1999", test: (v) => v.years[0] >= 1990 && v.years[0] < 2000 },
  { label: "2000–2014", test: (v) => v.years[0] >= 2000 && v.years[0] < 2015 },
  { label: "ab 2015", test: (v) => v.years[0] >= 2015 },
];
const TAGS: { label: string; test: (v: Variant) => boolean }[] = [
  { label: "Turbo", test: (v) => v.tags.includes("Turbo") },
  { label: "Leichtbau", test: (v) => v.tags.includes("Leichtbau") },
  { label: "Allrad", test: (v) => v.tags.includes("Allrad") },
  { label: "Hybrid", test: (v) => v.tags.includes("Hybrid") },
  { label: "Ohne", test: (v) => !v.tags.length },
];

function segmentRows(defs: typeof ERAS) {
  return defs
    .map((d) => {
      const vs = variants.filter(d.test);
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
        <p className="mt-1 text-[14px] text-muted">Wie sich der Markt für alle {variants.length} Varianten entwickelt, Stand {date(AS_OF)}.</p>
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
    <Card title="Marktzyklus" sub="MOTRKT-Gesamtindex, Jahresmittel">
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
                      { label: "Langfristiger Trend", value: num(Number(payload[0].payload.trend), 1), color: "var(--color-muted)" },
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
        Der Gesamtmarkt liegt aktuell <strong className={gap >= 0 ? "text-up" : "text-down"}>{pct(Math.abs(gap), { signed: false })}</strong>{" "}
        {gap >= 0 ? "über" : "unter"} seinem langfristigen Trend ({pct(yoy)} in 12 Monaten). Das bisherige Hoch im Jahresmittel wurde {peak.year} erreicht
        {peak.year === lastRow.year ? " – der Zyklus befindet sich in einer Expansionsphase." : `; seitdem ${lastRow.value >= peak.value * 0.97 ? "nähert sich der Markt diesem Niveau wieder an." : "hat sich der Markt konsolidiert."}`}
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
    <Card title="Markenindizes" sub="indexiert = 100 zu Beginn" actions={<Segmented options={RANGES} value={range} onChange={setRange} />}>
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
          <button key={b.id} onClick={() => toggle(b.id)} className={cn("chip", hidden.has(b.id) && "opacity-40")} title="Ein-/ausblenden">
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
      title="Segmentanalyse"
      sub="Durchschnittliche Wertentwicklung je Gruppe"
      actions={
        <Segmented
          options={[
            { value: "era", label: "Nach Baujahr" },
            { value: "tag", label: "Nach Merkmal" },
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
            <YAxis {...axisProps} width={44} tickFormatter={(v) => `${v} %`} />
            <ReferenceLine y={0} stroke="var(--color-line-2)" />
            <Tooltip
              cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <ChartTooltipBox
                    title={`${label} · ${payload[0].payload.count} Varianten`}
                    rows={[
                      { label: "Ø 12M", value: pct(Number(payload[0].payload.change12m) / 100), color: "var(--color-gold)" },
                      { label: "Ø CAGR 5J", value: pct(Number(payload[0].payload.cagr5) / 100), color: "var(--color-line-2)" },
                    ]}
                  />
                ) : null
              }
            />
            <Legend wrapperStyle={{ fontSize: 13, color: "var(--color-muted)" }} formatter={(v) => (v === "change12m" ? "Letzte 12 Monate" : "Pro Jahr, letzte 5 Jahre")} />
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
          .filter((v) => v.brandId === b.id)
          .map((v): Point => {
            const m = getMetrics(v.id);
            return { id: v.id, title: variantTitle(v), x: mode === "rarity" ? m.rarityScore : m.vol1y * 100, y: m.cagr5 * 100, z: Math.sqrt(m.value), value: m.value };
          }),
      })),
    [mode],
  );
  const xLabel = mode === "rarity" ? "Rarity Score" : "Volatilität 1J";
  return (
    <Card
      title={mode === "rarity" ? "Seltenheit vs. Rendite" : "Rendite-Risiko-Profil"}
      sub={mode === "rarity" ? "Rarity Score vs. CAGR 5J, Größe = Marktwert" : "Volatilität vs. CAGR 5J"}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, left: -8, bottom: 8 }}>
            <CartesianGrid stroke="var(--color-line)" />
            <XAxis type="number" dataKey="x" name={xLabel} {...axisProps} domain={mode === "rarity" ? [0, 100] : ["auto", "auto"]} tickFormatter={(v) => (mode === "rarity" ? String(v) : `${v} %`)} />
            <YAxis type="number" dataKey="y" name="CAGR 5J" {...axisProps} width={44} tickFormatter={(v) => `${v} %`} />
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
                      { label: "CAGR 5J", value: pct(p.y / 100) },
                      { label: "Marktwert", value: eur(p.value) },
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
    const all = variants.map((v) => ({ v, m: getMetrics(v.id) }));
    const eras = segmentRows(ERAS).sort((a, b) => b.change12m - a.change12m);
    const byChange = [...all].sort((a, b) => b.m.change12m - a.m.change12m);
    const top = byChange[0];
    const flop = byChange[byChange.length - 1];
    const liquid = all.filter((x) => x.m.sales12m >= 10).sort((a, b) => b.m.sellThrough - a.m.sellThrough)[0];
    const brandRows = brands.map((b) => ({ b, c: changeOver(brandIndex(b.id), 52) })).sort((a, b) => b.c - a.c);
    const sharpe = [...all].filter((x) => x.m.vol1y > 0).sort((a, b) => b.m.cagr5 / b.m.vol1y - a.m.cagr5 / a.m.vol1y)[0];
    const momentum = all.filter((x) => x.m.momentum === "Stark").length;

    return [
      {
        title: `Stärkstes Segment: ${eras[0].label}`,
        body: `Fahrzeuge mit Baujahr ${eras[0].label} legten im Schnitt ${pct(eras[0].change12m / 100)} in 12 Monaten zu – schwächstes Segment ist ${eras[eras.length - 1].label} (${pct(eras[eras.length - 1].change12m / 100)}).`,
        href: "/modelle",
        cta: "Modelle ansehen",
      },
      {
        title: `Top-Performer: ${variantTitle(top.v)}`,
        body: `${pct(top.m.change12m)} in 12 Monaten auf ${eur(top.m.value)}. Momentum ${top.m.momentum.toLowerCase()}, Rarity ${top.m.rarityScore}/100.`,
        href: `/markt/${top.v.id}`,
        cta: "Marktdaten",
      },
      {
        title: `Größter Rücksetzer: ${variantTitle(flop.v)}`,
        body: `${pct(flop.m.change12m)} in 12 Monaten – Marktwert jetzt ${eur(flop.m.value)}. Mögliche Einstiegschance, wenn die Fundamentaldaten (CAGR 5J ${pct(flop.m.cagr5)}) intakt sind.`,
        href: `/markt/${flop.v.id}`,
        cta: "Analyse öffnen",
      },
      {
        title: `Höchste Verkaufsquote: ${variantTitle(liquid.v)}`,
        body: `${pct(liquid.m.sellThrough, { signed: false, digits: 0 })} der Auktionslose wurden verkauft (${liquid.m.sales12m} Transaktionen in 12M), Ø Zuschlag ${pct(liquid.m.premiumVsEstimate)} vs. Schätzung.`,
        href: `/auktionen?q=${encodeURIComponent(variantTitle(liquid.v))}`,
        cta: "Auktionen",
      },
      {
        title: `Marke mit Rückenwind: ${brandRows[0].b.name}`,
        body: `Der ${brandRows[0].b.name}-Index stieg um ${pct(brandRows[0].c)} in 12 Monaten; Schlusslicht ist ${brandRows[brandRows.length - 1].b.name} (${pct(brandRows[brandRows.length - 1].c)}). ${momentum} von ${all.length} Varianten zeigen starkes Momentum.`,
        href: `/modelle?marke=${brandRows[0].b.id}`,
        cta: `${brandRows[0].b.name}-Modelle`,
      },
      {
        title: `Bestes Rendite-Risiko-Verhältnis: ${variantTitle(sharpe.v)}`,
        body: `CAGR 5J ${pct(sharpe.m.cagr5)} bei nur ${pct(sharpe.m.vol1y, { signed: false })} Volatilität – Quote ${num(sharpe.m.cagr5 / sharpe.m.vol1y, 2)}.`,
        href: `/markt/${sharpe.v.id}`,
        cta: "Marktdaten",
      },
    ];
  }, []);

  return (
    <section className="grid gap-x-10 gap-y-8 border-y border-line py-8 md:grid-cols-3">
      {reports
        .filter((r) => brands.length > 1 || !r.title.startsWith("Marke"))
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

