import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Trash2 } from "lucide-react";
import { variantById, variantTitle } from "../data/db";
import { AS_OF } from "../data/generate";
import { getMetrics, holdingValue, portfolioSeries, RANGES, sliceRange, type RangeKey } from "../data/market";
import type { Holding } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, km, pct, trendClass } from "../lib/format";
import { axisProps, ChartTooltipBox, Delta, Empty, Section, Segmented } from "../components/ui";
import { HoldingForm } from "../components/portfolio/HoldingForm";
import { WatchlistSection } from "../components/portfolio/Watchlist";
import { yearTicks } from "../components/insights/palette";

function csvCell(v: string | number) {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function Portfolio() {
  const { portfolio, addHolding, updateHolding, removeHolding, toast } = useStore();
  const [range, setRange] = useState<RangeKey>("5J");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | undefined>();

  const rows = useMemo(
    () =>
      portfolio.map((h) => {
        const v = variantById.get(h.variantId)!;
        const value = holdingValue(h);
        return { h, v, value, m: getMetrics(v.id), gain: value / h.purchasePrice - 1 };
      }),
    [portfolio],
  );

  const total = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.h.purchasePrice, 0);
  const perf12 = total ? rows.reduce((s, r) => s + r.m.change12m * r.value, 0) / total : 0;

  const chartData = useMemo(() => {
    const series = sliceRange(portfolioSeries(portfolio), range);
    return series.map((p) => ({
      t: p.t,
      value: p.value,
      cost: portfolio.filter((h) => h.purchaseDate <= p.t).reduce((s, h) => s + h.purchasePrice, 0),
    }));
  }, [portfolio, range]);

  const short = range === "1M" || range === "6M" || range === "1J";

  function exportCsv() {
    const header = ["Fahrzeug", "Variante-ID", "Zustand", "km", "Farbe", "Kaufdatum", "Kaufpreis EUR", "Marktwert EUR", "Gewinn %", "12M %", "Gewicht %", "Notiz"];
    const lines = rows.map((r) =>
      [
        variantTitle(r.v),
        r.v.id,
        r.h.condition,
        r.h.mileage,
        r.h.color,
        new Date(r.h.purchaseDate).toISOString().slice(0, 10),
        r.h.purchasePrice,
        Math.round(r.value),
        (r.gain * 100).toFixed(1),
        (r.m.change12m * 100).toFixed(1),
        ((r.value / total) * 100).toFixed(1),
        r.h.note,
      ]
        .map(csvCell)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `motrkt-portfolio-${new Date(AS_OF).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Portfolio als CSV exportiert");
  }

  const openAdd = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  return (
    <div className="space-y-20">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Portfolio</h1>
            <p className="mt-1 text-[14px] text-muted">Deine Sammlung, bewertet zum aktuellen Marktwert nach Zustand.</p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={exportCsv} disabled={!rows.length}>
              Als CSV exportieren
            </button>
            <button className="btn btn-gold" onClick={openAdd}>
              Fahrzeug hinzufügen
            </button>
          </div>
        </div>
        <dl className="mt-8 grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-3">
          <Kpi label={`Wert von ${rows.length} Fahrzeugen`} value={eur(total)} />
          <Kpi label={`Gewinn seit Kauf, Einstand ${eur(cost, { compact: true })}`} value={eur(total - cost)} tone={total - cost} />
          <Kpi label="Veränderung in 12 Monaten" value={pct(perf12)} tone={perf12} />
        </dl>
      </div>

      {rows.length === 0 ? (
        <Empty className="py-16">
          Noch keine Fahrzeuge im Portfolio.{" "}
          <button className="not-italic underline underline-offset-4 hover:text-ink" onClick={openAdd}>
            Erstes Fahrzeug hinzufügen
          </button>
        </Empty>
      ) : (
        <>
          <Section title="Wertentwicklung" sub="Marktwert gegenüber dem Einstand (gestrichelt)" actions={<Segmented options={RANGES} value={range} onChange={setRange} />}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.16} />
                      <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" ticks={short ? undefined : yearTicks(chartData[0]?.t ?? AS_OF, AS_OF)} tickFormatter={(t) => date(t, short ? "short" : "year")} {...axisProps} minTickGap={short ? 40 : 8} dy={8} />
                  <YAxis tickFormatter={(v) => eur(v, { compact: true })} width={72} orientation="right" {...axisProps} domain={["auto", "auto"]} />
                  <Tooltip
                    cursor={{ stroke: "var(--color-line-2)" }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltipBox
                          title={date(Number(label))}
                          rows={[
                            { label: "Marktwert", value: eur(Number(payload[0]?.payload.value)) },
                            { label: "Einstand", value: eur(Number(payload[0]?.payload.cost)) },
                          ]}
                        />
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--color-gold)" strokeWidth={1.75} fill="url(#pf-fill)" isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="cost" stroke="var(--color-faint)" strokeDasharray="3 4" dot={false} strokeWidth={1} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Bestand" sub={`${rows.length} Fahrzeuge`}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fahrzeug</th>
                    <th className="text-right">Laufleistung</th>
                    <th>Kaufdatum</th>
                    <th className="text-right">Kaufpreis</th>
                    <th className="text-right">Marktwert</th>
                    <th className="text-right">Gewinn</th>
                    <th className="text-right">12 Monate</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...rows]
                    .sort((a, b) => b.value - a.value)
                    .map((r) => (
                      <tr key={r.h.id}>
                        <td>
                          <Link to={`/markt/${r.v.id}`} className="block hover:text-gold-2">
                            <span className="font-serif text-[15.5px]">{variantTitle(r.v, { brand: false })}</span>
                            <span className="block text-[12.5px] text-muted">
                              {r.h.color}, Note {r.h.condition}
                            </span>
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{km(r.h.mileage)}</td>
                        <td className="tabular-nums">{date(r.h.purchaseDate)}</td>
                        <td className="text-right tabular-nums">{eur(r.h.purchasePrice)}</td>
                        <td className="text-right font-serif tabular-nums">{eur(r.value)}</td>
                        <td className={cn("text-right tabular-nums", trendClass(r.gain))}>{pct(r.gain)}</td>
                        <td className="text-right">
                          <Delta value={r.m.change12m} arrow={false} />
                        </td>
                        <td className="text-right">
                          <button
                            className="btn btn-ghost p-1.5"
                            aria-label="Bearbeiten"
                            onClick={() => {
                              setEditing(r.h);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            className="btn btn-ghost p-1.5 text-muted hover:text-down"
                            aria-label="Löschen"
                            onClick={() => {
                              if (confirm(`${variantTitle(r.v)} aus dem Portfolio entfernen?`)) {
                                removeHolding(r.h.id);
                                toast("Fahrzeug entfernt", "info");
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" strokeWidth={1.5} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      <WatchlistSection />

      <HoldingForm
        open={formOpen}
        holding={editing}
        onClose={() => setFormOpen(false)}
        onSave={(h) => {
          const v = variantById.get(h.variantId)!;
          if (editing) {
            updateHolding(editing.id, h);
            toast(`${variantTitle(v)} aktualisiert`);
          } else {
            addHolding(h);
            toast(`${variantTitle(v)} zum Portfolio hinzugefügt`);
          }
          setFormOpen(false);
        }}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return (
    <div>
      <dt className="kpi-label">{label}</dt>
      <dd className={cn("mt-1 font-serif text-[30px] leading-tight tabular-nums", tone !== undefined && trendClass(tone))}>{value}</dd>
    </div>
  );
}
