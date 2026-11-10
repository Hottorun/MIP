import { useMemo, useState } from "react";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bodyEffect, modelById, modelName } from "../../data/db";
import type { Body, Variant } from "../../data/types";
import { AS_OF, WEEK, getSeries } from "../../data/generate";
import { SEGMENT_LABEL, marketBasis } from "../../data/real/model";
import { getMetrics, modelIndex, type RangeKey } from "../../data/market";
import { date, eur, num, pct, trendClass } from "../../lib/format";
import { ChartTooltipBox, Section, Segmented, axisProps } from "../ui";
import { t } from "../../i18n";
import { tr } from "../../i18n/terms";

const RANGE_WEEKS: Partial<Record<RangeKey, number>> = { "1J": 52, "5J": 260, "10J": 520, Max: 10_000 };
const RANGE_OPTIONS = [
  { value: "1J" as const, get label() { return t("1 Jahr", "1 year"); } },
  { value: "5J" as const, get label() { return t("5 Jahre", "5 years"); } },
  { value: "10J" as const, get label() { return t("10 Jahre", "10 years"); } },
  { value: "Max" as const, get label() { return t("Gesamt", "All"); } },
];

export function ValuePanel({ variant, body = null }: { variant: Variant; body?: Body | null }) {
  if (!variant.measured) {
    return (
      <Section title={t("Wertentwicklung", "Value history")}>
        <p className="max-w-2xl text-[15px] text-muted">
          {t(
            "Für diese Variante gibt es zu wenige belegte Verkäufe und Angebote, um einen Wertverlauf zu berechnen. Wir zeigen hier bewusst keine Schätzung.",
            "There are too few recorded sales and listings of this variant to compute a value history. We deliberately show no estimate here.",
          )}
        </p>
      </Section>
    );
  }
  return <ValueChart variant={variant} body={body} />;
}

function ValueChart({ variant, body }: { variant: Variant; body: Body | null }) {
  // Body switcher: the variant's curve moved to the measured level of that body style.
  const eff = bodyEffect(variant, body);
  const bf = eff?.factor ?? 1;
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
      price: p.value * bf,
      model: m0 && md.has(p.t) ? (md.get(p.t)! / m0) * pts[0].value * bf : null,
    }));
  }, [variant.id, model.id, range, bf]);

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
    { label: range === "Max" ? t("Seit Beginn der Daten", "Since the data begins") : t(`Veränderung über ${label}`, `Change over ${label}`), value: <span className={trendClass(change)}>{pct(change)}</span> },
    { label: t("Pro Jahr, letzte 5 Jahre", "Per year, last 5 years"), value: pct(m.cagr5) },
    { label: t("Verkäufe, letzte 12 Monate", "Sales, last 12 months"), value: num(m.sales12m) },
  ];

  return (
    <Section title={t("Wertentwicklung", "Value history")} actions={<Segmented options={RANGE_OPTIONS} value={range} onChange={setRange} />}>
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
            <YAxis {...axisProps} orientation="right" domain={["auto", "auto"]} width={92} tickFormatter={(v) => eur(v, { compact: true })} />
            <Tooltip
              cursor={{ stroke: "var(--color-line-2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return <ChartTooltipBox title={date(p.t)} rows={[{ label: t("Marktwert", "Market value"), value: eur(p.price) }]} />;
              }}
            />
            <Line type="monotone" dataKey="model" stroke="var(--color-faint)" strokeDasharray="3 4" strokeWidth={1} dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="price" stroke="var(--color-gold)" strokeWidth={1.75} fill="url(#valueFill)" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
        <span className="inline-block w-5 border-t border-dashed border-faint" />{" "}
        {t(`Alle ${modelName(model)}-Varianten zum Vergleich, auf denselben Startwert gesetzt`, `All ${modelName(model)} variants for comparison, rebased to the same starting value`)}
      </p>
      <BasisNote variant={variant} />
      {body && eff && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-faint">
          {t(
            `Ansicht ${tr(body)}: der Verlauf der Variante, auf das gemessene Niveau der ${tr(body)}s umgerechnet (${pct(eff.factor - 1)}, ${num(eff.n)} Belege).`,
            `${tr(body)} view: the variant's curve moved to the measured level of ${tr(body)}s (${pct(eff.factor - 1)}, ${num(eff.n)} records).`,
          )}
        </p>
      )}
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

/** Where the curve comes from: own price path or segment index. */
function BasisNote({ variant }: { variant: Variant }) {
  const b = marketBasis(variant.id);
  if (!b) return null;
  const segment = tr(SEGMENT_LABEL[b.segment] ?? b.segment);
  return (
    <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
      {b.own
        ? t(
            `Verlauf aus ${num(b.n)} Belegen dieser Variante (geglätteter Median, zeitlich gewichtet), eingebettet in den Index „${segment}“.`,
            `Curve from ${num(b.n)} records of this variant (smoothed median, time-weighted), embedded in the “${segment}” index.`,
          )
        : t(
            `Niveau aus ${num(b.n)} Belegen dieser Variante; für einen eigenen Verlauf sind es zu wenige, er folgt dem Index „${segment}“.`,
            `Level from ${num(b.n)} records of this variant; too few for a curve of its own, so it follows the “${segment}” index.`,
          )}
    </p>
  );
}
