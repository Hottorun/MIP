import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { usePlan } from "../lib/plan";
import { Lock, Locked } from "../components/premium/Locked";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, ExternalLink, Gauge, Gavel, Scale, Search, X } from "lucide-react";
import { brands, variantById, variantTitle, variants } from "../data/db";
import { AS_OF, AUCTION_HOUSES, CONDITION_SCORE, COUNTRY_NAMES, WEEK, getAllSales } from "../data/generate";
import { mean } from "../data/market";
import { CALENDAR_AS_OF, HOUSE_CALENDARS, calendarSales, type CalendarSale } from "../data/real/auction-calendar";
import type { Sale } from "../data/types";
import { date, eur, flag, fromDisplay, km, num, pct, saleAmount } from "../lib/format";
import { BrandEmblem, ChartTooltipBox, Delta, DeltaBadge, Empty, Modal, Section, Segmented, StatTile, axisProps, Money } from "../components/ui";
import { getLang, locale, t } from "../i18n";
import { tr } from "../i18n/terms";
import { unsoldPrice } from "../lib/unsold";
import { LotGallery, LotThumb } from "../components/LotPhotos";
import { useStickyState } from "../lib/sticky";

type Source = "Alle" | "Auktion" | "Händler" | "Privat";
type Period = "3M" | "12M" | "5J";
type Status = "alle" | "verkauft" | "nicht";
type SortKey = "date" | "id" | "vehicle" | "house" | "condition" | "mileage" | "price" | "estimate" | "trend";

