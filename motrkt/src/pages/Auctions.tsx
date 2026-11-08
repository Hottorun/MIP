import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Gavel, Search, Star, X } from "lucide-react";
import { brands, variantById, variantShortTitle, variantTitle, variants } from "../data/db";
import { AS_OF, AUCTION_HOUSES, CONDITION_SCORE, COUNTRY_NAMES, DAY, WEEK, getAllSales, getAuctionEvents } from "../data/generate";
import { getMetrics, mean } from "../data/market";
import type { AuctionEvent, Sale } from "../data/types";
import { cn, date, eur, flag, km, num, pct } from "../lib/format";
import { useStore } from "../state/store";
import { BrandEmblem, Card, ChartTooltipBox, Delta, Empty, Modal, Pill, Segmented, axisProps } from "../components/ui";

type Source = "Alle" | "Auktion" | "Händler" | "Privat";
type Period = "3M" | "12M" | "5J";
type Status = "alle" | "verkauft" | "nicht";
type SortKey = "date" | "id" | "vehicle" | "house" | "condition" | "mileage" | "price" | "estimate" | "trend";

const PERIOD_WEEKS: Record<Period, number> = { "3M": 13, "12M": 52, "5J": 260 };
const PAGE = 25;

let titleCache: Map<string, string> | null = null;
function titles() {
  titleCache ??= new Map(variants.map((v) => [v.id, variantTitle(v)]));
  return titleCache;
}

function sortValue(s: Sale, key: SortKey): number | string {
  switch (key) {
    case "date":
      return s.date;
    case "id":
      return s.id;
    case "vehicle":
      return titles().get(s.variantId) ?? "";
    case "house":
      return s.house;
    case "condition":
      return CONDITION_SCORE[s.condition];
    case "mileage":
      return s.mileage;
    case "price":
      return s.price ?? -1;
    case "estimate":
      return s.estimateLow ?? -1;
    case "trend":
      return s.price === null ? -9 : s.trend;
  }
}

