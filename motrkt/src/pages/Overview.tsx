import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { ArrowRight, Gavel, Star, TrendingDown, TrendingUp } from "lucide-react";
import { brands, variantById, variantShortTitle, variantTitle, variants } from "../data/db";
import { AS_OF, DAY, WEEK, getAllSales, getAuctionEvents, getSeries, valueAt } from "../data/generate";
import { RANGES, brandIndex, cagrOver, changeOver, getMetrics, marketIndex, saleStats, sliceRange, topMovers, type RangeKey } from "../data/market";
import type { Sale } from "../data/types";
import { useStore } from "../state/store";
import { date, eur, flag, num, pct } from "../lib/format";
import { BrandEmblem, Card, ChartTooltipBox, Delta, Empty, Pill, Segmented, Sparkline, axisProps } from "../components/ui";

let yearStatsCache: { count: number; sellThrough: number; premium: number; auctionShare: number } | null = null;
function yearStats() {
  if (!yearStatsCache) {
    const from = AS_OF - 52 * WEEK;
    const sales: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.date < from) break; // sorted newest first
      sales.push(s);
    }
    const st = saleStats(sales);
    yearStatsCache = { count: sales.length, sellThrough: st.sellThrough, premium: st.premiumVsEstimate, auctionShare: st.auctionShare };
  }
  return yearStatsCache;
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="panel px-4 py-3">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mt-1">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function Overview() {
  const navigate = useNavigate();
  const { watchlist, toggleWatch } = useStore();
  const [range, setRange] = useState<RangeKey>("5J");

  const index = marketIndex();
  const stats = yearStats();
  const indexChange = changeOver(index, 52);
  const chartData = useMemo(() => sliceRange(index, range).map((p) => ({ t: p.t, value: p.value, volume: p.volume })), [index, range]);
  const rangeChange = chartData.length > 1 ? chartData[chartData.length - 1].value / chartData[0].value - 1 : 0;

  const movers = useMemo(() => topMovers(variants.map((v) => v.id), 6), []);
  const notable = useMemo(() => {
    const from = AS_OF - 30 * DAY;
    const out: Sale[] = [];
    for (const s of getAllSales()) {
      if (s.date < from) break;
      if (s.price !== null) out.push(s);
    }
    return out.sort((a, b) => b.price! - a.price!).slice(0, 8);
  }, []);
  const events = useMemo(() => getAuctionEvents().filter((e) => e.date >= AS_OF).slice(0, 3), []);
  const brandRows = useMemo(
    () =>
      brands.map((b) => {
        const idx = brandIndex(b.id);
        return {
          brand: b,
          change: changeOver(idx, 52),
          cagr: cagrOver(idx, 5),
          spark: idx.slice(-104).map((p) => p.value),
          count: variants.filter((v) => v.brandId === b.id).length,
        };
      }),
    [],
  );

  const ticks = useMemo(() => {
    if (chartData.length < 2 || range === "1M") return undefined;
    const from = chartData[0].t;
    const to = chartData[chartData.length - 1].t;
    const out: number[] = [];
    const d = new Date(from);
    if (range === "5J" || range === "10J" || range === "Max") {
      const step = range === "5J" ? 1 : 2;
      for (let y = d.getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= to; y += step) out.push(Date.UTC(y, 0, 1));
    } else {
      const step = range === "1J" ? 2 : 1;
      for (let m = d.getUTCMonth() + 1, y = d.getUTCFullYear(); Date.UTC(y, m, 1) <= to; m += step) out.push(Date.UTC(y, m, 1));
    }
    return out;
  }, [chartData, range]);
  const dateFmt = (t: number) => (range === "1M" ? date(t, "short") : range === "6M" || range === "1J" ? date(t, "month") : date(t, "year"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Marktüberblick</h1>
          <p className="text-sm text-muted">
            {variants.length} Varianten · {brands.length} Marken · Datenstand {date(AS_OF)}
          </p>
        </div>
        <Link to="/modelle" className="btn">
          Alle Modelle <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="MOTRKT Gesamtmarkt-Index" value={num(index[index.length - 1].value, 1)} sub={<Delta value={indexChange} className="text-xs" />} />
        <Kpi label="Erfasste Varianten" value={num(variants.length)} sub={`${brands.length} Marken`} />
        <Kpi label="Transaktionen (12M)" value={num(stats.count)} sub={`Auktionsanteil ${pct(stats.auctionShare, { signed: false, digits: 0 })}`} />
        <Kpi label="Verkaufsquote (12M)" value={pct(stats.sellThrough, { signed: false })} sub="Auktionen, verkauft / angeboten" />
        <Kpi label="Ø Zuschlag vs. Schätzung" value={<span className={stats.premium >= 0 ? "text-up" : "text-down"}>{pct(stats.premium)}</span>} sub="Mitte der Schätzung, 12M" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card
          title="MOTRKT Gesamtmarkt-Index"
          sub="gleichgewichtet, verkettet · 2014 = 100"
          actions={<Segmented options={RANGES} value={range} onChange={setRange} />}
        >
          <div className="mb-1 flex items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums">{num(index[index.length - 1].value, 1)}</span>
            <Delta value={rangeChange} />
            <span className="text-xs text-muted">im Zeitraum {range}</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} syncId="mkt">
                <defs>
                  <linearGradient id="ov-gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--color-gold)" stopOpacity={0.45} />
                    <stop offset="1" stopColor="var(--color-gold)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" ticks={ticks} tickFormatter={dateFmt} {...axisProps} minTickGap={24} />
                <YAxis domain={["auto", "auto"]} {...axisProps} width={44} tickFormatter={(v) => num(v)} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <ChartTooltipBox
                        title={date(payload[0].payload.t)}
                        rows={[
                          { label: "Index", value: num(payload[0].payload.value, 1), color: "var(--color-gold)" },
                          { label: "Verkäufe/Woche", value: num(payload[0].payload.volume) },
                        ]}
                      />
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="value" stroke="var(--color-gold)" strokeWidth={1.8} fill="url(#ov-gold)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="h-16">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 0, right: 8, left: -12, bottom: 0 }} syncId="mkt">
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" hide />
                <YAxis {...axisProps} width={44} tickCount={2} />
                <Tooltip content={() => null} cursor={{ fill: "var(--color-panel-3)" }} />
                <Bar dataKey="volume" fill="var(--color-faint)" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-xs text-muted">Volumen (Anzahl Verkäufe pro Woche, alle Varianten)</div>
        </Card>

        <div className="grid gap-4">
          <MoverList title="Top-Gewinner" sub="12 Monate" icon={<TrendingUp className="size-4 text-up" />} rows={movers.winners} />
          <MoverList title="Top-Verlierer" sub="12 Monate" icon={<TrendingDown className="size-4 text-down" />} rows={movers.losers} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted">Marken</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
          {brandRows.map(({ brand, change, cagr, spark, count }) => (
            <button
              key={brand.id}
              onClick={() => navigate(`/modelle?marke=${brand.id}`)}
              className="panel group flex flex-col gap-2 px-4 py-3 text-left transition-colors hover:border-gold/50"
            >
              <div className="flex items-center gap-2">
                <BrandEmblem brandId={brand.id} size={22} />
                <span className="flex-1 truncate font-medium">{brand.name}</span>
                <ArrowRight className="size-3.5 text-faint transition-colors group-hover:text-gold" />
              </div>
              <Sparkline values={spark} width={220} height={36} className="w-full" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">12M</span>
                <Delta value={change} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">CAGR 5J</span>
                <span className="tabular-nums">{pct(cagr)}</span>
              </div>
              <div className="text-[11px] text-faint">{count} Varianten</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Bemerkenswerte Verkäufe" sub="letzte 30 Tage, nach Preis">
          {notable.length === 0 ? (
            <Empty>Keine Verkäufe im Zeitraum.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base table-hover">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Fahrzeug</th>
                    <th>Quelle</th>
                    <th className="text-right">Preis</th>
                    <th className="text-right">vs. Marktwert</th>
                  </tr>
                </thead>
                <tbody>
                  {notable.map((s) => {
                    const v = variantById.get(s.variantId)!;
                    const mv = valueAt(getSeries(v.id), s.date);
                    return (
                      <tr key={s.id + s.variantId} onClick={() => navigate(`/markt/${v.id}`)}>
                        <td className="text-muted">{date(s.date)}</td>
                        <td className="max-w-56 truncate">{variantTitle(v)}</td>
                        <td className="text-muted">
                          {s.house} {flag(s.buyerCountry)}
                        </td>
                        <td className="text-right font-medium tabular-nums">{eur(s.price)}</td>
                        <td className="text-right">
                          <Delta value={s.price! / mv - 1} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Anstehende Auktionen" actions={<Link to="/auktionen" className="text-xs text-gold hover:underline">Kalender</Link>}>
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/auktionen?event=${e.id}`} className="flex gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 hover:border-gold/50">
                  <div className="flex w-11 shrink-0 flex-col items-center justify-center rounded-md bg-panel-3 py-1">
                    <span className="text-[10px] uppercase text-muted">{new Date(e.date).toLocaleDateString("de-DE", { month: "short", timeZone: "UTC" })}</span>
                    <span className="text-lg leading-none font-semibold">{new Date(e.date).getUTCDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {e.house} · {e.title}
                    </div>
                    <div className="text-xs text-muted">
                      {flag(e.country)} {e.city} · {e.lots.length} Lose
                    </div>
                    <div className="text-xs text-muted">
                      Schätzung gesamt {eur(e.lots.reduce((s, l) => s + l.estimateLow, 0), { compact: true })}–{eur(e.lots.reduce((s, l) => s + l.estimateHigh, 0), { compact: true })}
                    </div>
                  </div>
                  <Gavel className="size-4 shrink-0 text-gold" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Watchlist" sub={`(${watchlist.length})`}>
          {watchlist.length === 0 ? (
            <Empty>Noch keine Fahrzeuge beobachtet. Nutze den Stern auf einer Variante.</Empty>
          ) : (
            <ul className="divide-y divide-line/70">
              {watchlist
                .filter((id) => variantById.has(id))
                .map((id) => {
                  const v = variantById.get(id)!;
                  const m = getMetrics(id);
                  return (
                    <li key={id} className="flex items-center gap-2 py-1.5">
                      <button onClick={() => toggleWatch(id)} aria-label="Von Watchlist entfernen" className="text-gold hover:text-gold-2">
                        <Star className="size-3.5 fill-current" />
                      </button>
                      <Link to={`/markt/${id}`} className="min-w-0 flex-1 truncate text-sm hover:text-gold-2">
                        {variantShortTitle(v)}
                      </Link>
                      <span className="text-xs tabular-nums text-muted">{eur(m.value, { compact: true })}</span>
                      <Delta value={m.change12m} className="w-16 justify-end text-xs" />
                    </li>
                  );
                })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function MoverList({ title, sub, icon, rows }: { title: string; sub: string; icon: React.ReactNode; rows: { id: string; change: number }[] }) {
  return (
    <Card title={<span className="inline-flex items-center gap-1.5">{icon} {title}</span>} sub={sub}>
      <ul className="space-y-1">
        {rows.map((r, i) => {
          const v = variantById.get(r.id)!;
          const m = getMetrics(r.id);
          return (
            <li key={r.id}>
              <Link to={`/markt/${r.id}`} className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-panel-3">
                <span className="w-4 text-xs text-faint">{i + 1}</span>
                <BrandEmblem brandId={v.brandId} size={16} />
                <span className="min-w-0 flex-1 truncate text-sm">{variantTitle(v)}</span>
                <span className="hidden text-xs tabular-nums text-muted sm:inline">{eur(m.value, { compact: true })}</span>
                <Pill tone={r.change >= 0 ? "up" : "down"} className="w-[72px] justify-center tabular-nums">
                  {pct(r.change)}
                </Pill>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
