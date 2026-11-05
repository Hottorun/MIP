import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, Pencil, Plus, Trash2 } from "lucide-react";
import { brandById, modelById, variantById, variantTitle } from "../data/db";
import { AS_OF } from "../data/generate";
import { getMetrics, holdingSeries, holdingValue, portfolioSeries, RANGES, sliceRange, volatility, type RangeKey } from "../data/market";
import type { Holding } from "../data/types";
import { useStore } from "../state/store";
import { cn, date, eur, km, num, pct, trendClass } from "../lib/format";
import { axisProps, BrandEmblem, Card, ChartTooltipBox, Delta, Donut, Empty, ScoreBar, Segmented, Sparkline } from "../components/ui";
import { HoldingForm } from "../components/portfolio/HoldingForm";
import { WatchlistSection } from "../components/portfolio/Watchlist";
import { brandColor, SERIES_PALETTE, yearTicks } from "../components/insights/palette";

const YEAR_MS = 365.25 * 86_400_000;

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
  const avgYears = cost ? rows.reduce((s, r) => s + r.h.purchasePrice * Math.max(0.25, (AS_OF - r.h.purchaseDate) / YEAR_MS), 0) / cost : 0;
  const annualised = cost && avgYears ? (total / cost) ** (1 / avgYears) - 1 : 0;

  const chartData = useMemo(() => {
    const series = sliceRange(portfolioSeries(portfolio), range);
    return series.map((p) => ({
      t: p.t,
      value: p.value,
      cost: portfolio.filter((h) => h.purchaseDate <= p.t).reduce((s, h) => s + h.purchasePrice, 0),
    }));
  }, [portfolio, range]);

  const short = range === "1M" || range === "6M" || range === "1J";

  const byBrand = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.v.brandId, (map.get(r.v.brandId) ?? 0) + r.value);
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ id, label: brandById.get(id)!.name, value, color: brandColor(id) }));
  }, [rows]);
  const byModel = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.v.modelId, (map.get(r.v.modelId) ?? 0) + r.value);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, value], i) => {
        const m = modelById.get(id)!;
        return { id, label: `${brandById.get(m.brandId)!.name} ${m.name}`, value, color: SERIES_PALETTE[i % SERIES_PALETTE.length] };
      });
  }, [rows]);

  const risk = useMemo(() => {
    if (!total) return null;
    const w = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r) * r.value, 0) / total;
    const largest = [...rows].sort((a, b) => b.value - a.value)[0];
    return {
      vol: volatility(portfolioSeries(portfolio)),
      avgVol: w((r) => r.m.vol1y),
      largest,
      largestShare: largest.value / total,
      liquidity: w((r) => r.m.liquidity),
      rarity: w((r) => r.m.rarityScore),
    };
  }, [rows, total, portfolio]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Portfolio</h1>
          <p className="text-sm text-muted">Mein Sammlungsportfolio · Bewertung zum Marktwert (Median, zustandsbereinigt)</p>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={exportCsv} disabled={!rows.length}>
            <Download className="size-4" /> CSV exportieren
          </button>
          <button className="btn btn-gold" onClick={openAdd}>
            <Plus className="size-4" /> Fahrzeug hinzufügen
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Gesamtwert" value={eur(total)} />
        <Kpi label="Einstand" value={eur(cost)} />
        <Kpi label="Gewinn" value={eur(total - cost)} sub={<Delta value={cost ? total / cost - 1 : 0} />} tone={total - cost} />
        <Kpi label="Performance 12M" value={pct(perf12)} tone={perf12} sub={<span className="text-xs text-muted">wertgewichtet</span>} />
        <Kpi label="Rendite p. a. seit Kauf" value={pct(annualised)} tone={annualised} sub={<span className="text-xs text-muted">Ø Haltedauer {num(avgYears, 1)} J.</span>} />
        <Kpi label="Fahrzeuge" value={String(rows.length)} sub={<span className="text-xs text-muted">{byBrand.length} Marken</span>} />
      </div>

      {rows.length === 0 ? (
        <Empty className="py-16">
          Dein Portfolio ist leer.{" "}
          <button className="text-gold hover:underline" onClick={openAdd}>
            Erstes Fahrzeug hinzufügen
          </button>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
            <Card title="Wertentwicklung" sub="Portfolio vs. Einstand" actions={<Segmented options={RANGES} value={range} onChange={setRange} />}>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pf-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.35} />
                        <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" ticks={short ? undefined : yearTicks(chartData[0]?.t ?? AS_OF, AS_OF)} tickFormatter={(t) => date(t, short ? "short" : "year")} {...axisProps} minTickGap={short ? 40 : 8} />
                    <YAxis tickFormatter={(v) => eur(v, { compact: true })} width={80} {...axisProps} domain={["auto", "auto"]} />
                    <Tooltip
                      content={({ active, payload, label }) =>
                        active && payload?.length ? (
                          <ChartTooltipBox
                            title={date(Number(label))}
                            rows={[
                              { label: "Marktwert", value: eur(Number(payload[0]?.payload.value)), color: "var(--color-gold)" },
                              { label: "Einstand", value: eur(Number(payload[0]?.payload.cost)), color: "var(--color-muted)" },
                            ]}
                          />
                        ) : null
                      }
                    />
                    <Area type="monotone" dataKey="value" stroke="var(--color-gold)" strokeWidth={2} fill="url(#pf-fill)" isAnimationActive={false} />
                    <Line type="stepAfter" dataKey="cost" stroke="var(--color-muted)" strokeDasharray="4 4" dot={false} strokeWidth={1.5} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Risiko">
              {risk && (
                <div className="space-y-3.5">
                  <RiskRow label="Volatilität Portfolio (1J)" value={pct(risk.vol, { signed: false })} bar={risk.vol / 0.3} hint={`Ø Einzelwerte ${pct(risk.avgVol, { signed: false })} – Diversifikation wirkt`} />
                  <RiskRow
                    label="Größte Position"
                    value={pct(risk.largestShare, { signed: false })}
                    bar={risk.largestShare}
                    hint={variantTitle(risk.largest.v)}
                    warn={risk.largestShare > 0.35}
                  />
                  <RiskRow label="Liquidität (gewichtet)" value={`${Math.round(risk.liquidity)} / 100`} bar={risk.liquidity / 100} hint={risk.liquidity < 45 ? "Verkauf kann länger dauern" : "Gut handelbar"} />
                  <RiskRow label="Rarity (gewichtet)" value={`${Math.round(risk.rarity)} / 100`} bar={risk.rarity / 100} hint="Seltenheit stützt den Wert in Abschwüngen" />
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Allocation title="Allokation nach Marke" items={byBrand} total={total} />
            <Allocation title="Allokation nach Modell" items={byModel} total={total} />
          </div>

          <Card title="Bestand" sub={`${rows.length} Fahrzeuge`}>
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Fahrzeug</th>
                    <th>Zustand</th>
                    <th className="text-right">Laufleistung</th>
                    <th>Kaufdatum</th>
                    <th className="text-right">Kaufpreis</th>
                    <th className="text-right">Marktwert</th>
                    <th className="text-right">Gewinn</th>
                    <th className="text-right">12M</th>
                    <th className="text-right">Gewicht</th>
                    <th>1J</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...rows]
                    .sort((a, b) => b.value - a.value)
                    .map((r) => (
                      <tr key={r.h.id}>
                        <td>
                          <Link to={`/markt/${r.v.id}`} className="flex items-center gap-2 hover:text-gold-2">
                            <BrandEmblem brandId={r.v.brandId} size={16} />
                            <span>
                              {variantTitle(r.v)}
                              <span className="block text-[11px] text-muted">
                                {r.h.color}
                                {r.h.note && ` · ${r.h.note}`}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td>{r.h.condition}</td>
                        <td className="text-right tabular-nums">{km(r.h.mileage)}</td>
                        <td className="tabular-nums">{date(r.h.purchaseDate)}</td>
                        <td className="text-right tabular-nums">{eur(r.h.purchasePrice)}</td>
                        <td className="text-right tabular-nums">{eur(r.value)}</td>
                        <td className={cn("text-right tabular-nums", trendClass(r.gain))}>{pct(r.gain)}</td>
                        <td className="text-right">
                          <Delta value={r.m.change12m} />
                        </td>
                        <td className="text-right tabular-nums">{pct(r.value / total, { signed: false })}</td>
                        <td>
                          <Sparkline values={holdingSeries(r.h).slice(-52).map((p) => p.value)} width={80} height={22} />
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
                            <Pencil className="size-3.5" />
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
                            <Trash2 className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
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

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: number }) {
  return (
    <div className="panel px-4 py-3">
      <div className="kpi-label">{label}</div>
      <div className={cn("kpi-value mt-0.5 tabular-nums", tone !== undefined && trendClass(tone))}>{value}</div>
      {sub && <div className="mt-0.5">{sub}</div>}
    </div>
  );
}

function RiskRow({ label, value, bar, hint, warn }: { label: string; value: string; bar: number; hint: string; warn?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className={cn("font-medium tabular-nums", warn && "text-warn")}>{value}</span>
      </div>
      <ScoreBar value={Math.min(1, bar) * 100} className="mt-1" color={warn ? "var(--color-warn)" : undefined} />
      <div className="mt-0.5 truncate text-[11px] text-faint">{hint}</div>
    </div>
  );
}

function Allocation({ title, items, total }: { title: string; items: { id: string; label: string; value: number; color: string }[]; total: number }) {
  return (
    <Card title={title}>
      <div className="flex items-center gap-5">
        <Donut segments={items.map((i) => ({ value: i.value, color: i.color }))} size={128} thickness={14}>
          <span className="text-[10px] text-muted">Gesamt</span>
          <span className="text-sm font-semibold">{eur(total, { compact: true })}</span>
        </Donut>
        <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: i.color }} />
              <span className="min-w-0 flex-1 truncate">{i.label}</span>
              <span className="tabular-nums text-muted">{eur(i.value, { compact: true })}</span>
              <span className="w-14 text-right tabular-nums">{pct(i.value / total, { signed: false })}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

