import { useMemo, useState } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { modelById } from "../../data/db";
import type { Variant } from "../../data/types";
import { AS_OF, WEEK, getSeries } from "../../data/generate";
import { getMetrics, modelIndex, type RangeKey } from "../../data/market";
import { date, eur, num, pct, trendClass } from "../../lib/format";
import { ChartTooltipBox, Section, Segmented, axisProps } from "../ui";

const RANGE_WEEKS: Partial<Record<RangeKey, number>> = { "1J": 52, "5J": 260, "10J": 520, Max: 10_000 };
const RANGE_OPTIONS = [
  { value: "1J" as const, label: "1 Jahr" },
  { value: "5J" as const, label: "5 Jahre" },
  { value: "10J" as const, label: "10 Jahre" },
  { value: "Max" as const, label: "Gesamt" },
];

export function ValuePanel({ variant }: { variant: Variant }) {
  const m = getMetrics(variant.id);
  const [range, setRange] = useState<"1J" | "5J" | "10J" | "Max">("5J");
  const model = modelById.get(variant.modelId)!;

  const data = useMemo(() => {
    const s = getSeries(variant.id);
    const from = Math.max(s[0].t, AS_OF - RANGE_WEEKS[range]! * WEEK);
    const pts = s.filter((p) => p.t >= from);
    const md = new Map(modelIndex(model.id).map((p) => [p.t, p.value]));
    const m0 = md.get(pts[0].t);
    // Model index rebased onto the variant's starting price so both lines share one euro axis.
    return pts.map((p) => ({
      t: p.t,
      price: p.value,
      model: m0 && md.has(p.t) ? (md.get(p.t)! / m0) * pts[0].value : null,
    }));
  }, [variant.id, model.id, range]);

  const change = data.length > 1 ? data[data.length - 1].price / data[0].price - 1 : 0;
  const short = range === "1J";
  const ticks = useMemo(() => {
    if (data.length < 2) return undefined;
    const out: number[] = [];
    const first = new Date(data[0].t);
    if (short) {
      for (let mo = first.getUTCMonth() + 1, y = first.getUTCFullYear(); Date.UTC(y, mo, 1) <= data[data.length - 1].t; mo += 2) out.push(Date.UTC(y, mo, 1));
    } else {
      const step = range === "5J" ? 1 : 2;
      for (let y = first.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= data[data.length - 1].t; y += step) out.push(Date.UTC(y, 0, 1));
    }
    return out;
  }, [data, range, short]);

  const label = RANGE_OPTIONS.find((o) => o.value === range)!.label;
  const stats = [
    { label: range === "Max" ? "Seit Beginn der Daten" : `Veränderung über ${label}`, value: <span className={trendClass(change)}>{pct(change)}</span> },
    { label: "Pro Jahr, letzte 5 Jahre", value: pct(m.cagr5) },
    { label: "Verkäufe, letzte 12 Monate", value: num(m.sales12m) },
  ];

  return (
    <Section title="Wertentwicklung" actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}>
      <div className="h-[300px] sm:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.16} />
                <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={(t) => date(t, short ? "month" : "year")} {...axisProps} dy={8} />
            <YAxis {...axisProps} orientation="right" domain={["auto", "auto"]} width={64} tickFormatter={(v) => eur(v, { compact: true })} />
            <Tooltip
              cursor={{ stroke: "var(--color-line-2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return <ChartTooltipBox title={date(p.t)} rows={[{ label: "Marktwert", value: eur(p.price) }]} />;
              }}
            />
            <Line type="monotone" dataKey="model" stroke="var(--color-faint)" strokeDasharray="3 4" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="price" stroke="var(--color-gold)" strokeWidth={1.75} fill="url(#valueFill)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
        <span className="inline-block w-5 border-t border-dashed border-faint" /> Alle {model.name}-Varianten zum Vergleich, auf denselben Startwert gesetzt
      </p>
      <dl className="mt-8 grid grid-cols-1 gap-6 border-t border-line pt-6 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-[13px] text-muted">{s.label}</dt>
            <dd className="mt-1 font-serif text-[26px] leading-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
