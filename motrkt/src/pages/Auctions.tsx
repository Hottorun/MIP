import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search, Star, X } from "lucide-react";
import { brands, variantById, variantShortTitle, variantTitle, variants } from "../data/db";
import { AS_OF, AUCTION_HOUSES, CONDITION_SCORE, COUNTRY_NAMES, DAY, WEEK, getAllSales, getAuctionEvents } from "../data/generate";
import { getMetrics, mean } from "../data/market";
import type { AuctionEvent, Sale } from "../data/types";
import { cn, date, eur, flag, km, num, pct } from "../lib/format";
import { useStore } from "../state/store";
import { BrandEmblem, ChartTooltipBox, Delta, Empty, Modal, Section, Segmented, axisProps, Money } from "../components/ui";
import { getLang, locale, t } from "../i18n";
import { tr } from "../i18n/terms";

type Source = "Alle" | "Auktion" | "Händler" | "Privat";
type Period = "3M" | "12M" | "5J";
type Status = "alle" | "verkauft" | "nicht";
type SortKey = "date" | "id" | "vehicle" | "house" | "condition" | "mileage" | "price" | "estimate" | "trend";

const PERIOD_WEEKS: Record<Period, number> = { "3M": 13, "12M": 52, "5J": 260 };
const PAGE = 25;

