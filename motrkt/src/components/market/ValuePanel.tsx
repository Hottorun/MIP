import { useMemo, useState } from "react";
import { Area, Bar, BarChart, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowUpRight, Gauge, Receipt, Sparkles, TrendingDown, TrendingUp, Wrench } from "lucide-react";
import { generationById, modelById, variantTitle } from "../../data/db";
import type { Variant } from "../../data/types";
import { AS_OF, WEEK, getSales, getSeries, hasRealSales } from "../../data/generate";
import { RANGES, generationIndex, getMetrics, modelIndex, type RangeKey } from "../../data/market";
import { cn, date, eur, km, num, pct } from "../../lib/format";
import { ChartTooltipBox, Pill, Segmented, axisProps } from "../ui";

const RANGE_WEEKS: Record<RangeKey, number> = { "1M": 5, "6M": 26, "1J": 52, "5J": 260, "10J": 520, Max: 10_000 };

export function ValuePanel({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const [range, setRange] = useState<RangeKey>("5J");
  const gen = generationById.get(variant.generationId)!;
  const model = modelById.get(variant.modelId)!;
  const multiVariantGen = gen.variantIds.length > 1;

  const data = useMemo(() => {
    const s = getSeries(variant.id);
    const g = generationIndex(gen.id);
    const md = modelIndex(model.id);
    const from = Math.max(s[0].t, AS_OF - RANGE_WEEKS[range] * WEEK);
    const pick = <T extends { t: number }>(arr: T[]) => new Map(arr.filter((p) => p.t >= from).map((p) => [p.t, p]));
    const gm = pick(g);
    const mm = pick(md);
    const pts = s.filter((p) => p.t >= from);
    const g0 = gm.get(pts[0].t)?.value ?? 1;
    const m0 = mm.get(pts[0].t)?.value ?? 1;
    return pts.map((p) => ({
      t: p.t,
      price: p.value,
      v: (p.value / pts[0].value) * 100,
      g: gm.has(p.t) ? (gm.get(p.t)!.value / g0) * 100 : null,
      m: mm.has(p.t) ? (mm.get(p.t)!.value / m0) * 100 : null,
      volume: p.volume,
    }));
  }, [variant.id, gen.id, model.id, range]);

  const total = data.length > 1 ? data[data.length - 1].v / 100 - 1 : 0;
  const volumeSum = data.reduce((s, p) => s + p.volume, 0);
  const perQuarter = data.length > 1 ? (volumeSum / data.length) * 13 : 0;
  const short = RANGE_WEEKS[range] <= 52;
  const tickFmt = (t: number) => (short ? date(t, "month") : date(t, "year"));
  const ticks = useMemo(() => {
    if (data.length < 2) return undefined;
    const first = new Date(data[0].t);
    const out: number[] = [];
    const step = short ? (RANGE_WEEKS[range] <= 5 ? 1 : 2) : RANGE_WEEKS[range] > 300 ? 2 : 1;
    for (let y = first.getUTCFullYear(), mo = first.getUTCMonth() + 1; ; mo += short ? step : 12 * step) {
      const t = short ? Date.UTC(y, mo, 1) : Date.UTC(y + Math.ceil(mo / 12), 0, 1);
      if (t > data[data.length - 1].t) break;
      if (t >= data[0].t) out.push(t);
      if (out.length > 14) break;
    }
    return out;
  }, [data, range, short]);

  const kpis = [
    { label: "CAGR (5J)", value: pct(m.cagr5), cls: m.cagr5 >= 0 ? "text-up" : "text-down" },
    { label: "Volatilität (1J)", value: pct(m.vol1y, { signed: false }) },
    { label: "Rarity Score", value: <>{m.rarityScore} <span className="text-base text-muted">/ 100</span></> },
    { label: "Liquidität", value: <>{m.liquidity} <span className="text-base text-muted">/ 100</span></> },
  ];

  const side = [
    { icon: Receipt, label: "Ø Verkaufspreis", value: eur(m.avgPrice12m) },
    { icon: Gauge, label: "Median-Laufleistung", value: km(m.medianMileage) },
    { icon: Wrench, label: "Ø Zustand (Note)", value: m.avgCondition ? num(m.avgCondition, 1) : "–" },
    {
      icon: m.momentumScore >= 0 ? TrendingUp : TrendingDown,
      label: "Marktmomentum",
      value: (
        <span className={cn("inline-flex items-center gap-1", m.momentum === "Stark" || m.momentum === "Moderat" ? "text-up" : m.momentum === "Schwach" ? "text-down" : "text-muted")}>
          {m.momentum !== "Schwach" && m.momentum !== "Neutral" && <ArrowUpRight className="size-3.5" />}
          {m.momentum}
        </span>
      ),
    },
    { icon: TrendingDown, label: "Max. Drawdown (5J)", value: pct(m.maxDD5) },
  ];

  return (
    <section className="panel flex min-w-0 flex-col">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-line px-5 pt-4 pb-3 md:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 md:col-span-1">
          <div className="kpi-label flex items-center gap-2">
            Marktwert (Median)
            {hasRealSales(variant.id) ? (
              <Pill tone="up" className="py-0 text-[10px]">Echte Daten · {getSales(variant.id).length} Verkäufe</Pill>
            ) : (
              <Pill className="py-0 text-[10px]" >Demo-Daten</Pill>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-serif text-[34px] leading-none font-semibold tracking-tight">{eur(m.value)}</span>
            <Pill tone={m.change12m >= 0 ? "up" : "down"} className="text-sm">
              {m.change12m >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />} {pct(m.change12m)} (12M)
            </Pill>
          </div>
        </div>
        {kpis.map((k) => (
          <div key={k.label} className="md:border-l md:border-line md:pl-5">
            <div className="kpi-label">{k.label}</div>
            <div className={cn("kpi-value", k.cls)}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_230px]">
        <div className="flex min-w-0 flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="panel-title">Wertentwicklung – {variantTitle(variant)}</h2>
            <Segmented options={RANGES} value={range} onChange={setRange} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <Legend color="var(--color-gold)">{variant.name} (Index)</Legend>
            {multiVariantGen && <Legend color="#9aa1ab">{gen.name} Ø</Legend>}
            <Legend color="#9aa1ab" dashed>
              {model.name} gesamt
            </Legend>
          </div>
          <div className="relative mt-1 h-[210px] min-h-0">
            <div className={cn("absolute top-1 right-2 z-10 rounded-md border px-2 py-1 text-right text-sm font-semibold", total >= 0 ? "border-up/30 bg-up/10 text-up" : "border-down/30 bg-down/10 text-down")}>
              {pct(total)}
              <div className="text-[10px] font-normal text-muted">({range})</div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.4} />
                    <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={tickFmt} {...axisProps} />
                <YAxis {...axisProps} domain={["auto", "auto"]} width={44} tickFormatter={(v) => num(v)} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as (typeof data)[number];
                    return (
                      <ChartTooltipBox
                        title={date(p.t)}
                        rows={[
                          { label: "Marktwert", value: eur(p.price), color: "var(--color-gold)" },
                          { label: `${variant.name} Index`, value: num(p.v, 1) },
                          ...(multiVariantGen && p.g !== null ? [{ label: `${gen.name} Ø`, value: num(p.g, 1), color: "#9aa1ab" }] : []),
                          ...(p.m !== null ? [{ label: `${model.name} gesamt`, value: num(p.m, 1) }] : []),
                          { label: "Verkäufe (Woche)", value: p.volume },
                        ]}
                      />
                    );
                  }}
                />
                <Area type="monotone" dataKey="v" stroke="var(--color-gold)" strokeWidth={2} fill="url(#valueFill)" isAnimationActive={false} />
                {multiVariantGen && <Line type="monotone" dataKey="g" stroke="#9aa1ab" strokeWidth={1.4} dot={false} isAnimationActive={false} />}
                <Line type="monotone" dataKey="m" stroke="#9aa1ab" strokeDasharray="5 4" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="h-[46px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 32 }}>
                <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} hide />
                <Bar dataKey="volume" fill="#6b717b" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>Volumen (Anzahl Verkäufe)</span>
            <span>Ø {num(perQuarter, perQuarter < 10 ? 1 : 0)} / Quartal</span>
          </div>
        </div>

        <ul className="divide-y divide-line self-start rounded-lg border border-line bg-panel-2 px-3">
          {side.map((s) => (
            <li key={s.label} className="flex items-center gap-2.5 py-2.5 text-[13px]">
              <s.icon className="size-4 shrink-0 text-muted" />
              <span className="flex-1 text-muted">{s.label}</span>
              <span className="font-medium tabular-nums">{s.value}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 py-2.5 text-[11px] text-faint">
            <Sparkles className="size-3.5 text-gold" /> Basis: {m.sales12m} Transaktionen (12M)
          </li>
        </ul>
      </div>
    </section>
  );
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block size-2 rounded-full" style={{ background: color }} />
      )}
      {children}
    </span>
  );
}
