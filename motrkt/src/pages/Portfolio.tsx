import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Area, ComposedChart, Line, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FileCheck2, Pencil, Trash2 } from "lucide-react";
import { variantById, variantTitle } from "../data/db";
import { AS_OF } from "../data/generate";
import { getMetrics, holdingMeasured, holdingValue, portfolioHistory, rangeOptions, sliceRange, type RangeKey } from "../data/market";
import type { Holding } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, km, pct, trendClass } from "../lib/format";
import { axisProps, ChartTooltipBox, Delta, Empty, Section, Segmented, Money, useConfirm } from "../components/ui";
import { HoldingForm } from "../components/portfolio/HoldingForm";
import { WatchlistSection } from "../components/portfolio/Watchlist";
import { UserCarsSection } from "../components/portfolio/UserCars";
import { yearTicks } from "../components/insights/palette";
import { t } from "../i18n";
import { tr } from "../i18n/terms";

export default function Portfolio() {
  const { portfolio, addHolding, updateHolding, removeHolding, toast } = useStore();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#melden") document.getElementById("melden")?.scrollIntoView({ behavior: "smooth" });
  }, [hash]);
  const [range, setRange] = useState<RangeKey>("5J");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | undefined>();
  // a holding the user wants to prove with a contract or an appraisal: the section below starts its form from it
  const [proving, setProving] = useState<Holding | undefined>();

  const rows = useMemo(
    () =>
      portfolio.map((h) => {
        const v = variantById.get(h.variantId)!;
        const measured = holdingMeasured(h);
        const value = holdingValue(h); // the purchase price when the variant has no market value
        return { h, v, value, measured, m: getMetrics(v.id), gain: measured ? value / h.purchasePrice - 1 : null };
      }),
    [portfolio],
  );

  const total = rows.reduce((s, r) => s + r.value, 0);
  const cost = rows.reduce((s, r) => s + r.h.purchasePrice, 0);
  const measuredTotal = rows.reduce((s, r) => s + (r.measured ? r.value : 0), 0);
  const perf12 = measuredTotal ? rows.reduce((s, r) => s + (r.measured ? r.m.change12m * r.value : 0), 0) / measuredTotal : 0;
  const unmeasured = rows.filter((r) => !r.measured).length;

  // the cars' market value before the first purchase (dotted), then the owned collection against its cost
  const chartData = useMemo(() => sliceRange(portfolioHistory(portfolio), range), [portfolio, range]);
  const owned = chartData.filter((p) => p.value !== null);
  const hasBefore = chartData.some((p) => p.value === null && p.before !== null);
  const purchase = hasBefore ? owned[0] : undefined;

  const short = range === "1M" || range === "6M" || range === "1J";

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
            <p className="mt-1 text-[14px] text-muted">{t("Ihre Sammlung, bewertet zum aktuellen Marktwert nach Zustand.", "Your collection, valued at today's market value for its condition.")}</p>
          </div>
          <button className="btn btn-gold" onClick={openAdd}>
            {t("Fahrzeug hinzufügen", "Add car")}
          </button>
        </div>
        <dl className="mt-8 grid grid-cols-1 gap-6 border-y border-line py-6 sm:grid-cols-3">
          <Kpi label={t(`Wert von ${rows.length} Fahrzeugen`, `Value of ${rows.length} cars`)} value={<Money value={total} />} />
          <Kpi label={t(`Gewinn seit Kauf, Einstand ${eur(cost, { compact: true })}`, `Gain since purchase, cost ${eur(cost, { compact: true })}`)} value={<Money value={total - cost} />} tone={total - cost} />
          <Kpi label={t("Veränderung in 12 Monaten", "Change in 12 months")} value={pct(perf12)} tone={perf12} />
        </dl>
        {unmeasured > 0 && (
          <p className="mt-3 text-[12.5px] text-faint">
            {t(
              `${unmeasured} ${unmeasured === 1 ? "Fahrzeug hat" : "Fahrzeuge haben"} noch keinen Marktwert (zu wenige Belege) und ${unmeasured === 1 ? "zählt" : "zählen"} mit dem Kaufpreis.`,
              `${unmeasured} ${unmeasured === 1 ? "car has" : "cars have"} no market value yet (too few records) and ${unmeasured === 1 ? "counts" : "count"} at purchase price.`,
            )}
          </p>
        )}
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
            sub={t("Marktwert gegenüber dem Einstand", "Market value against cost")}
            actions={<Segmented options={rangeOptions()} value={range} onChange={setRange} />}
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.22} />
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
                          rows={
                            payload[0]?.payload.value === null
                              ? [{ label: t("Marktwert vor dem Kauf", "Market value before purchase"), value: eur(Number(payload[0]?.payload.before)) }]
                              : [
                                  { label: t("Marktwert", "Market value"), value: eur(Number(payload[0]?.payload.value)) },
                                  { label: t("Einstand", "Cost"), value: eur(Number(payload[0]?.payload.cost)) },
                                ]
                          }
                        />
                      ) : null
                    }
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--color-ink)" strokeWidth={1.75} fill="url(#pf-fill)" isAnimationActive={false} />
                  <Line type="monotone" dataKey="before" stroke="var(--color-ink)" strokeOpacity={0.5} strokeDasharray="1 5" strokeLinecap="round" dot={false} activeDot={{ r: 3 }} strokeWidth={1.75} isAnimationActive={false} />
                  <Line type="stepAfter" dataKey="cost" stroke="var(--color-faint)" strokeDasharray="3 4" dot={false} strokeWidth={1} isAnimationActive={false} />
                  {/* bought within the last week: one owned point, which neither curve can draw as a line */}
                  {owned.length === 1 && <ReferenceDot x={owned[0].t} y={owned[0].cost!} r={3.5} fill="var(--color-bg)" stroke="var(--color-faint)" strokeWidth={1.5} ifOverflow="extendDomain" />}
                  {purchase && <ReferenceDot x={purchase.t} y={purchase.value!} r={4} fill="var(--color-ink)" stroke="var(--color-bg)" strokeWidth={2} ifOverflow="extendDomain" />}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-muted">
              <LegendKey label={t("Marktwert seit dem Kauf", "Market value since purchase")}>
                <span className="block h-[2px] w-6 bg-ink" />
              </LegendKey>
              {hasBefore && (
                <LegendKey
                  label={
                    portfolio.length === 1
                      ? t("Marktwert vor dem Kauf", "Market value before purchase")
                      : t("Marktwert vor dem ersten Kauf", "Market value before the first purchase")
                  }
                >
                  <span className="block w-6 border-t-2 border-dotted border-ink/50" />
                </LegendKey>
              )}
              <LegendKey label={t("Einstand", "Cost")}>
                <span className="block w-6 border-t border-dashed border-faint" />
              </LegendKey>
            </ul>
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
                        <td className="text-right">
                          {r.measured ? <Money value={r.value} /> : <span className="text-[13px] text-faint" title={t("Zu wenige Belege für einen Marktwert", "Too few records for a market value")}>{t("keine Daten", "no data")}</span>}
                        </td>
                        <td className={cn("text-right tabular-nums", r.gain !== null && trendClass(r.gain))}>{r.gain === null ? <span className="text-faint">–</span> : pct(r.gain)}</td>
                        <td className="text-right">{r.measured ? <Delta value={r.m.change12m} arrow={false} /> : <span className="text-faint">–</span>}</td>
                        <td className="text-right">
                          <button
                            className="btn btn-ghost p-1.5"
                            aria-label={t("Mit Kaufvertrag oder Wertgutachten belegen", "Prove with a contract or an appraisal")}
                            title={t("Mit Kaufvertrag oder Wertgutachten belegen und Premium erhalten", "Prove with a contract or an appraisal and get premium")}
                            onClick={() => {
                              setProving(r.h);
                              document.getElementById("melden")?.scrollIntoView({ behavior: "smooth" });
                            }}
                          >
                            <FileCheck2 className="size-3.5" strokeWidth={1.5} />
                          </button>
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
                            onClick={async () => {
                              if (await confirm(t(`${variantTitle(r.v)} aus dem Portfolio entfernen?`, `Remove ${variantTitle(r.v)} from the portfolio?`), { confirmLabel: t("Entfernen", "Remove") })) {
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

      <UserCarsSection prefill={proving} onPrefillClear={() => setProving(undefined)} />

      <WatchlistSection />

      {confirmDialog}
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

function LegendKey({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {children}
      {label}
    </li>
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