let titleCache: Map<string, string> | null = null;
let titleLang = getLang();
function titles() {
  if (!titleCache || titleLang !== getLang()) {
    titleCache = new Map(variants.map((v) => [v.id, variantTitle(v)]));
    titleLang = getLang();
  }
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
    const q = text.trim().toLowerCase();
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
      if (q) {
        if (!(s.id.startsWith(tUpper) || s.vin.startsWith(tUpper) || s.house.toLowerCase().includes(q) || names.get(s.variantId)!.toLowerCase().includes(q))) return false;
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
      rows.push({ key, label: d.toLocaleDateString(locale(), { month: "short", year: "2-digit", timeZone: "UTC" }), lots: 0, sold: 0, rate: null });
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
    <div className="space-y-16">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">{t("Auktionen", "Auctions")}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {t(
                `${num(getAllSales().length)} erfasste Verkäufe der letzten fünf Jahre und ${getAuctionEvents().length} kommende Auktionen`,
                `${num(getAllSales().length)} recorded sales over the last five years and ${getAuctionEvents().length} upcoming auctions`,
              )}
            </p>
          </div>
          <Segmented
            options={[
              { value: "3M" as const, label: t("3 Monate", "3 months") },
              { value: "12M" as const, label: t("12 Monate", "12 months") },
              { value: "5J" as const, label: t("5 Jahre", "5 years") },
            ]}
            value={period}
            onChange={setPeriod}
          />
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-6 border-y border-line py-6 lg:grid-cols-4">
          <Kpi label={t("Angebotene Lose", "Lots offered")} value={num(kpis.lots)} />
          <Kpi label={t("Davon verkauft", "Of which sold")} value={pct(kpis.sellThrough, { signed: false, digits: 0 })} />
          <Kpi label={t("Zuschlag gegenüber Schätzung", "Hammer price vs. estimate")} value={<Delta value={kpis.premium} arrow={false} />} />
          <Kpi label={t("Umsatz", "Turnover")} value={<Money value={kpis.revenue} compact />} />
        </dl>
      </div>

      <UpcomingAuctions />

      <Section title={t("Ergebnisse", "Results")} sub={t(`${num(sorted.length)} Verkäufe`, `${num(sorted.length)} sales`)}>
        <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <div className="col-span-2">
            <label className="label">{t("Suche", "Search")}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
              <input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ID, FIN, Haus, Fahrzeug …", "ID, VIN, house, car …")} />
            </div>
          </div>
          <div className={cn(brands.length < 2 && "hidden")}>
            <label className="label">{t("Marke", "Brand")}</label>
            <select className="input" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">{t("Alle Marken", "All brands")}</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("Quelle", "Source")}</label>
            <select className="input" value={source} onChange={(e) => setSource(e.target.value as Source)}>
              {(["Alle", "Auktion", "Händler", "Privat"] as const).map((s) => (
                <option key={s} value={s}>
                  {s === "Alle" ? t("Alle", "All") : tr(s)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t("Auktionshaus", "Auction house")}</label>
            <select className="input" value={house} onChange={(e) => setHouse(e.target.value)}>
              <option value="">{t("Alle Häuser", "All houses")}</option>
              {houses.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              <option value="alle">{t("Alle", "All")}</option>
              <option value="verkauft">{t("Verkauft", "Sold")}</option>
              <option value="nicht">{t("Nicht verkauft", "Not sold")}</option>
            </select>
          </div>
          <div>
            <label className="label">{t("Preis min (€)", "Price min (€)")}</label>
            <input className="input" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))} placeholder="0" />
          </div>
          <div>
            <label className="label">{t("Preis max (€)", "Price max (€)")}</label>
            <input className="input" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))} placeholder="∞" />
          </div>
        </div>
        <div className="flex justify-end">
          <button className="btn btn-ghost px-2 py-1 text-xs text-muted" onClick={resetFilters}>
            <X className="size-3.5" /> {t("Filter zurücksetzen", "Reset filters")}
          </button>
        </div>

        {rows.length === 0 ? (
          <Empty>{t("Keine Transaktionen für diese Filter.", "No transactions match these filters.")}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base table-hover">
              <thead>
                <tr>
                  <Th k="date" sort={sort} onSort={toggleSort}>{t("Datum", "Date")}</Th>
                  <Th k="vehicle" sort={sort} onSort={toggleSort}>{t("Fahrzeug", "Car")}</Th>
                  <Th k="house" sort={sort} onSort={toggleSort}>{t("Verkauft über", "Sold via")}</Th>
                  <Th k="mileage" sort={sort} onSort={toggleSort} right>{t("Laufleistung", "Mileage")}</Th>
                  <Th k="price" sort={sort} onSort={toggleSort} right>{t("Preis", "Price")}</Th>
                  <Th k="trend" sort={sort} onSort={toggleSort} right>{t("Zum Marktwert", "Vs. market value")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const v = variantById.get(s.variantId)!;
                  return (
                    <tr key={`${s.id}-${s.variantId}-${s.date}-${s.vin}`} onClick={() => setSelected(s)}>
                      <td className="text-muted">{date(s.date)}</td>
                      <td className="font-serif">{variantTitle(v, { brand: false })}</td>
                      <td>
                        <span className="text-ink/90">{s.house}</span>
                        {s.source !== "Auktion" && <span className="ml-1.5 text-xs text-faint">{tr(s.source)}</span>}
                      </td>
                      <td className="text-right tabular-nums">{km(s.mileage)}</td>
                      <td className="text-right">{s.price === null ? <span className="font-sans text-[13px] text-faint italic">{t("nicht verkauft", "not sold")}</span> : <Money value={s.price} />}</td>
                      <td className="text-right">{s.price === null ? <span className="text-faint">–</span> : <Delta value={s.trend} arrow={false} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {num(sorted.length ? page * PAGE + 1 : 0)}–{num(Math.min(sorted.length, (page + 1) * PAGE))} {t("von", "of")} {num(sorted.length)}
          </span>
          <div className="flex items-center gap-1.5">
            <button className="btn px-2 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label={t("Vorherige Seite", "Previous page")}>
              <ChevronLeft className="size-4" />
            </button>
            <span className="tabular-nums">
              {t("Seite", "Page")} {page + 1} / {pages}
            </span>
            <button className="btn px-2 py-1" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label={t("Nächste Seite", "Next page")}>
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
        </div>
      </Section>

      <Section title={t("Volumen und Verkaufsquote", "Volume and sell-through rate")} sub={t("Letzte 24 Monate, mit den gewählten Filtern", "Last 24 months, with the selected filters")}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" {...axisProps} interval={2} />
              <YAxis yAxisId="lots" {...axisProps} width={44} allowDecimals={false} />
              <YAxis yAxisId="rate" orientation="right" {...axisProps} width={44} domain={[0, 1]} tickFormatter={(v: number) => pct(v, { signed: false, digits: 0 })} />
              <Tooltip
                cursor={{ fill: "var(--color-panel-3)", opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as (typeof monthly)[number];
                  return (
                    <ChartTooltipBox
                      title={r.label}
                      rows={[
                        { label: t("Auktionslose", "Auction lots"), value: num(r.lots), color: "var(--color-gold)" },
                        { label: t("Verkauft", "Sold"), value: num(r.sold) },
                        { label: t("Verkaufsquote", "Sell-through rate"), value: r.rate === null ? "–" : pct(r.rate, { signed: false }), color: "var(--color-up)" },
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
      </Section>

      <SaleModal sale={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="kpi-label">{label}</dt>
      <dd className="mt-1 font-serif text-[28px] leading-tight">{value}</dd>
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
    const timer = setTimeout(() => refs.current.get(eventParam)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => clearTimeout(timer);
  }, [eventParam]);

  return (
    <Section title={t("Kommende Auktionen", "Upcoming auctions")} sub={t("Lose mit unserer Bewertung, zum Öffnen anklicken", "Lots with our valuation, click to open")}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 border-t border-l border-line md:grid-cols-2 xl:grid-cols-4">
          {events.map((e) => {
            const days = Math.round((e.date - AS_OF) / DAY);
            const low = e.lots.reduce((s, l) => s + l.estimateLow, 0);
            const high = e.lots.reduce((s, l) => s + l.estimateHigh, 0);
            const active = open === e.id;
            return (
              <button
                key={e.id}
                onClick={() => setOpen(active ? null : e.id)}
                aria-expanded={active}
                className={cn("border-r border-b border-line p-5 text-left transition-colors", active ? "bg-panel" : "hover:bg-panel-2")}
              >
                <div className="flex items-baseline justify-between gap-2 text-[13px] text-muted">
                  <span>{date(e.date)}</span>
                  <span>{t(`in ${days} Tagen`, `in ${days} days`)}</span>
                </div>
                <div className="mt-3 font-serif text-[18px] leading-snug">{e.house}</div>
                <div className="truncate text-[14px] text-ink/80">{tr(e.title)}</div>
                <div className="mt-3 flex items-baseline justify-between gap-2 text-[13px] text-muted">
                  <span>
                    {tr(e.city)}, {e.lots.length} {t("Lose", "lots")}
                  </span>
                  <ChevronDown className={cn("size-4 self-center transition-transform", active && "rotate-180")} strokeWidth={1.5} />
                </div>
                <div className="mt-1 text-[13px] text-muted tabular-nums">
                  {t("Schätzung", "Estimate")} {eur(low, { compact: true })} {t("bis", "to")} {eur(high, { compact: true })}
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
              className="animate-fade-in scroll-mt-28 border border-line bg-panel p-5"
            >
              <LotTable event={e} />
            </div>
          ) : null,
        )}
      </div>
    </Section>
  );
}

function LotTable({ event }: { event: AuctionEvent }) {
  const { watchlist, toggleWatch, toast } = useStore();
  return (
    <>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">
          {event.house} · {tr(event.title)} <span className="font-normal text-muted">({tr(event.city)}, {date(event.date)})</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>{t("Los", "Lot")}</th>
              <th>{t("Fahrzeug", "Car")}</th>
              <th>{t("Baujahr", "Year")}</th>
              <th className="text-right">{t("Laufleistung", "Mileage")}</th>
              <th>{t("Farbe", "Colour")}</th>
              <th className="text-right">{t("Schätzung", "Estimate")}</th>
              <th className="text-right">{t("MIP-Marktwert", "MIP market value")}</th>
              <th className="text-right">{t("Schätzung vs. Markt", "Estimate vs. market")}</th>
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
                      {tr(lot.color)}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    {eur(lot.estimateLow, { compact: true })}–{eur(lot.estimateHigh, { compact: true })}
                  </td>
                  <td className="text-right"><Money value={value} /></td>
                  <td className="text-right">
                    <Delta value={mid / value - 1} />
                  </td>
                  <td className="text-center">
                    <button
                      onClick={() => {
                        toggleWatch(v.id);
                        toast(
                          watched
                            ? t(`${variantShortTitle(v)} von der Watchlist entfernt`, `${variantShortTitle(v)} removed from the watchlist`)
                            : t(`${variantShortTitle(v)} zur Watchlist hinzugefügt`, `${variantShortTitle(v)} added to the watchlist`),
                          watched ? "info" : "success",
                        );
                      }}
                      aria-label={watched ? t("Von Watchlist entfernen", "Remove from watchlist") : t("Zur Watchlist", "Add to watchlist")}
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
      {flag(iso)} {tr(COUNTRY_NAMES[iso]) ?? iso}
    </span>
  );
  const mid = sale.estimateLow && sale.estimateHigh ? (sale.estimateLow + sale.estimateHigh) / 2 : null;
  const rows: [string, React.ReactNode][] = [
    [t("Datum", "Date"), date(sale.date)],
    [t("Quelle", "Source"), `${tr(sale.source)} · ${tr(sale.house)}`],
    [t("Transaktions-ID", "Transaction ID"), <span className="font-mono">{sale.id}</span>],
    [t("FIN", "VIN"), <span className="font-mono">{sale.vin}</span>],
    [t("Preis", "Price"), sale.price === null ? <span className="text-down">{t("nicht verkauft", "not sold")}</span> : <Money value={sale.price} className="text-[17px]" />],
    [t("Schätzung", "Estimate"), sale.estimateLow ? `${eur(sale.estimateLow)} – ${eur(sale.estimateHigh)}` : "–"],
    [t("Zuschlag vs. Schätzung", "Hammer price vs. estimate"), mid && sale.price ? <Delta value={sale.price / mid - 1} /> : "–"],
    [t("vs. Marktwert (damals)", "Vs. market value (at the time)"), sale.price === null ? "–" : <Delta value={sale.trend} />],
    [t("Zustand", "Condition"), t(`Note ${sale.condition}`, `Grade ${sale.condition}`)],
    [t("Laufleistung", "Mileage"), km(sale.mileage)],
    [t("Farbe", "Colour"), tr(sale.color)],
    [t("Karosserie / Getriebe", "Body / gearbox"), `${tr(sale.body)} · ${sale.gearbox === "Manual" ? t("Schaltgetriebe", "Manual") : t("Automatik", "Automatic")}`],
    [t("Käuferland", "Buyer country"), country(sale.buyerCountry)],
    [t("Herkunft", "Origin"), country(sale.originCountry)],
    [t("Auslieferungsland", "Country of first delivery"), country(sale.deliveryCountry)],
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
            {t("Schließen", "Close")}
          </button>
          <Link to={`/markt/${v.id}`} className="btn btn-gold" onClick={onClose}>
            {t("Marktdaten öffnen", "Open market data")} <ExternalLink className="size-3.5" />
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
