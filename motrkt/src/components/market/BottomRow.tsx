import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { modelById, variantById, variantShortTitle, variantTitle, variants } from "../../data/db";
import type { Variant } from "../../data/types";
import { getListings, getSeries } from "../../data/generate";
import { cycleData, getMetrics, holdingValue, modelIndex, monthlyChanges, portfolioSeries } from "../../data/market";
import { useStore } from "../../state/store";
import { cn, eur, flag, km, num, pct } from "../../lib/format";
import { CarArt } from "../CarArt";
import { Copilot } from "../Copilot";
import { Card, ChartTooltipBox, Pill, Sparkline, axisProps } from "../ui";

function heatColor(change: number) {
  const a = Math.min(1, Math.abs(change) / 0.04);
  return change >= 0 ? `rgba(79,196,140,${0.15 + 0.75 * a})` : `rgba(232,97,90,${0.15 + 0.75 * a})`;
}

export function CyclesCard({ variant }: { variant: Variant }) {
  const model = modelById.get(variant.modelId)!;
  const cycle = useMemo(() => cycleData(modelIndex(model.id)), [model.id]);
  const heat = useMemo(() => {
    const siblings = variants
      .filter((o) => o.modelId === variant.modelId && o.id !== variant.id)
      .sort((a, b) => getMetrics(b.id).momentumScore - getMetrics(a.id).momentumScore)
      .slice(0, 4)
      .map((o) => o.id);
    return [variant.id, ...siblings].map((id) => ({ id, cells: monthlyChanges(getSeries(id), 6), momentum: getMetrics(id).momentum }));
  }, [variant.id, variant.modelId]);

  return (
    <Card title="Marktzyklen & Trends">
      <div className="grid grid-cols-1 gap-4">
        <div className="min-w-0">
          <div className="text-xs font-medium">
            Marktzyklus <span className="font-normal text-muted">({model.name} gesamt, indexiert)</span>
          </div>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cycle} margin={{ top: 8, right: 4, bottom: 0, left: -6 }}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" {...axisProps} interval="preserveStartEnd" minTickGap={18} />
                <YAxis {...axisProps} width={38} domain={["auto", "auto"]} tickFormatter={(v) => num(v)} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox
                        title={String(payload[0].payload.year)}
                        rows={[
                          { label: "Aktueller Zyklus", value: num(payload[0].payload.value, 1), color: "var(--color-gold)" },
                          { label: "Hist. Durchschnitt", value: num(payload[0].payload.trend, 1) },
                        ]}
                      />
                    ) : null
                  }
                />
                <Line dataKey="value" stroke="var(--color-gold)" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line dataKey="trend" stroke="#9aa1ab" strokeDasharray="5 4" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-gold" /> Aktueller Zyklus
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-3 border-t border-dashed border-muted" /> Historischer Durchschnitt
            </span>
          </div>
        </div>
        <div className="min-w-0">
          <div className="flex justify-between text-xs font-medium">
            <span>
              Trend-Heatmap <span className="font-normal text-muted">(6M, monatlich)</span>
            </span>
            <span className="font-normal text-muted">Momentum</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {heat.map((row) => (
              <li key={row.id}>
                <Link to={`/markt/${row.id}`} className="flex items-center gap-2 text-[12px]">
                  <span className={cn("w-28 shrink-0 truncate", row.id === variant.id ? "text-ink" : "text-muted hover:text-ink")}>{variantShortTitle(variantById.get(row.id)!)}</span>
                  <span className="flex min-w-24 flex-1 gap-0.5">
                    {row.cells.map((c, i) => (
                      <span key={i} title={pct(c)} className="h-3.5 flex-1 rounded-[2px]" style={{ background: heatColor(c) }} />
                    ))}
                  </span>
                  <span className={cn("w-14 shrink-0 text-right", row.momentum === "Stark" ? "text-up" : row.momentum === "Schwach" ? "text-down" : "text-muted")}>{row.momentum}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function PortfolioMini() {
  const { portfolio, watchlist } = useStore();
  const stats = useMemo(() => {
    const rows = portfolio.map((h) => ({ h, value: holdingValue(h), m: getMetrics(h.variantId) }));
    const total = rows.reduce((s, r) => s + r.value, 0);
    const perf12 = total ? rows.reduce((s, r) => s + r.m.change12m * r.value, 0) / total : 0;
    const perf5 = total ? rows.reduce((s, r) => s + r.m.cagr5 * r.value, 0) / total : 0;
    const series = portfolioSeries(portfolio).slice(-104).map((p) => p.value);
    return { rows: rows.sort((a, b) => b.value - a.value), total, perf12, perf5, series };
  }, [portfolio]);

  return (
    <Card title="Portfolio" sub="(Mein Sammlungsportfolio)" actions={<Link to="/portfolio" className="text-xs text-gold hover:underline">Öffnen</Link>}>
      {portfolio.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted">
          Noch keine Fahrzeuge. <Link to="/portfolio" className="text-gold hover:underline">Portfolio anlegen</Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1 whitespace-nowrap">
            <div>
              <div className="kpi-label">Gesamtwert</div>
              <div className="text-lg font-semibold tabular-nums">{eur(stats.total)}</div>
            </div>
            <div>
              <div className="kpi-label">Perf. (12M)</div>
              <div className={cn("text-base font-semibold tabular-nums", stats.perf12 >= 0 ? "text-up" : "text-down")}>{pct(stats.perf12)}</div>
            </div>
            <div>
              <div className="kpi-label">Perf. (p. a., 5J)</div>
              <div className={cn("text-base font-semibold tabular-nums", stats.perf5 >= 0 ? "text-up" : "text-down")}>{pct(stats.perf5)}</div>
            </div>
            <Sparkline values={stats.series} width={110} height={38} className="ml-auto hidden 2xl:block" />
          </div>
          <table className="table-base mt-2">
            <thead>
              <tr>
                <th className="pl-0">#</th>
                <th>Modell</th>
                <th className="text-right">Marktwert</th>
                <th className="pr-0 text-right">12M</th>
              </tr>
            </thead>
            <tbody>
              {stats.rows.slice(0, 3).map((r, i) => (
                <tr key={r.h.id}>
                  <td className="pl-0 text-muted">{i + 1}</td>
                  <td className="max-w-32 truncate">
                    <Link to={`/markt/${r.h.variantId}`} className="hover:text-gold">
                      {variantTitle(variantById.get(r.h.variantId)!, { brand: false })}
                    </Link>
                  </td>
                  <td className="text-right tabular-nums">{eur(r.value)}</td>
                  <td className={cn("pr-0 text-right tabular-nums", r.m.change12m >= 0 ? "text-up" : "text-down")}>{pct(r.m.change12m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <Link to="/portfolio#watchlist" className="btn mt-3 px-2.5 py-1 text-xs">
        <Plus className="size-3.5" /> Watchlist ({watchlist.length})
      </Link>
    </Card>
  );
}

export function ListingsMini({ variant }: { variant: Variant }) {
  const listings = getListings(variant.id);
  return (
    <Card title="Inserate / Neue Angebote" sub="(Marktplatz)">
      <ul className="space-y-2">
        {listings.slice(0, 3).map((l, i) => (
          <li key={l.id}>
            <Link to={`/kaufen?inserat=${l.id}`} className="flex items-center gap-3 rounded-lg p-1 transition-colors hover:bg-panel-3">
              <div className="h-11 w-20 shrink-0 overflow-hidden rounded-md border border-line">
                <CarArt className="size-full" shape={variant.shape} color={l.colorHex} scene={(["studio", "mountain", "city"] as const)[i % 3]} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{variantTitle(variant, { brand: false })}</div>
                <div className="truncate text-xs text-muted">
                  {l.year} · {km(l.mileage)} · {flag(l.country)} {l.country}
                </div>
              </div>
              <div className="text-right text-[13px] font-semibold tabular-nums">{eur(l.price)}</div>
            </Link>
          </li>
        ))}
      </ul>
      <Link to={`/kaufen?variant=${variant.id}`} className="btn mt-3 w-full text-xs">
        Alle {listings.length} Angebote anzeigen <ArrowRight className="size-3.5" />
      </Link>
    </Card>
  );
}

export function CopilotCard({ variant }: { variant: Variant }) {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-gold" /> AI Co-Pilot <Pill tone="gold" className="text-[10px]">Beta</Pill>
        </span>
      }
    >
      <Copilot focusVariantId={variant.id} />
    </Card>
  );
}