export default function Auctions() {
  const [params, setParams] = useSearchParams();
  const [brand, setBrand] = useState("");
  const [source, setSource] = useState<Source>("Alle");
  const [house, setHouse] = useState("");
  const [period, setPeriod] = useState<Period>("12M");
  const [status, setStatus] = useState<Status>("alle");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [text, setText] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Sale | null>(null);

  // Keep text search in sync when navigating here from the global search.
  const qParam = params.get("q");
  useEffect(() => {
    if (qParam !== null) {
      setText(qParam);
      setPeriod("5J");
    }
  }, [qParam]);

  useEffect(() => setPage(0), [brand, source, house, period, status, priceMin, priceMax, text, sort]);

  // All filters except the period; restricted to the 5-year data window anyway.
  const base = useMemo(() => {
    const t = text.trim().toLowerCase();
    const tUpper = text.trim().toUpperCase();
    const min = Number(priceMin) || 0;
    const max = Number(priceMax) || Infinity;
    const names = titles();
    return getAllSales().filter((s) => {
      if (brand && variantById.get(s.variantId)!.brandId !== brand) return false;
      if (source !== "Alle" && s.source !== source) return false;
      if (house && s.house !== house) return false;
      if (status === "verkauft" && s.price === null) return false;
      if (status === "nicht" && s.price !== null) return false;
      if (min || max !== Infinity) {
        const p = s.price ?? s.estimateLow ?? 0;
        if (p < min || p > max) return false;
      }
      if (t) {
        if (!(s.id.startsWith(tUpper) || s.vin.startsWith(tUpper) || s.house.toLowerCase().includes(t) || names.get(s.variantId)!.toLowerCase().includes(t))) return false;
      }
      return true;
    });
  }, [brand, source, house, status, priceMin, priceMax, text]);

  const filtered = useMemo(() => {
    const from = AS_OF - PERIOD_WEEKS[period] * WEEK;
    return base.filter((s) => s.date >= from);
  }, [base, period]);

  const sorted = useMemo(() => {
    if (sort.key === "date" && sort.dir === -1) return filtered; // already newest first
    const arr = [...filtered];
    arr.sort((a, b) => {
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return arr;
  }, [filtered, sort]);

  const kpis = useMemo(() => {
    const auctions = filtered.filter((s) => s.source === "Auktion");
    const sold = auctions.filter((s) => s.price !== null);
    const premiums = sold.map((s) => s.price! / ((s.estimateLow! + s.estimateHigh!) / 2) - 1);
    const revenue = filtered.reduce((sum, s) => sum + (s.price ?? 0), 0);
    return {
      lots: auctions.length,
      sellThrough: auctions.length ? sold.length / auctions.length : 0,
      premium: mean(premiums),
      revenue,
      count: filtered.length,
    };
  }, [filtered]);

  const monthly = useMemo(() => {
    const now = new Date(AS_OF);
    const rows: { key: string; label: string; lots: number; sold: number; rate: number | null }[] = [];
    const idx = new Map<string, number>();
    // 24 complete months, excluding the current (partial) month
    for (let i = 24; i >= 1; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      idx.set(key, rows.length);
      rows.push({ key, label: d.toLocaleDateString("de-DE", { month: "short", year: "2-digit", timeZone: "UTC" }), lots: 0, sold: 0, rate: null });
    }
    for (const s of base) {
      if (s.source !== "Auktion") continue;
      const d = new Date(s.date);
      const i = idx.get(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
      if (i === undefined) continue;
      rows[i].lots++;
      if (s.price !== null) rows[i].sold++;
    }
    for (const r of rows) r.rate = r.lots ? r.sold / r.lots : null;
    return rows;
  }, [base]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const rows = sorted.slice(page * PAGE, page * PAGE + PAGE);
  const houses = useMemo(() => [...new Set([...AUCTION_HOUSES.map((h) => h.name)])], []);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "vehicle" || key === "id" || key === "house" ? 1 : -1 }));

  const resetFilters = () => {
    setBrand("");
    setSource("Alle");
    setHouse("");
    setStatus("alle");
    setPriceMin("");
    setPriceMax("");
    setText("");
    if (params.has("q")) {
      params.delete("q");
      setParams(params, { replace: true });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-[28px] leading-tight">Auktionen &amp; Transaktionen</h1>
          <p className="text-sm text-muted">
            {num(getAllSales().length)} erfasste Verkäufe der letzten 5 Jahre · {getAuctionEvents().length} kommende Auktionen
          </p>
        </div>
        <Segmented options={["3M", "12M", "5J"] as const} value={period} onChange={setPeriod} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Auktionslose" value={num(kpis.lots)} sub={`${num(kpis.count)} Transaktionen gesamt`} />
        <Kpi label="Verkaufsquote" value={pct(kpis.sellThrough, { signed: false })} sub="verkauft / angeboten (Auktion)" />
        <Kpi label="Ø Zuschlag vs. Schätzung" value={<Delta value={kpis.premium} arrow={false} />} sub="bezogen auf Schätzungsmitte" />
        <Kpi label="Umsatz" value={eur(kpis.revenue, { compact: true })} sub={`Zeitraum ${period}`} />
      </div>

      <UpcomingAuctions />

      <Card title="Ergebnisse & Transaktionen" sub={`${num(sorted.length)} Treffer`} bodyClassName="space-y-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <div className="col-span-2">
            <label className="label">Suche</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="ID, FIN, Haus, Fahrzeug …" />
            </div>
          </div>
          <div>
            <label className="label">Marke</label>
            <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Alle Marken</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Quelle</label>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as Source)}>
              {(["Alle", "Auktion", "Händler", "Privat"] as const).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Auktionshaus</label>
            <select className="input" value={house} onChange={(e) => setHouse(e.target.value)}>
              <option value="">Alle Häuser</option>
              {houses.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="alle">Alle</option>
              <option value="verkauft">Verkauft</option>
              <option value="nicht">Nicht verkauft</option>
            </select>
          </div>
          <div>
            <label className="label">Preis min (€)</label>
            <input className="input" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
          <div>
            <label className="label">Preis max (€)</label>
            <input className="input" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))} placeholder="∞" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-ghost px-2 py-1 text-xs text-muted" onClick={resetFilters}>
            <X className="size-3.5" /> Filter zurücksetzen
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty>Keine Transaktionen für diese Filter.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-hover">
              <thead>
                <tr>
                  <Th k="date" sort={sort} onSort={toggleSort}>Datum</Th>
                  <Th k="id" sort={sort} onSort={toggleSort}>ID</Th>
                  <Th k="vehicle" sort={sort} onSort={toggleSort}>Fahrzeug</Th>
                  <Th k="house" sort={sort} onSort={toggleSort}>Haus / Quelle</Th>
                  <Th k="condition" sort={sort} onSort={toggleSort}>Zustand</Th>
                  <Th k="mileage" sort={sort} onSort={toggleSort} right>Laufleistung</Th>
                  <Th k="price" sort={sort} onSort={toggleSort} right>Preis</Th>
                  <Th k="estimate" sort={sort} onSort={toggleSort} right>Schätzung</Th>
                  <Th k="trend" sort={sort} onSort={toggleSort} right>vs. Marktwert</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const v = variantById.get(s.variantId)!;
                  return (
                    <tr key={`${s.id}-${s.variantId}-${s.date}-${s.vin}`} onClick={() => setSelected(s)}>
                      <td className="text-muted">{date(s.date)}</td>
                      <td className="font-mono text-xs text-muted">{s.id}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <BrandEmblem brandId={v.brandId} size={16} />
                          {variantTitle(v)}
                        </span>
                      </td>
                      <td>
                        <span className="text-ink/90">{s.house}</span>
                        {s.source !== "Auktion" && <span className="ml-1.5 text-xs text-faint">{s.source}</span>}
                      </td>
                      <td>{s.conditionUnknown ? <span className="text-faint">–</span> : s.condition}</td>
                      <td className="text-right tabular-nums">{km(s.mileage)}</td>
                      <td className="text-right font-medium tabular-nums">{s.price === null ? <span className="text-xs font-normal text-down">nicht verkauft</span> : eur(s.price)}</td>
                      <td className="text-right text-xs text-muted tabular-nums">
                        {s.estimateLow ? `${eur(s.estimateLow, { compact: true })}–${eur(s.estimateHigh, { compact: true })}` : "–"}
                      </td>
                      <td className="text-right">{s.price === null ? <span className="text-faint">–</span> : <Delta value={s.trend} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {num(sorted.length ? page * PAGE + 1 : 0)}–{num(Math.min(sorted.length, (page + 1) * PAGE))} von {num(sorted.length)}
          </span>
          <div className="flex items-center gap-1.5">
            <button className="btn px-2 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Vorherige Seite">
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              Seite {page + 1} / {pages}
            </span>
            <button className="btn px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Nächste Seite">
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </Card>

      <Card title="Auktionsvolumen & Verkaufsquote" sub="letzte 24 Monate · aktuelle Filter (ohne Zeitraum)">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={2} />
              <YAxis yAxisId="lots" {...axisProps} width={44} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" {...axisProps} width={44} domain={[0, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)} %`} />
              <Tooltip
                cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as (typeof monthly)[number];
                  return (
                    <ChartTooltipBox
                      title={r.label}
                      rows={[
                        { label: "Auktionslose", value: num(r.lots), color: "var(--color-gold)" },
                        { label: "Verkauft", value: num(r.sold) },
                        { label: "Verkaufsquote", value: r.rate === null ? "–" : pct(r.rate, { signed: false }), color: "var(--color-up)" },
                      ]}
                    />
                  );
                }}
              />
              <Bar yAxisId="lots" dataKey="lots" fill="var(--color-gold)" fillOpacity={0.55} radius={[3, 3, 0, 0]} />
              <Line yAxisId="rate" dataKey="rate" stroke="var(--color-up)" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <SaleModal sale={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="panel px-4 py-3">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mt-0.5">{value}</div>
      <div className="text-[11px] text-faint">{sub}</div>
    </div>
  );
}

