import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Pencil, Trash2 } from "lucide-react";
import { variantById, variantTitle } from "../data/db";
import { AS_OF } from "../data/generate";
import { getMetrics, holdingValue, portfolioSeries, rangeOptions, sliceRange, type RangeKey } from "../data/market";
import type { Holding } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, km, pct, trendClass } from "../lib/format";
import { axisProps, ChartTooltipBox, Delta, Empty, Section, Segmented, Money } from "../components/ui";
import { HoldingForm } from "../components/portfolio/HoldingForm";
import { WatchlistSection } from "../components/portfolio/Watchlist";
import { yearTicks } from "../components/insights/palette";
import { t } from "../i18n";
import { tr } from "../i18n/terms";

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
    const header = t(
      ["Fahrzeug", "Variante-ID", "Zustand", "km", "Farbe", "Kaufdatum", "Kaufpreis EUR", "Marktwert EUR", "Gewinn %", "12M %", "Gewicht %", "Notiz"],
      ["Car", "Variant ID", "Condition", "km", "Colour", "Purchase date", "Purchase price EUR", "Market value EUR", "Gain %", "12M %", "Weight %", "Note"],
    );
    const lines = rows.map((r) =>
      [
        variantTitle(r.v),
        r.v.id,
        r.h.condition,
        r.h.mileage,
        tr(r.h.color),
        new Date(r.h.purchaseDate).toISOString().slice(0, 10),
        r.h.purchasePrice,
        Math.round(r.value),
        (r.gain * 100).toFixed(1),
        (r.m.change12m * 100).toFixed(1),
        ((r.value / total) * 100).toFixed(1),
        tr(r.h.note),
      ]
        .map(csvCell)
        .join(";"),
    );
    const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mip-portfolio-${new Date(AS_OF).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(t("Portfolio als CSV exportiert", "Portfolio exported as CSV"));
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
            <p className="mt-1 text-[14px] text-muted">{t("Deine Sammlung, bewertet zum aktuellen Marktwert nach Zustand.", "Your collection, valued at today's market value for its condition.")}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={exportCsv} disabled={!rows.length}>
              {t("Als CSV exportieren", "Export as CSV")}
            </button>
            <button className="btn btn-gold" onClick={openAdd}>
              {t("Fahrzeug hinzufügen", "Add car")}
            </button>
          </div>
        </div>
        <dl className="mt-8 grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-3">
          <Kpi label={t(`Wert von ${rows.length} Fahrzeugen`, `Value of ${rows.length} cars`)} value={<Money value={total} />} />
          <Kpi label={t(`Gewinn seit Kauf, Einstand ${eur(cost, { compact: true })}`, `Gain since purchase, cost ${eur(cost, { compact: true })}`)} value={<Money value={total - cost} />} tone={total - cost} />
          <Kpi label={t("Veränderung in 12 Monaten", "Change in 12 months")} value={pct(perf12)} tone={perf12} />
        </dl>
      </div>

      {rows.length === 0 ? (
        <Empty className="py-16">
          {t("Noch keine Fahrzeuge im Portfolio.", "No cars in the portfolio yet.")}{" "}
          <button className="not-italic underline underline-offset-4 hover:text-ink" onClick={openAdd}>
            {t("Erstes Fahrzeug hinzufügen", "Add your first car")}
          </button>
        </Empty>
      ) : (
        <>
          <Section
            title={t("Wertentwicklung", "Value history")}
            sub={t("Marktwert gegenüber dem Einstand (gestrichelt)", "Market value against cost (dashed)")}
            actions={<Segmented options={rangeOptions()} value={range} onChange={setRange} />}
          >
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
                  <YAxis tickFormatter={(v) => eur(v, { compact: true })} width={96} orientation="right" {...axisProps} domain={["auto", "auto"]} />
                  <Tooltip
                    cursor={{ stroke: "var(--color-line-2)" }}
                    content={({ active, payload, label }) =>
                      active && payload?.length ? (
                        <ChartTooltipBox
                          title={date(Number(label))}
                          rows={[
                            { label: t("Marktwert", "Market value"), value: eur(Number(payload[0]?.payload.value)) },
                            { label: t("Einstand", "Cost"), value: eur(Number(payload[0]?.payload.cost)) },
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

          <Section title={t("Bestand", "Holdings")} sub={t(`${rows.length} Fahrzeuge`, `${rows.length} cars`)}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>{t("Fahrzeug", "Car")}</th>
                    <th className="text-right">{t("Laufleistung", "Mileage")}</th>
                    <th>{t("Kaufdatum", "Purchased")}</th>
                    <th className="text-right">{t("Kaufpreis", "Purchase price")}</th>
                    <th className="text-right">{t("Marktwert", "Market value")}</th>
                    <th className="text-right">{t("Gewinn", "Gain")}</th>
                    <th className="text-right">{t("12 Monate", "12 months")}</th>
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
                              {tr(r.h.color)}, {t("Note", "grade")} {r.h.condition}
                            </span>
                          </Link>
                        </td>
                        <td className="text-right tabular-nums">{km(r.h.mileage)}</td>
                        <td className="tabular-nums">{date(r.h.purchaseDate)}</td>
                        <td className="text-right tabular-nums">{eur(r.h.purchasePrice)}</td>
                        <td className="text-right"><Money value={r.value} /></td>
                        <td className={cn("text-right tabular-nums", trendClass(r.gain))}>{pct(r.gain)}</td>
                        <td className="text-right">
                          <Delta value={r.m.change12m} arrow={false} />
                        </td>
                        <td className="text-right">
                          <button
                            className="btn btn-ghost p-1.5"
                            aria-label={t("Bearbeiten", "Edit")}
                            onClick={() => {
                              setEditing(r.h);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            className="btn btn-ghost p-1.5 text-muted hover:text-down"
                            aria-label={t("Löschen", "Delete")}
                            onClick={() => {
                              if (confirm(t(`${variantTitle(r.v)} aus dem Portfolio entfernen?`, `Remove ${variantTitle(r.v)} from the portfolio?`))) {
                                removeHolding(r.h.id);
                                toast(t("Fahrzeug entfernt", "Car removed"), "info");
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
            toast(t(`${variantTitle(v)} aktualisiert`, `${variantTitle(v)} updated`));
          } else {
            addHolding(h);
            toast(t(`${variantTitle(v)} zum Portfolio hinzugefügt`, `${variantTitle(v)} added to the portfolio`));
          }
          setFormOpen(false);
        }}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: number }) {
  return (
    <div>
      <dt className="kpi-label">{label}</dt>
      <dd className={cn("mt-1 font-serif text-[30px] leading-tight tabular-nums", tone !== undefined && trendClass(tone))}>{value}</dd>
    </div>
  );
}