const PERIOD_WEEKS: Record<Period, number> = { "3M": 13, "12M": 52, "5J": 260 };
/** Time range of the results archive; independent of the period of the key figures above. */
type Range = "alle" | Period;
const RANGE_LABEL: Record<Range, () => string> = {
  alle: () => t("Seit 2015", "Since 2015"),
  "5J": () => t("Letzte 5 Jahre", "Last 5 years"),
  "12M": () => t("Letzte 12 Monate", "Last 12 months"),
  "3M": () => t("Letzte 3 Monate", "Last 3 months"),
};
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
  // filters stay as they were when the user comes back from a model page or the menu (src/lib/sticky.ts)
  const [brand, setBrand] = useStickyState("auktionen.marke", "");
  const [source, setSource] = useStickyState<Source>("auktionen.quelle", "Alle");
  const [house, setHouse] = useStickyState("auktionen.haus", "");
  const [period, setPeriod] = useStickyState<Period>("auktionen.zeitraum", "12M");
  const [range, setRange] = useStickyState<Range>("auktionen.ergebnisse.zeitraum", "alle");
  const [status, setStatus] = useStickyState<Status>("auktionen.status", "alle");
  const [priceMin, setPriceMin] = useStickyState("auktionen.preis_von", "");
  const [priceMax, setPriceMax] = useStickyState("auktionen.preis_bis", "");
  const [text, setText] = useStickyState("auktionen.suche", "");
  const [sort, setSort] = useStickyState<{ key: SortKey; dir: 1 | -1 }>("auktionen.sortierung", { key: "date", dir: -1 });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Sale | null>(null);
  // lite (src/lib/plan.tsx): the calendar of coming auctions is free and comes first; figures and archive are premium
  const { premium } = usePlan();

  // A search or house handed over in the link (global search, "Alle Ergebnisse" on a model) replaces the kept filter
  // once; the parameters are then taken out of the URL, so going back to this page keeps what the user set since.
  const qParam = params.get("q");
  const hausParam = params.get("haus");
  useEffect(() => {
    if (qParam === null && hausParam === null) return;
    if (qParam !== null) setText(qParam);
    if (hausParam !== null) setHouse(hausParam);
    setRange("alle");
    const next = new URLSearchParams(params);
    next.delete("q");
    next.delete("haus");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, hausParam]);

  useEffect(() => setPage(0), [brand, source, house, range, status, priceMin, priceMax, text, sort]);

  // every house with results, busiest first (not only the configured ones), so a house picked from the search is in the list
  const houses = useMemo(() => {
    const n = new Map<string, number>();
    for (const s of getAllSales()) n.set(s.house, (n.get(s.house) ?? 0) + 1);
    for (const h of AUCTION_HOUSES) if (!n.has(h.name)) n.set(h.name, 0);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  }, []);

  // All filters except the period (all results since 2015).
  const pre = useMemo(() => {
    const min = fromDisplay(Number(priceMin) || 0);
    const max = fromDisplay(Number(priceMax) || Infinity);
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
      return true;
    });
  }, [brand, source, house, status, priceMin, priceMax]);

  const base = useMemo(() => {
    const tokens = searchTokens(text);
    if (!tokens.length) return pre;
    const tUpper = text.trim().toUpperCase();
    const names = titles();
    // a picked suggestion (or a typed full name) means exactly that variant, not "Turbo S" along with "Turbo"
    const exact = variants.find((v) => names.get(v.id)!.toLowerCase() === text.trim().toLowerCase());
    if (exact) return pre.filter((s) => s.variantId === exact.id);
    return pre.filter((s) => {
      const hay = `${names.get(s.variantId)} ${s.house}`.toLowerCase().replace(/[()]/g, " ");
      return s.id.startsWith(tUpper) || (tUpper.length >= 5 && s.vin.startsWith(tUpper)) || tokens.every((tok) => hay.includes(tok));
    });
  }, [pre, text]);

  const rangeFrom = range === "alle" ? -Infinity : AS_OF - PERIOD_WEEKS[range] * WEEK;

  // what the current search could mean: matching variants (with their number of results) and auction houses
  const suggestions = useMemo(() => {
    const tokens = searchTokens(text);
    if (!tokens.length || text.trim().length < 2) return { variants: [], houses: [] };
    // counted under the other filters and the time range, so the number matches the list after picking
    const count = new Map<string, number>();
    for (const s of pre) if (s.date >= rangeFrom) count.set(s.variantId, (count.get(s.variantId) ?? 0) + 1);
    const names = titles();
    const vs = variants
      .filter((v) => count.get(v.id) && tokens.every((tok) => names.get(v.id)!.toLowerCase().replace(/[()]/g, " ").includes(tok)))
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))
      .slice(0, 6)
      .map((v) => ({ id: v.id, title: names.get(v.id)!, n: count.get(v.id)! }));
    const hs = houses.filter((h) => tokens.every((tok) => h.toLowerCase().includes(tok))).slice(0, 3);
    return { variants: vs, houses: hs };
  }, [text, houses, pre, rangeFrom]);

  const filtered = useMemo(() => {
    const from = AS_OF - PERIOD_WEEKS[period] * WEEK;
    return base.filter((s) => s.date >= from);
  }, [base, period]);

  const results = useMemo(() => (range === "alle" ? base : base.filter((s) => s.date >= rangeFrom)), [base, range, rangeFrom]);

  const sorted = useMemo(() => {
    if (sort.key === "date" && sort.dir === -1) return results; // already newest first
    const arr = [...results];
    const byPrice = sort.key === "price" || sort.key === "trend";
    arr.sort((a, b) => {
      // unsold lots have no price: keep them after the sold ones in either direction
      if (byPrice && (a.price === null) !== (b.price === null)) return a.price === null ? 1 : -1;
      const x = sortValue(a, sort.key);
      const y = sortValue(b, sort.key);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
    return arr;
  }, [results, sort]);

  const kpis = useMemo(() => {
    const auctions = filtered.filter((s) => s.source === "Auktion");
    const sold = auctions.filter((s) => s.price !== null);
    // only lots with an estimate (Bring a Trailer has none), else the mean turns NaN
    const premiums = sold.filter((s) => s.estimateLow && s.estimateHigh).map((s) => s.price! / ((s.estimateLow! + s.estimateHigh!) / 2) - 1);
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

  const shown = (page + 1) * PAGE;
  const rows = sorted.slice(0, shown);
  const active: { key: string; label: string; clear: () => void }[] = [];
  if (text.trim()) active.push({ key: "q", label: `„${text.trim()}“`, clear: () => setText("") });
  if (house) active.push({ key: "h", label: house, clear: () => setHouse("") });
  if (status !== "alle") active.push({ key: "s", label: status === "verkauft" ? t("Verkauft", "Sold") : t("Nicht verkauft", "Not sold"), clear: () => setStatus("alle") });
  if (priceMin || priceMax) active.push({ key: "p", label: `${priceMin ? eur(fromDisplay(Number(priceMin)), { compact: true }) : "0"} – ${priceMax ? eur(fromDisplay(Number(priceMax)), { compact: true }) : "∞"}`, clear: () => { setPriceMin(""); setPriceMax(""); } });
  if (range !== "alle") active.push({ key: "r", label: RANGE_LABEL[range](), clear: () => setRange("alle") });
  if (brand) active.push({ key: "b", label: brands.find((b) => b.id === brand)?.name ?? brand, clear: () => setBrand("") });


  const resetFilters = () => {
    setBrand("");
    setSource("Alle");
    setHouse("");
    setStatus("alle");
    setPriceMin("");
    setPriceMax("");
    setText("");
    setRange("alle");
  };

  return (
    <div className="space-y-16">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">{t("Auktionen", "Auctions")}</h1>
            <p className="mt-1 text-[14px] text-muted">
              {t(`${num(getAllSales().length)} erfasste Auktionsergebnisse seit 2015`, `${num(getAllSales().length)} recorded auction results since 2015`)}
            </p>
          </div>
          {premium && (
            <Segmented
              options={[
                { value: "3M" as const, label: t("3 Monate", "3 months") },
                { value: "12M" as const, label: t("12 Monate", "12 months") },
                { value: "5J" as const, label: t("5 Jahre", "5 years") },
              ]}
              value={period}
              onChange={setPeriod}
            />
          )}
        </div>
        {!premium && (
          <div className="mt-12">
            <UpcomingAuctions />
          </div>
        )}
        <Locked reason="auctions" height={170} className={premium ? undefined : "mt-16"}>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile icon={<Gavel className="size-4" strokeWidth={1.8} />} label={t("Angebotene Lose", "Lots offered")} value={num(kpis.lots)} />
          <StatTile
            icon={<Gauge className="size-4" strokeWidth={1.8} />}
            label={t("Davon verkauft", "Of which sold")}
            value={pct(kpis.sellThrough, { signed: false, digits: 0 })}
            chart={
              <div className="h-1.5 overflow-hidden rounded-full bg-panel-3" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: `${kpis.sellThrough * 100}%` }} />
              </div>
            }
          />
          <StatTile icon={<Scale className="size-4" strokeWidth={1.8} />} label={t("Zuschlag gegenüber Schätzung", "Hammer price vs. estimate")} value={<Delta value={kpis.premium} arrow={false} />} />
          <StatTile icon={<Coins className="size-4" strokeWidth={1.8} />} label={t("Umsatz", "Turnover")} value={<Money value={kpis.revenue} compact />} />
        </div>
        </Locked>
      </div>

      {premium && <UpcomingAuctions />}

      <Lock reason="auctions" height={340}>
      <Section
        eyebrow={t("Archiv seit 2015", "Archive since 2015")}
        title={t("Ergebnisse", "Results")}
        sub={t("Suchen Sie nach Modell, Auktionshaus, Losnummer oder FIN", "Search by model, auction house, lot number or VIN")}
      >
        <div className="space-y-5">
          <SearchBox
            value={text}
            onChange={setText}
            suggestions={suggestions}
            onPickVariant={(title) => setText(title)}
            onPickHouse={(h) => {
              setHouse(h);
              setText("");
            }}
          />

          <div className="-mx-4 flex items-center gap-x-3 gap-y-2.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>*]:shrink-0">
            <Segmented
              options={[
                { value: "alle" as const, label: t("Alle", "All") },
                { value: "verkauft" as const, label: t("Verkauft", "Sold") },
                { value: "nicht" as const, label: t("Nicht verkauft", "Not sold") },
              ]}
              value={status}
              onChange={setStatus}
            />
            <select className="pill-select" value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label={t("Zeitraum", "Period")}>
              {(["alle", "5J", "12M", "3M"] as const).map((r) => (
                <option key={r} value={r}>
                  {RANGE_LABEL[r]()}
                </option>
              ))}
            </select>
            <select className="pill-select" value={house} onChange={(e) => setHouse(e.target.value)} aria-label={t("Auktionshaus", "Auction house")}>
              <option value="">{t("Alle Auktionshäuser", "All auction houses")}</option>
              {houses.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
            {brands.length > 1 && (
              <select className="pill-select" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label={t("Marke", "Brand")}>
                <option value="">{t("Alle Marken", "All brands")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel py-0.5 pr-1 pl-3 text-[13px] text-muted">
              {t("Preis", "Price")}
              <input className="w-20 rounded-full bg-transparent px-2 py-1 text-ink tabular-nums placeholder:text-faint focus:bg-panel-2 focus:outline-none" inputMode="numeric" value={priceMin} onChange={(e) => setPriceMin(e.target.value.replace(/\D/g, ""))} placeholder={t("von €", "from $")} aria-label={t("Preis von", "Price from")} />
              <span className="text-faint">–</span>
              <input className="w-20 rounded-full bg-transparent px-2 py-1 text-ink tabular-nums placeholder:text-faint focus:bg-panel-2 focus:outline-none" inputMode="numeric" value={priceMax} onChange={(e) => setPriceMax(e.target.value.replace(/\D/g, ""))} placeholder={t("bis €", "to $")} aria-label={t("Preis bis", "Price to")} />
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2 border-b border-line pb-3">
            <div className="flex w-full flex-wrap items-baseline gap-x-5 gap-y-2">
            <p className="min-w-0 grow basis-[20rem] text-[14px] text-ink">
              <strong className="font-serif text-[22px] font-normal tabular-nums">{num(sorted.length)}</strong> {t("Ergebnisse", "results")}
            </p>
              <label className="ml-auto inline-flex shrink-0 items-center gap-2 text-[13px] text-muted">
                {t("Sortieren", "Sort")}
                <select className="pill-select" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [key, dir] = e.target.value.split(":"); setSort({ key: key as SortKey, dir: Number(dir) as 1 | -1 }); }}>
                  <option value="date:-1">{t("Neueste zuerst", "Newest first")}</option>
                  <option value="date:1">{t("Älteste zuerst", "Oldest first")}</option>
                  <option value="price:-1">{t("Höchster Preis", "Highest price")}</option>
                  <option value="price:1">{t("Niedrigster Preis", "Lowest price")}</option>
                  <option value="trend:-1">{t("Am weitesten über Marktwert", "Furthest above market value")}</option>
                  <option value="trend:1">{t("Am weitesten unter Marktwert", "Furthest below market value")}</option>
                  <option value="mileage:1">{t("Wenigste Kilometer", "Lowest mileage")}</option>
                  <option value="vehicle:1">{t("Fahrzeug A–Z", "Car A–Z")}</option>
                </select>
              </label>
            </div>
            {active.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {active.map((f) => (
                  <button key={f.key} onClick={f.clear} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[12.5px] text-accent hover:bg-accent-fill hover:text-on-accent">
                    {f.label} <X className="size-3" />
                  </button>
                ))}
                {active.length > 1 && (
                  <button className="text-[12.5px] text-muted underline-offset-4 hover:text-ink hover:underline" onClick={resetFilters}>
                    {t("Alle entfernen", "Clear all")}
                  </button>
                )}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <Empty>{t("Keine Ergebnisse für diese Suche. Versuchen Sie es mit weniger Begriffen oder einem längeren Zeitraum.", "No results for this search. Try fewer words or a longer period.")}</Empty>
          ) : (
            <ul className="-mt-2">
              {rows.map((s) => (
                <ResultRow key={`${s.id}-${s.variantId}-${s.date}-${s.vin}`} sale={s} onOpen={() => setSelected(s)} />
              ))}
            </ul>
          )}
          {sorted.length > shown && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button className="btn" onClick={() => setPage((p) => p + 1)}>
                {t(`Weitere ${Math.min(PAGE, sorted.length - shown)} anzeigen`, `Show ${Math.min(PAGE, sorted.length - shown)} more`)}
              </button>
              <span className="text-[12px] text-faint tabular-nums">
                {num(shown)} {t("von", "of")} {num(sorted.length)}
              </span>
            </div>
          )}
        </div>
      </Section>
      </Lock>

      <Lock reason="auctions" height={200}>
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
              <Line yAxisId="rate" dataKey="rate" stroke="var(--color-series-1)" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Section>
      </Lock>

      <SaleModal sale={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

/** Coming auctions of the houses in our data, with a link to each sale; refreshed by the daily update. */
function UpcomingAuctions() {
  const [expanded, setExpanded] = useState(false);
  // today's date (UTC midnight, like the ISO dates), never before the calendar's date: sales that are over drop out
  // and the countdown stays right when the page is opened days after the last update
  const now = new Date();
  const today = Math.max(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()), CALENDAR_AS_OF ? Date.parse(CALENDAR_AS_OF) : AS_OF);
  const sales = calendarSales.filter((s) => Date.parse(s.end ?? s.date) >= today);
  const visible = expanded ? sales : sales.slice(0, 8);
  const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleDateString(locale(), { ...o, timeZone: "UTC" });
  const inDays = (iso: string) => {
    const d = Math.round((Date.parse(iso) - today) / 86_400_000);
    return d <= 0 ? t("läuft", "running") : d === 1 ? t("morgen", "tomorrow") : t(`in ${d} Tagen`, `in ${d} days`);
  };
  const span = (s: CalendarSale) =>
    s.end ? `${fmt(s.date, { day: "numeric", month: "short" })} – ${fmt(s.end, { day: "numeric", month: "short", year: "numeric" })}` : fmt(s.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

  return (
    <Section
      eyebrow={t("Kalender", "Calendar")}
      title={t("Kommende Auktionen", "Upcoming auctions")}
      sub={t(
        `Termine der Häuser aus unserer Datenbank · täglich aktualisiert${CALENDAR_AS_OF ? `, Stand ${date(Date.parse(CALENDAR_AS_OF))}` : ""}`,
        `Dates of the houses in our data · updated daily${CALENDAR_AS_OF ? `, as of ${date(Date.parse(CALENDAR_AS_OF))}` : ""}`,
      )}
    >
      <div className="space-y-6">
        {sales.length === 0 ? (
          <Empty>{t("Die Termine werden mit dem nächsten täglichen Update geladen.", "The dates load with the next daily update.")}</Empty>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[3px] border border-line bg-panel">
            {visible.map((s) => (
              <li key={`${s.house}|${s.name}|${s.date}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
                <div className="w-14 shrink-0 rounded-[3px] bg-accent-soft py-1.5 text-center text-accent">
                  <div className="font-serif text-[22px] leading-none">{fmt(s.date, { day: "numeric" })}</div>
                  <div className="mt-1 text-[10.5px] font-semibold tracking-[0.12em] uppercase">{fmt(s.date, { month: "short" })}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-muted">
                    {s.house} · {span(s)} · {inDays(s.date)}
                  </div>
                  <div className="font-serif text-[17px] leading-snug">{s.name}</div>
                  {(s.place || s.country || s.porsche) && (
                    <div className="text-[12px] text-faint">
                      {s.country && `${flag(s.country)} `}
                      {s.place}
                      {s.porsche ? `${s.place || s.country ? " · " : ""}${s.porsche === 1 ? t("1 Porsche im Katalog", "1 Porsche in the catalogue") : t(`${s.porsche} Porsche im Katalog`, `${s.porsche} Porsches in the catalogue`)}` : ""}
                    </div>
                  )}
                </div>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer" className="btn shrink-0">
                    {t("Zur Auktion", "View sale")} <ExternalLink className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {sales.length > 8 && (
          <div className="flex justify-center">
            <button className="btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? t("Weniger anzeigen", "Show fewer") : t(`Alle ${sales.length} Termine anzeigen`, `Show all ${sales.length} dates`)}
            </button>
          </div>
        )}
        <div>
          <div className="kpi-label">{t("Auktionskalender der Häuser", "Auction calendars of the houses")}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {HOUSE_CALENDARS.map((h) => (
              <a key={h.house} href={h.url} target="_blank" rel="noreferrer" className="chip inline-flex items-center gap-1">
                {h.house}
                {h.online && <span className="text-accent">· {t("laufend online", "live online")}</span>}
                <ExternalLink className="size-3 text-faint" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** Lower-case words of a search, brackets dropped, so "993 turbo" finds "911 (993) Turbo". */
function searchTokens(text: string) {
  return text.toLowerCase().replace(/[()]/g, " ").split(/\s+/).filter(Boolean);
}

/** The big search field with suggestions: matching variants (with their number of results) and auction houses. */
function SearchBox({
  value,
  onChange,
  suggestions,
  onPickVariant,
  onPickHouse,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: { variants: { id: string; title: string; n: number }[]; houses: string[] };
  onPickVariant: (title: string) => void;
  onPickHouse: (house: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const any = suggestions.variants.length + suggestions.houses.length > 0;
  const exact = suggestions.variants.length === 1 && suggestions.variants[0].title.toLowerCase() === value.trim().toLowerCase();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-accent" strokeWidth={2} />
      <input
        className="h-13 w-full rounded-full border border-line-2 bg-panel pr-12 pl-11 text-[15.5px] text-ink shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-colors placeholder:text-faint focus:border-accent focus:outline-none"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder={t("z. B. 993 Turbo, Carrera RS, RM Sotheby's oder eine FIN", "e.g. 993 Turbo, Carrera RS, RM Sotheby's or a VIN")}
        aria-label={t("Ergebnisse durchsuchen", "Search results")}
        role="combobox"
        aria-expanded={open && any && !exact}
      />
      {value && (
        <button className="absolute top-1/2 right-3 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-panel-2 hover:text-ink" onClick={() => onChange("")} aria-label={t("Suche leeren", "Clear search")}>
          <X className="size-4" />
        </button>
      )}
      {open && any && !exact && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[6px] border border-line bg-panel py-1.5 shadow-lg" role="listbox">
          {suggestions.variants.length > 0 && <div className="px-4 pt-1 pb-1 eyebrow text-faint">{t("Modelle", "Models")}</div>}
          {suggestions.variants.map((v) => (
            <button
              key={v.id}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickVariant(v.title);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-4 px-4 py-2 text-left hover:bg-accent-soft"
            >
              <span className="truncate font-serif text-[15px]">{v.title}</span>
              <span className="shrink-0 text-[12px] text-faint tabular-nums">
                {num(v.n)} {t("Ergebnisse", "results")}
              </span>
            </button>
          ))}
          {suggestions.houses.length > 0 && <div className="mt-1 border-t border-line px-4 pt-2 pb-1 eyebrow text-faint">{t("Auktionshäuser", "Auction houses")}</div>}
          {suggestions.houses.map((h) => (
            <button
              key={h}
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickHouse(h);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-[14px] hover:bg-accent-soft"
            >
              <Gavel className="size-3.5 text-faint" /> {h}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One auction result: photo, car with date, house and mileage, then the price and how it compares with the market value. */
function ResultRow({ sale: s, onOpen }: { sale: Sale; onOpen: () => void }) {
  const v = variantById.get(s.variantId)!;
  const unsold = s.price === null;
  return (
    <li className="border-b border-line/80">
      <button onClick={onOpen} className="group grid w-full grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-[3px] px-2 py-3 text-left transition-colors hover:bg-panel sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_6.5rem]">
        <span className="relative flex h-12 w-16 items-center justify-center overflow-hidden rounded-[3px] bg-panel-2 sm:w-[4.5rem] [&>span]:!h-full [&>span]:!w-full">
          <Gavel className="absolute size-4 text-line-2" aria-hidden />
          <LotThumb url={s.url} house={s.house} image={s.image} small link={false} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-serif text-[16px] leading-snug transition-colors group-hover:text-accent">{variantTitle(v, { brand: false })}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted">
            {date(s.date)} · {s.house}
            {s.mileage ? ` · ${km(s.mileage)}` : ""}
          </span>
        </span>
        <span className="text-right">
          {unsold ? (
            <>
              <span className="inline-block rounded-full bg-panel-3 px-2 py-0.5 text-[11.5px] text-muted">{t("nicht verkauft", "not sold")}</span>
              {unsoldPrice(s) && <span className="mt-1 block text-[12px] text-faint">{unsoldPrice(s)}</span>}
            </>
          ) : (
            <span className="font-serif text-[18px] tabular-nums">
              <Money value={s.price} sale={s} />
            </span>
          )}
        </span>
        <span className="col-start-3 row-start-2 text-right sm:col-start-4 sm:row-start-1">
          {unsold ? <span className="text-[12px] text-faint">–</span> : <DeltaBadge value={s.trend} digits={0} />}
        </span>
      </button>
    </li>
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
    [t("Preis", "Price"), sale.price === null ? <span className="text-down">{t("nicht verkauft", "not sold")}</span> : <Money value={sale.price} sale={sale} className="text-[17px]" />],
    [t("Schätzung", "Estimate"), sale.estimateLow && sale.estimateHigh ? `${eur(sale.estimateLow, { rounded: true })} – ${eur(sale.estimateHigh, { rounded: true })}` : "–"],
    ...(sale.price === null && sale.highBid ? [[t("Höchstgebot (kein Verkauf)", "High bid (not sold)"), saleAmount(sale.highBid, sale, { rounded: true })] as [string, React.ReactNode]] : []),
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
      <LotGallery url={sale.url} house={sale.house} image={sale.image} />
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