function Th({ k, sort, onSort, children, right }: { k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; children: React.ReactNode; right?: boolean }) {
  const active = sort.key === k;
  const Icon = sort.dir === 1 ? ArrowUp : ArrowDown;
  return (
    <th className={cn(right && "text-right")}>
      <button onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-ink", active && "text-gold-2")}>
        {children}
        {active && <Icon className="size-3" />}
      </button>
    </th>
  );
}

function UpcomingAuctions() {
  const [params] = useSearchParams();
  const eventParam = params.get("event");
  const events = getAuctionEvents();
  const [open, setOpen] = useState<string | null>(eventParam);
  const refs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!eventParam) return;
    setOpen(eventParam);
    const t = setTimeout(() => refs.current.get(eventParam)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(t);
  }, [eventParam]);

  return (
    <Card title="Kommende Auktionen" sub="Kataloge mit MOTRKT-Bewertung">
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
          {events.map((e) => {
            const days = Math.round((e.date - AS_OF) / DAY);
            const low = e.lots.reduce((s, l) => s + l.estimateLow, 0);
            const high = e.lots.reduce((s, l) => s + l.estimateHigh, 0);
            const active = open === e.id;
            return (
              <button
                key={e.id}
                onClick={() => setOpen(active ? null : e.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active ? "border-gold/60 bg-gold/10" : "border-line bg-panel-2 hover:border-line-2 hover:bg-panel-3",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-gold">
                    <Gavel className="size-3.5" /> {e.house}
                  </span>
                  <Pill tone={days <= 30 ? "gold" : "neutral"} className="text-[10px]">
                    in {days} Tagen
                  </Pill>
                </div>
                <div className="mt-1.5 truncate text-sm font-semibold">{e.title}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <span>{flag(e.country)}</span> {e.city}
                  <CalendarDays className="ml-1 size-3" /> {date(e.date)}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted">{e.lots.length} Lose</span>
                  <span className="tabular-nums">
                    {eur(low, { compact: true })} – {eur(high, { compact: true })}
                  </span>
                </div>
                <div className="mt-1 flex justify-center text-faint">
                  <ChevronDown className={cn("size-3.5 transition-transform", active && "rotate-180")} />
                </div>
              </button>
            );
          })}
        </div>
        {events.map((e) =>
          open === e.id ? (
            <div
              key={e.id}
              ref={(el) => {
                if (el) refs.current.set(e.id, el);
              }}
              className="animate-fade-in scroll-mt-4 rounded-lg border border-line bg-panel-2/60 p-3"
            >
              <LotTable event={e} />
            </div>
          ) : null,
        )}
      </div>
    </Card>
  );
}

function LotTable({ event }: { event: AuctionEvent }) {
  const { watchlist, toggleWatch, toast } = useStore();
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">
          {event.house} · {event.title} <span className="font-normal text-muted">({event.city}, {date(event.date)})</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Los</th>
              <th>Fahrzeug</th>
              <th>Baujahr</th>
              <th className="text-right">Laufleistung</th>
              <th>Farbe</th>
              <th className="text-right">Schätzung</th>
              <th className="text-right">MOTRKT-Marktwert</th>
              <th className="text-right">Schätzung vs. Markt</th>
              <th className="text-center">Watch</th>
            </tr>
          </thead>
          <tbody>
            {event.lots.map((lot) => {
              const v = variantById.get(lot.variantId)!;
              const value = getMetrics(v.id).value;
              const mid = (lot.estimateLow + lot.estimateHigh) / 2;
              const watched = watchlist.includes(v.id);
              return (
                <tr key={lot.lotNo}>
                  <td className="font-mono text-xs text-muted">{lot.lotNo}</td>
                  <td>
                    <Link to={`/markt/${v.id}`} className="flex items-center gap-2 hover:text-gold-2">
                      <BrandEmblem brandId={v.brandId} size={16} />
                      {variantTitle(v)}
                    </Link>
                  </td>
                  <td>{lot.year}</td>
                  <td className="text-right tabular-nums">{km(lot.mileage)}</td>
                  <td>
                    <span className="flex items-center gap-1.5 text-xs">
                      <span className="inline-block size-3 rounded-full border border-white/20" style={{ background: lot.colorHex }} />
                      {lot.color}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {eur(lot.estimateLow, { compact: true })}–{eur(lot.estimateHigh, { compact: true })}
                  </td>
                  <td className="text-right tabular-nums">{eur(value)}</td>
                  <td className="text-right">
                    <Delta value={mid / value - 1} />
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => {
                        toggleWatch(v.id);
                        toast(watched ? `${variantShortTitle(v)} von der Watchlist entfernt` : `${variantShortTitle(v)} zur Watchlist hinzugefügt`, watched ? "info" : "success");
                      }}
                      aria-label={watched ? "Von Watchlist entfernen" : "Zur Watchlist"}
                      className={cn("p-1", watched ? "text-gold" : "text-faint hover:text-ink")}
                    >
                      <Star className="size-4" fill={watched ? "currentColor" : "none"} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SaleModal({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  if (!sale) return null;
  const v = variantById.get(sale.variantId)!;
  const country = (iso: string) => (
    <span>
      {flag(iso)} {COUNTRY_NAMES[iso] ?? iso}
    </span>
  );
  const mid = sale.estimateLow && sale.estimateHigh ? (sale.estimateLow + sale.estimateHigh) / 2 : null;
  const rows: [string, React.ReactNode][] = [
    ["Datum", date(sale.date)],
    ["Quelle", `${sale.source} · ${sale.house}`],
    ["Transaktions-ID", <span className="font-mono">{sale.id}</span>],
    ["FIN", <span className="font-mono">{sale.vin}</span>],
    ["Preis", sale.price === null ? <span className="text-down">nicht verkauft</span> : <span className="font-semibold">{eur(sale.price)}</span>],
    ["Schätzung", sale.estimateLow ? `${eur(sale.estimateLow)} – ${eur(sale.estimateHigh)}` : "–"],
    ["Zuschlag vs. Schätzung", mid && sale.price ? <Delta value={sale.price / mid - 1} /> : "–"],
    ["vs. Marktwert (damals)", sale.price === null ? "–" : <Delta value={sale.trend} />],
    ["Zustand", `Note ${sale.condition}`],
    ["Laufleistung", km(sale.mileage)],
    ["Farbe", sale.color],
    ["Karosserie / Getriebe", `${sale.body} · ${sale.gearbox === "Manual" ? "Schaltgetriebe" : "Automatik"}`],
    ["Käuferland", country(sale.buyerCountry)],
    ["Herkunft", country(sale.originCountry)],
    ["Auslieferungsland", country(sale.deliveryCountry)],
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <BrandEmblem brandId={v.brandId} /> {variantTitle(v)}
        </span>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          <Link to={`/markt/${v.id}`} className="btn btn-gold" onClick={onClose}>
            Marktdaten öffnen <ExternalLink className="size-3.5" />
          </Link>
        </>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, val]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
            <dt className="text-muted">{k}</dt>
            <dd className="text-right">{val}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
