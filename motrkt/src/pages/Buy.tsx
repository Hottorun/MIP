import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStickyParams } from "../lib/sticky";
import { ArrowUpDown, Briefcase, ChevronDown, SlidersHorizontal, ExternalLink, Heart, Loader2, RefreshCw, Search, Star, TrendingDown, X } from "lucide-react";
import { MODEL_CATEGORIES, brandById, brands, generationById, genName, modelById, modelName, models, variantById, variantShortTitle, variantTitle, yearsLabel } from "../data/db";
import { AS_OF, CONDITION_FACTOR, COUNTRY_NAMES, DAY, getSeries } from "../data/generate";
import { useLiveListings } from "../state/liveListings";
import { shopListings } from "../data/shop";
import { AskPrice } from "../components/AskPrice";
import { getMetrics } from "../data/market";
import type { Listing, Model, Variant } from "../data/types";
import { cn, curSign, date, eur, flag, fromDisplay, km, num, pct, liters, safeUrl } from "../lib/format";
import { useStore } from "../state/store";
import { ListingPhoto, NoPhoto } from "../components/ListingPhoto";
import { BrandEmblem, Delta, Empty, Modal, Pill, Sparkline, Money } from "../components/ui";
import { LockedValue } from "../components/premium/Locked";
import { usePlan } from "../lib/plan";
import { locale, t } from "../i18n";
import { tr } from "../i18n/terms";

type SortKey = "deal" | "priceAsc" | "priceDesc" | "newest" | "mileage";
type SellerFilter = "" | Listing["sellerType"];

const PAGE = 24;
const barSelect = "cursor-pointer bg-transparent text-ink focus:outline-none";
const barInput = "bg-transparent tabular-nums placeholder:text-faint focus:outline-none";

type Enriched = { l: Listing; v: Variant; value: number; condFactor: number; kmFactor: number; fair: number; deal: number | null };

/** Asking price cut by at least 1 % since the listing was first tracked. */
const isReduced = (l: Listing) => l.priceChange !== null && l.priceChange !== undefined && l.priceChange < -0.01;

function mileageAdjustment(v: Variant, l: Listing) {
  if (l.mileage === null) return 1;
  const age = Math.max(1, new Date(AS_OF).getUTCFullYear() - l.year);
  const perYear = v.tags.includes("Leichtbau") || v.value > 1_000_000 ? 2500 : v.value > 250_000 ? 3500 : 6500;
  const typical = age * perYear;
  return Math.min(1.08, Math.max(0.88, 1 + 0.06 * (1 - l.mileage / typical)));
}

function enrich(list: Listing[]): Enriched[] {
  return list.map((l) => {
    const v = variantById.get(l.variantId)!;
    const value = getMetrics(v.id).value;
    const condFactor = CONDITION_FACTOR[l.condition];
    const kmFactor = mileageAdjustment(v, l);
    const fair = value * condFactor * kmFactor;
    // Variants with too few records have no market value to compare against.
    return { l, v, value, condFactor, kmFactor, fair, deal: v.measured && !l.onRequest ? l.price / fair - 1 : null };
  });
}

/** Sort key for the price orders: listings without a price ("auf Anfrage") go last either way. */
const priceRank = (l: Listing, dir: 1 | -1) => (l.onRequest ? dir * Number.MAX_VALUE : l.price);

/** Sort key for "best price": listings without an assessment go last. */
const dealRank = (e: Enriched) => e.deal ?? Number.MAX_VALUE;

/** City where the listing names one, otherwise the country. */
const place = (l: Listing) => (l.city === "–" ? tr(COUNTRY_NAMES[l.country] ?? l.country) : tr(l.city));

function dealLabel(deal: number | null): { label: string; tone: "up" | "neutral" | "down" } {
  if (deal === null) return { label: t("Kein Marktwert", "No market value"), tone: "neutral" };
  if (deal < -0.07) return { label: t("Unter Marktwert", "Below market value"), tone: "up" };
  if (deal > 0.07) return { label: t("Über Marktwert", "Above market value"), tone: "down" };
  return { label: t("Fairer Preis", "Fair price"), tone: "neutral" };
}

export default function Buy() {
  const [params, setParams] = useSearchParams();
  const { savedListings, toggleSavedListing } = useStore();
  const variantParam = params.get("variant");
  const variantFilter = variantParam ? variantById.get(variantParam) : undefined;
  const selectedId = params.get("inserat");
  // the filters come back when the user returns from a listing or a model page (src/lib/sticky.ts)
  useStickyParams("kaufen", params, setParams, ["inserat"]);

  // The filters live in the URL (like on the Models page): a filtered view can be shared, reloaded and gone back to.
  const get = (k: string) => params.get(k) ?? "";
  const setFilters = (next: Record<string, string | boolean>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === true) p.set(k, "1");
      else if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
  };
  const brand = get("marke");
  const model = get("modell");
  const generation = get("generation");
  const setGeneration = (v: string) => setFilters({ generation: v });
  const priceMin = get("preis_von");
  const setPriceMin = (v: string) => setFilters({ preis_von: v });
  const priceMax = get("preis_bis");
  const setPriceMax = (v: string) => setFilters({ preis_bis: v });
  const yearFrom = get("jahr_von");
  const setYearFrom = (v: string) => setFilters({ jahr_von: v });
  const yearTo = get("jahr_bis");
  const setYearTo = (v: string) => setFilters({ jahr_bis: v });
  const maxKm = get("km_bis");
  const setMaxKm = (v: string) => setFilters({ km_bis: v });
  const seller = get("anbieter") as SellerFilter;
  const setSeller = (v: SellerFilter) => setFilters({ anbieter: v });
  const savedOnly = get("gemerkt") === "1";
  const dealsOnly = get("deals") === "1";
  const reducedOnly = get("gesenkt") === "1";
  const text = get("suche");
  const setText = (v: string) => setFilters({ suche: v });
  const sort = (get("sortierung") || "deal") as SortKey;
  const setSort = (v: SortKey) => setFilters({ sortierung: v === "deal" ? "" : v });
  const [visible, setVisible] = useState(PAGE);
  const [moreFilters, setMoreFilters] = useState(false);

  const live = useLiveListings();
  const preferLive = get("quelle") !== "demo";
  const setPreferLive = (v: boolean) => setFilters({ quelle: v ? "" : "demo" });
  const liveAvailable = live.listings.length > 0;
  const showingLive = preferLive && liveAvailable;
  const source = showingLive ? live.listings : shopListings();
  const all = useMemo(() => enrich(source), [source]);
  const brandModels = models.filter((m) => !brand || m.brandId === brand);

  // Everything but brand, model and generation: the model list counts against this, so its numbers follow the other filters.
  const base = useMemo(() => {
    const q = text.trim().toLowerCase();
    const pMin = fromDisplay(Number(priceMin) || 0);
    const pMax = fromDisplay(Number(priceMax) || Infinity);
    const yFrom = Number(yearFrom) || 0;
    const yTo = Number(yearTo) || Infinity;
    const kMax = Number(maxKm) || Infinity;
    const saved = new Set(savedListings);
    return all.filter(({ l, v, deal }) => {
      if (variantFilter && v.id !== variantFilter.id) return false;
      if (!l.onRequest && (l.price < pMin || l.price > pMax)) return false;
      if (l.year < yFrom || l.year > yTo) return false;
      if (kMax < Infinity && (l.mileage === null || l.mileage > kMax)) return false;
      if (seller && l.sellerType !== seller) return false;
      if (savedOnly && !saved.has(l.id)) return false;
      if (dealsOnly && !(deal !== null && deal < -0.07)) return false;
      if (reducedOnly && !isReduced(l)) return false;
      if (q) {
        const hay = `${variantTitle(v)} ${l.id} ${l.vin} ${l.city} ${tr(l.city)} ${l.seller} ${l.color} ${tr(l.color)}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }, [all, variantFilter, priceMin, priceMax, yearFrom, yearTo, maxKm, seller, savedOnly, dealsOnly, reducedOnly, savedListings, text]);

  const counts = useMemo(() => {
    const byModel = new Map<string, number>();
    const byGen = new Map<string, number>();
    for (const { v } of base) {
      if (brand && v.brandId !== brand) continue;
      byModel.set(v.modelId, (byModel.get(v.modelId) ?? 0) + 1);
      byGen.set(v.generationId, (byGen.get(v.generationId) ?? 0) + 1);
    }
    return { byModel, byGen };
  }, [base, brand]);

  const filtered = useMemo(() => {
    const out = base.filter(({ v }) => {
      if (brand && v.brandId !== brand) return false;
      if (model && v.modelId !== model) return false;
      if (generation && v.generationId !== generation) return false;
      return true;
    });
    const cmp: Record<SortKey, (a: Enriched, b: Enriched) => number> = {
      deal: (a, b) => dealRank(a) - dealRank(b),
      priceAsc: (a, b) => priceRank(a.l, 1) - priceRank(b.l, 1),
      priceDesc: (a, b) => priceRank(b.l, -1) - priceRank(a.l, -1),
      newest: (a, b) => b.l.listedAt - a.l.listedAt,
      mileage: (a, b) => (a.l.mileage ?? Number.MAX_SAFE_INTEGER) - (b.l.mileage ?? Number.MAX_SAFE_INTEGER),
    };
    return out.sort(cmp[sort]);
  }, [base, brand, model, generation, sort]);

  useEffect(() => setVisible(PAGE), [variantParam, brand, model, generation, priceMin, priceMax, yearFrom, yearTo, maxKm, seller, savedOnly, dealsOnly, reducedOnly, text, sort]);

  // A listing linked from the search or a model page may come from the other source than the one shown (Classic Trader
  // while mobile.de live is on): look it up there too instead of reporting it as gone.
  const selected = useMemo(() => {
    if (!selectedId) return undefined;
    const hit = all.find((e) => e.l.id === selectedId);
    if (hit || !showingLive) return hit;
    return enrich(shopListings().filter((l) => l.id === selectedId))[0];
  }, [all, selectedId, showingLive]);
  const openListing = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("inserat", id);
    else next.delete("inserat");
    setParams(next, { replace: !id });
  };
  const clearVariant = () => {
    const next = new URLSearchParams(params);
    next.delete("variant");
    setParams(next, { replace: true });
  };
  const reset = () =>
    setFilters({ marke: "", modell: "", generation: "", preis_von: "", preis_bis: "", jahr_von: "", jahr_bis: "", km_bis: "", anbieter: "", gemerkt: "", deals: "", gesenkt: "", suche: "", variant: "" });

  const topDeals = filtered.filter((e) => e.deal !== null && e.deal < -0.07).length;
  const digits = (s: string) => s.replace(/\D/g, "");

  const pickModel = (id: string) => setFilters({ modell: id, generation: "", marke: id ? modelById.get(id)!.brandId : brand, variant: "" });
  const pickBrand = (id: string) => setFilters({ marke: id, modell: "", generation: "", variant: "" });
  const activeModel = model ? modelById.get(model) : undefined;
  const modelLabel = (m: Model) => (brand || brands.length === 1 ? modelName(m) : `${brandById.get(m.brandId)!.name} ${modelName(m)}`);
  const brandTotal = brand ? base.filter((e) => e.v.brandId === brand).length : base.length;
  const extraFilters = [yearFrom, yearTo, maxKm, seller].filter(Boolean).length;
  const anyFilter = Boolean(brand || model || priceMin || priceMax || extraFilters || savedOnly || dealsOnly || reducedOnly || text || variantParam);
  const marketDeals = all.filter((e) => e.deal !== null && e.deal < -0.07).length;
  const marketReduced = all.filter((e) => isReduced(e.l)).length;
  const modelsListed = new Set(all.map((e) => e.v.modelId)).size;
  const divider = <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="max-w-2xl">
          <div className="text-[11px] font-medium tracking-[0.18em] text-gold uppercase">{t("Marktplatz", "Marketplace")}</div>
          <h1 className="mt-2 font-display text-[44px] leading-[1.05] sm:text-[56px]">{t("Kaufen", "Buy")}</h1>
          <p className="mt-3 font-serif text-[17px] leading-relaxed text-muted italic">
            {t(
              "Jedes Angebot im Vergleich zum fairen Marktwert, bereinigt um Zustand und Laufleistung.",
              "Every listing set against its fair market value, adjusted for condition and mileage.",
            )}
          </p>
          <SourceBar live={live} preferLive={preferLive} setPreferLive={setPreferLive} sourceLabel={showingLive ? t("Live von mobile.de", "Live from mobile.de") : t("Von Karero und Janzen Klassik", "From Karero and Janzen Klassik")} />
        </div>
        <dl className="flex divide-x divide-line overflow-x-auto">
          {[
            [t("Inserate", "Listings"), num(all.length)],
            [t("Unter Marktwert", "Below value"), num(marketDeals)],
            [t("Modelle", "Models"), num(modelsListed)],
          ].map(([k, val]) => (
            <div key={k} className="px-4 first:pl-0 last:pr-0 sm:px-7">
              <dd className="font-serif text-[30px] leading-none tabular-nums sm:text-[34px]">{val}</dd>
              <dt className="mt-2 text-[10.5px] tracking-[0.1em] whitespace-nowrap text-muted uppercase sm:text-[11px] sm:tracking-[0.12em]">{k}</dt>
            </div>
          ))}
        </dl>
      </header>

      <div className="z-20 -mx-5 lg:sticky lg:top-[72px] px-5 py-2 backdrop-blur-sm sm:-mx-8 sm:px-8" style={{ background: "color-mix(in srgb, var(--color-bg) 88%, transparent)" }}>
        <div className="rounded-[3px] border border-line bg-panel px-4 py-3 text-[14px] shadow-[0_1px_0_rgba(31,29,26,0.03)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex w-full items-center gap-2 sm:w-64">
              <Search className="size-4 shrink-0 text-faint" strokeWidth={1.5} />
              <input className="min-w-0 flex-1 bg-transparent placeholder:text-faint focus:outline-none" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("Modell, Stadt, Händler oder FIN", "Model, city, dealer or VIN")} aria-label={t("Inserate durchsuchen", "Search listings")} />
              {text && (
                <button onClick={() => setText("")} className="text-faint hover:text-ink" aria-label={t("Suche leeren", "Clear search")}>
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {divider}
            {brands.length > 1 && (
              <select className={barSelect} value={brand} onChange={(e) => pickBrand(e.target.value)} aria-label={t("Marke", "Brand")}>
                <option value="">{t("Alle Marken", "All brands")}</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
            <ModelMenu models={brandModels} counts={counts.byModel} total={brandTotal} value={model} label={modelLabel} onPick={pickModel} />
            {activeModel && activeModel.generationIds.length > 1 && (
              <select className={barSelect} value={generation} onChange={(e) => setGeneration(e.target.value)} aria-label="Generation">
                <option value="">{t(`Alle Generationen (${num(counts.byModel.get(activeModel.id) ?? 0)})`, `All generations (${num(counts.byModel.get(activeModel.id) ?? 0)})`)}</option>
                {activeModel.generationIds.map((id) => {
                  const g = generationById.get(id)!;
                  return (
                    <option key={id} value={id}>
                      {`${genName(g)}, ${yearsLabel(g.years)} (${num(counts.byGen.get(id) ?? 0)})`}
                    </option>
                  );
                })}
              </select>
            )}
            {divider}
            <div className="flex items-center gap-2">
              <input className={cn(barInput, "w-24")} inputMode="numeric" placeholder={t("Preis ab €", "Price from $")} value={priceMin} onChange={(e) => setPriceMin(digits(e.target.value))} aria-label={t("Preis ab", "Price from")} />
              <span className="text-faint">–</span>
              <input className={cn(barInput, "w-24")} inputMode="numeric" placeholder={t(`bis ${curSign()}`, `to ${curSign()}`)} value={priceMax} onChange={(e) => setPriceMax(digits(e.target.value))} aria-label={t("Preis bis", "Price to")} />
            </div>
            {divider}
            <button className="inline-flex items-center gap-1.5 text-muted hover:text-ink" onClick={() => setMoreFilters((m) => !m)} aria-expanded={moreFilters}>
              <SlidersHorizontal className="size-3.5" strokeWidth={1.5} />
              {t("Filter", "Filters")}
              {extraFilters > 0 && <span className="rounded-full bg-ink px-1.5 text-[11px] text-bg tabular-nums">{extraFilters}</span>}
            </button>
            <label className="flex items-center gap-2 text-muted lg:ml-auto">
              <ArrowUpDown className="size-3.5" strokeWidth={1.5} />
              <select className={cn(barSelect, "text-ink")} value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t("Sortierung", "Sort order")}>
                <option value="deal">{t("Bester Preis zum Marktwert", "Best price vs. market value")}</option>
                <option value="priceAsc">{t("Preis aufsteigend", "Price, low to high")}</option>
                <option value="priceDesc">{t("Preis absteigend", "Price, high to low")}</option>
                <option value="newest">{t("Neueste zuerst", "Newest first")}</option>
                <option value="mileage">{t("Laufleistung", "Mileage")}</option>
              </select>
            </label>
          </div>
          {moreFilters && (
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <span className="text-muted">{t("Baujahr", "Year")}</span>
                <input className={cn(barInput, "w-16")} inputMode="numeric" placeholder={t("von", "from")} value={yearFrom} onChange={(e) => setYearFrom(digits(e.target.value).slice(0, 4))} aria-label={t("Baujahr ab", "Year from")} />
                <span className="text-faint">–</span>
                <input className={cn(barInput, "w-16")} inputMode="numeric" placeholder={t("bis", "to")} value={yearTo} onChange={(e) => setYearTo(digits(e.target.value).slice(0, 4))} aria-label={t("Baujahr bis", "Year to")} />
              </div>
              {divider}
              <input className={cn(barInput, "w-36")} inputMode="numeric" placeholder={t("Max. Laufleistung km", "Max. mileage km")} value={maxKm} onChange={(e) => setMaxKm(digits(e.target.value))} aria-label={t("Maximale Laufleistung", "Maximum mileage")} />
              {divider}
              <select className={barSelect} value={seller} onChange={(e) => setSeller(e.target.value as SellerFilter)} aria-label={t("Verkäufer", "Seller")}>
                <option value="">{t("Alle Verkäufer", "All sellers")}</option>
                <option value="Händler">{tr("Händler")}</option>
                <option value="Privat">{tr("Privat")}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="-mt-4 flex flex-wrap items-center gap-2">
        <button className={cn("chip", dealsOnly && "chip-active")} onClick={() => setFilters({ deals: !dealsOnly })} aria-pressed={dealsOnly}>
          <span className={cn("size-1.5 rounded-full", dealsOnly ? "bg-bg" : "bg-up")} /> {t("Unter Marktwert", "Below market value")}
        </button>
        <button className={cn("chip", reducedOnly && "chip-active")} onClick={() => setFilters({ gesenkt: !reducedOnly })} aria-pressed={reducedOnly} title={t("Inserate, deren Preis seit der ersten Erfassung gesenkt wurde", "Listings whose asking price was cut since first tracked")}>
          <TrendingDown className="size-3.5" strokeWidth={1.5} /> {t("Preis gesenkt", "Price reduced")} <span className="tabular-nums opacity-70">{marketReduced}</span>
        </button>
        <button className={cn("chip", savedOnly && "chip-active")} onClick={() => setFilters({ gemerkt: !savedOnly })} aria-pressed={savedOnly}>
          <Heart className="size-3.5" strokeWidth={1.5} fill={savedOnly ? "currentColor" : "none"} /> {t("Gemerkt", "Saved")} <span className="tabular-nums opacity-70">{savedListings.length}</span>
        </button>
        {variantFilter && (
          <span className="chip chip-active">
            {variantTitle(variantFilter)}
            <button onClick={clearVariant} aria-label={t("Variantenfilter entfernen", "Remove variant filter")}>
              <X className="size-3" />
            </button>
          </span>
        )}
        <span className="ml-auto text-[13px] text-muted">
          <span className="font-serif text-[16px] text-ink tabular-nums">{num(filtered.length)}</span> {t("Inserate", "listings")}
          {topDeals > 0 && (
            <>
              {" · "}
              <span className="text-up">{t(`${num(topDeals)} unter Marktwert`, `${num(topDeals)} below value`)}</span>
            </>
          )}
        </span>
        {anyFilter && (
          <button className="text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline" onClick={reset}>
            {t("Zurücksetzen", "Reset")}
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>
          {t("Keine Inserate für diese Filter.", "No listings match these filters.")}{" "}
          {savedOnly && t("Merken Sie sich Inserate über das Herz-Symbol.", "Save listings with the heart icon.")}
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-x-7 gap-y-14 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, visible).map((e) => (
            <ListingCard key={e.l.id} e={e} saved={savedListings.includes(e.l.id)} onSave={() => toggleSavedListing(e.l.id)} onOpen={() => openListing(e.l.id)} />
          ))}
        </div>
      )}
      {filtered.length > 0 && (
        <div className="flex flex-col items-center gap-4 pt-2">
          <div className="text-[12px] tracking-[0.08em] text-muted uppercase">
            {t(`${num(Math.min(visible, filtered.length))} von ${num(filtered.length)} angezeigt`, `Showing ${num(Math.min(visible, filtered.length))} of ${num(filtered.length)}`)}
          </div>
          <div className="h-px w-48 bg-line">
            <div className="h-px bg-ink transition-all" style={{ width: `${(Math.min(visible, filtered.length) / filtered.length) * 100}%` }} />
          </div>
          {visible < filtered.length && (
            <button className="btn mt-2 px-8" onClick={() => setVisible((n) => n + PAGE)}>
              {t("Weitere Inserate laden", "Load more listings")}
            </button>
          )}
        </div>
      )}

      {selected && <ListingModal key={selected.l.id} e={selected} all={all} onClose={() => openListing(null)} onOpen={openListing} />}
      {selectedId && !selected && (
        <Modal open onClose={() => openListing(null)} title={t("Inserat nicht gefunden", "Listing not found")}>
          <p className="text-sm text-muted">{t(`Das Inserat ${selectedId} ist nicht mehr aktiv.`, `Listing ${selectedId} is no longer active.`)}</p>
        </Modal>
      )}
    </div>
  );
}

function ListingCard({ e, saved, onSave, onOpen }: { e: Enriched; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const { l, v } = e;
  const d = dealLabel(e.deal);
  const badge =
    e.deal === null ? null : d.tone === "up" ? (
      <span className="rounded-[2px] bg-bg/95 px-2 py-1 text-[11.5px] text-up shadow-sm">{t(`${pct(-e.deal, { digits: 0, signed: false })} unter Marktwert`, `${pct(-e.deal, { digits: 0, signed: false })} below value`)}</span>
    ) : d.tone === "down" ? (
      <span className="rounded-[2px] bg-bg/95 px-2 py-1 text-[11.5px] text-down shadow-sm">{t(`${pct(e.deal, { digits: 0, signed: false })} über Marktwert`, `${pct(e.deal, { digits: 0, signed: false })} above value`)}</span>
    ) : (
      <span className="rounded-[2px] bg-bg/95 px-2 py-1 text-[11.5px] text-muted shadow-sm">{d.label}</span>
    );
  return (
    <article className="group cursor-pointer" onClick={onOpen} tabIndex={0} role="button" onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(); } }}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-[3px] bg-panel-3">
        <ListingPhoto src={l.images?.[0]} alt={l.title} className="size-full transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        {(badge || isReduced(l)) && (
          <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
            {badge}
            {isReduced(l) && (
              <span className="rounded-[2px] bg-bg/95 px-2 py-1 text-[11.5px] text-up shadow-sm">
                {t(`Preis ${pct(-l.priceChange!, { digits: 0, signed: false })} gesenkt`, `Price cut ${pct(-l.priceChange!, { digits: 0, signed: false })}`)}
              </span>
            )}
          </div>
        )}
        <span className="absolute bottom-3 left-3 text-[11px] text-white/0 transition-colors duration-500 group-hover:text-white/90 pointer-coarse:text-white/90">{l.source}</span>
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onSave();
          }}
          className={cn("absolute top-3 right-3 rounded-full bg-bg/90 p-2 text-ink shadow-sm transition-opacity focus-visible:opacity-100", saved ? "opacity-100" : "opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100")}
          aria-label={saved ? t("Nicht mehr merken", "Unsave") : t("Inserat merken", "Save listing")}
          aria-pressed={saved}
        >
          <Heart className="size-4" strokeWidth={1.5} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="mt-4 text-[11px] tracking-[0.1em] text-faint uppercase">
        {l.year} · {km(l.mileage)}
      </div>
      <h3 className="mt-1 truncate font-serif text-[18px] leading-snug decoration-line-2 underline-offset-4 group-hover:underline">{variantTitle(v, { brand: false })}</h3>
      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
        <AskPrice l={l} className="text-[17px]" />
        <span className="min-w-0 truncate text-[13px] text-muted">
          {flag(l.country)} {place(l)}
        </span>
      </div>
    </article>
  );
}

function ListingModal({ e, all, onClose, onOpen }: { e: Enriched; all: Enriched[]; onClose: () => void; onOpen: (id: string) => void }) {
  const { l, v } = e;
  const { watchlist, toggleWatch, addHolding, toast } = useStore();
  const [added, setAdded] = useState(false);
  const d = l.onRequest ? { label: t("Preis auf Anfrage", "Price on request"), tone: "neutral" as const } : dealLabel(e.deal);
  const watched = watchlist.includes(v.id);
  const m = getMetrics(v.id);
  const lite = !usePlan().premium; // the value's history is premium (src/lib/plan.tsx)
  const spark = getSeries(v.id).slice(-52).map((p) => p.value);
  const similar = all
    .filter((o) => o.v.id === v.id && o.l.id !== l.id)
    .sort((a, b) => dealRank(a) - dealRank(b))
    .slice(0, 4);

  const na = t("k. A.", "n/a");
  const yes = t("Ja", "Yes");
  const no = t("Nein", "No");
  const days = Math.max(0, Math.round((AS_OF - l.listedAt) / DAY));
  const yesNo = (b: boolean | null) => (b === null ? na : b ? yes : <span className="text-warn">{no}</span>);
  const specs: [string, React.ReactNode][] = [
    [t("Inserat-ID", "Listing ID"), <span className="font-mono">{l.id}</span>],
    [t("FIN", "VIN"), l.vin === "–" ? na : <span className="font-mono">{l.vin}</span>],
    ...(l.source === "mobile.de"
      ? ([
          [t("Vorbesitzer", "Previous owners"), l.previousOwners ?? na],
          [t("Unfallschaden", "Accident damage"), l.accidentDamaged === null || l.accidentDamaged === undefined ? na : l.accidentDamaged ? <span className="text-warn">{yes}</span> : no],
        ] as [string, React.ReactNode][])
      : []),
    [t("Baujahr", "Year"), t(`${l.year} (Bauzeit ${yearsLabel(v.years)})`, `${l.year} (built ${yearsLabel(v.years)})`)],
    [t("Laufleistung", "Mileage"), km(l.mileage)],
    [t("Zustand", "Condition"), l.conditionUnknown ? t("k. A. (Bewertung nimmt Note 2 an)", "n/a (valuation assumes grade 2)") : t(`Note ${l.condition}`, `Grade ${l.condition}`)],
    [t("Farbe", "Colour"), l.color === "–" ? na : <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border border-white/20" style={{ background: l.colorHex }} />{tr(l.color)}</span>],
    [t("Karosserie", "Body"), tr(l.body)],
    [t("Getriebe", "Gearbox"), l.gearbox === null ? na : l.gearbox === "Manual" ? t("Schaltgetriebe", "Manual") : t("Automatik", "Automatic")],
    [t("Leistung", "Power"), `${l.powerPs ?? v.hp} PS · ${liters(v.liters)} l`],
    ["Matching Numbers", yesNo(l.matchingNumbers)],
    [t("Servicehistorie", "Service history"), l.serviceHistory === null ? na : l.serviceHistory ? t("Lückenlos", "Complete") : <span className="text-warn">{t("Unvollständig", "Incomplete")}</span>],
    [t("Standort", "Location"), `${flag(l.country)} ${l.city === "–" ? "" : `${tr(l.city)}, `}${tr(COUNTRY_NAMES[l.country] ?? l.country)}`],
    [t("Anbieter", "Seller"), `${tr(l.seller)} (${tr(l.sellerType)})`],
    [t("Online seit", "Online since"), t(`${date(l.listedAt)} · ${days === 1 ? "1 Tag" : `${days} Tagen`}`, `${date(l.listedAt)} · ${days === 1 ? "1 day" : `${days} days`}`)],
    ...(l.priceHistory && l.priceHistory.length > 1
      ? ([
          [
            t("Preisverlauf", "Price history"),
            <span className={cn("tabular-nums", isReduced(l) ? "text-up" : "text-muted")}>
              {l.priceHistory.map(([, p]) => num(p)).join(" → ")} {l.priceChange !== null && l.priceChange !== undefined && <span>({pct(l.priceChange, { digits: 0 })})</span>}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <BrandEmblem brandId={v.brandId} /> {variantTitle(v)} <span className="text-sm font-normal text-muted">· {l.year}</span>
        </span>
      }
      footer={
        <>
          <button
            className={cn("btn", watched && "btn-gold")}
            onClick={() => {
              toggleWatch(v.id);
              toast(
                watched
                  ? t(`${variantShortTitle(v)} von der Watchlist entfernt`, `${variantShortTitle(v)} removed from the watchlist`)
                  : t(`${variantShortTitle(v)} zur Watchlist hinzugefügt`, `${variantShortTitle(v)} added to the watchlist`),
                watched ? "info" : "success",
              );
            }}
          >
            <Star className="size-4" fill={watched ? "currentColor" : "none"} /> {watched ? t("Auf der Watchlist", "On the watchlist") : t("Zur Watchlist", "Add to watchlist")}
          </button>
          {!l.onRequest && <button
            className="btn"
            disabled={added}
            onClick={() => {
              addHolding({ variantId: v.id, purchasePrice: l.price, purchaseDate: AS_OF, mileage: l.mileage ?? 0, condition: l.condition, color: l.color, note: t(`Gekauft über Inserat ${l.id} (${l.seller})`, `Bought via listing ${l.id} (${tr(l.seller)})`) });
              setAdded(true);
              toast(t(`${variantShortTitle(v)} ins Portfolio übernommen`, `${variantShortTitle(v)} added to the portfolio`));
            }}
          >
            <Briefcase className="size-4" /> {added ? t("Im Portfolio", "In portfolio") : t("Als gekauft ins Portfolio", "Add to portfolio as bought")}
          </button>}
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-line">
          {l.images?.length ? (
            <>
              <div className="flex snap-x gap-1 overflow-x-auto">
                {l.images.map((src, k) => (
                  <ListingPhoto key={`${k}:${src}`} src={src} alt={`${l.title}, ${t("Foto", "photo")} ${k + 1}`} className="aspect-[4/3] h-56 shrink-0 snap-start" />
                ))}
              </div>
              <p className="px-3 py-1.5 text-[11px] text-faint">{t(`Fotos des inserierten Fahrzeugs, von ${l.source}.`, `Photos of the listed car, from ${l.source}.`)}</p>
            </>
          ) : (
            <NoPhoto className="aspect-video w-full" />
          )}
          {l.url && (
            <a href={safeUrl(l.url)} target="_blank" rel="noreferrer" className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-gold hover:bg-panel-3">
              {t(`Inserat bei ${l.source} ansehen und Anbieter kontaktieren`, `View the listing on ${l.source} and contact the seller`)} <ExternalLink className="size-4" />
            </a>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <dl className="space-y-1.5 text-sm md:col-span-3">
            {specs.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{val}</dd>
              </div>
            ))}
            {l.description && <p className="pt-1 text-xs text-muted italic">{t(`„${l.description}“`, `“${tr(l.description)}”`)}</p>}
          </dl>
          <div className="space-y-3 md:col-span-2">
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{t("Preisbewertung", "Price assessment")}</span>
                <Pill tone={d.tone}>{d.label}</Pill>
              </div>
              {l.onRequest ? (
                <p className="text-xs text-muted">
                  {t(
                    "Der Händler nennt keinen Preis. Den fairen Wert dieser Variante finden Sie in den Marktdaten.",
                    "The dealer states no price. The fair value of this variant is in the market data.",
                  )}
                </p>
              ) : e.deal === null ? (
                <p className="text-xs text-muted">
                  {t(
                    "Für diese Variante gibt es zu wenige belegte Auktionsergebnisse für einen Marktwert.",
                    "There are too few recorded auction results for this variant to give a market value.",
                  )}
                </p>
              ) : (
                <div className="space-y-1 text-xs">
                  <Row label={t("Marktwert Variante (Median)", "Variant market value (median)")} value={eur(e.value)} />
                  <Row
                    label={l.conditionUnknown ? t("Zustandsfaktor (Note 2 angenommen)", "Condition factor (grade 2 assumed)") : t(`Zustandsfaktor (Note ${l.condition})`, `Condition factor (grade ${l.condition})`)}
                    value={`× ${num(e.condFactor, 2)}`}
                  />
                  <Row label={t("Laufleistungsfaktor", "Mileage factor")} value={`× ${num(e.kmFactor, 2)}`} />
                  <Row label={t("Fairer Wert", "Fair value")} value={<Money value={e.fair} className="text-[16px]" />} />
                  <Row label={t("Angebotspreis", "Asking price")} value={<Money value={l.price} className="text-[16px]" />} />
                  <Row label={t("Abweichung", "Difference")} value={<Delta value={e.deal} />} />
                </div>
              )}
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              {v.measured && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted">{t("Marktwert 12 Monate", "Market value 12 months")}</span>
                    {lite ? <LockedValue reason="history" /> : <Delta value={m.change12m} />}
                  </div>
                  {!lite && <Sparkline values={spark} width={260} height={48} className="mt-1 w-full" />}
                </>
              )}
              <Link to={`/markt/${v.id}`} onClick={onClose} className="mt-1 inline-flex items-center gap-1 text-xs text-gold hover:underline">
                {t("Marktdaten öffnen", "Open market data")} <ExternalLink className="size-3" />
              </Link>
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold">{t("Ähnliche Angebote", "Similar listings")}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {similar.map((s) => {
                const sd = dealLabel(s.deal);
                return (
                  <button key={s.l.id} onClick={() => onOpen(s.l.id)} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-2 text-left hover:border-line-2 hover:bg-panel-3">
                    <ListingPhoto src={s.l.images?.[0]} alt={s.l.title} className="aspect-video w-28 shrink-0 rounded" small />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-muted">
                        {s.l.year} · {km(s.l.mileage)} · {flag(s.l.country)} {place(s.l)}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <AskPrice l={s.l} className="text-[15px]" />
                        <Pill tone={sd.tone} className="text-[10px]">
                          {s.deal === null ? "–" : pct(s.deal)}
                        </Pill>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Dropdown with every model, grouped by family, each with its number of listings under the current filters. */
function ModelMenu({
  models: list,
  counts,
  total,
  value,
  label,
  onPick,
}: {
  models: Model[];
  counts: Map<string, number>;
  total: number;
  value: string;
  label: (m: Model) => string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = list.find((m) => m.id === value);
  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };
  const row = (active: boolean, n: number) =>
    cn("flex w-full items-baseline justify-between gap-3 rounded-[2px] px-2 py-1 text-left text-[14px] transition-colors", active ? "bg-ink text-bg" : n === 0 ? "text-faint hover:bg-panel-2" : "text-ink hover:bg-panel-2");
  return (
    <div ref={ref} className="relative">
      <button className={cn(barSelect, "inline-flex items-center gap-1.5")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="true">
        {current ? label(current) : t("Alle Modelle", "All models")}
        <ChevronDown className={cn("size-3.5 text-muted transition-transform", open && "rotate-180")} strokeWidth={1.5} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-4 w-[min(640px,calc(100vw-48px))] rounded-[3px] border border-line bg-bg p-4 shadow-lg">
          <button className={cn(row(!value, total), "mb-3 w-auto")} onClick={() => pick("")}>
            {t("Alle Modelle", "All models")} <span className={cn("tabular-nums text-[12px]", !value ? "text-bg/70" : "text-faint")}>{num(total)}</span>
          </button>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {MODEL_CATEGORIES.map((c) => {
              const family = list.filter((m) => m.category === c.id);
              if (family.length === 0) return null;
              return (
                <div key={c.id}>
                  <div className="mb-1 px-2 text-[11px] font-medium tracking-[0.08em] text-muted uppercase">{c.label}</div>
                  {family.map((m) => {
                    const n = counts.get(m.id) ?? 0;
                    const active = value === m.id;
                    return (
                      <button key={m.id} className={row(active, n)} onClick={() => pick(active ? "" : m.id)}>
                        <span className="truncate">{label(m)}</span>
                        <span className={cn("tabular-nums text-[12px]", active ? "text-bg/70" : "text-faint")}>{num(n)}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function SourceBar({
  live,
  preferLive,
  setPreferLive,
  sourceLabel,
}: {
  live: ReturnType<typeof useLiveListings>;
  preferLive: boolean;
  setPreferLive: (v: boolean) => void;
  sourceLabel: string;
}) {
  if (live.status === "checking") return null;
  if (live.status === "off") {
    return (
      <p className="mt-3 text-[12px] text-faint">
        {sourceLabel} · {t("täglich aktualisiert", "updated daily")}
      </p>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex rounded-md border border-line p-0.5">
        <button className={cn("rounded px-2 py-0.5", preferLive ? "bg-gold/20 text-gold-2" : "text-muted")} onClick={() => setPreferLive(true)}>
          mobile.de live
        </button>
        <button className={cn("rounded px-2 py-0.5", !preferLive ? "bg-gold/20 text-gold-2" : "text-muted")} onClick={() => setPreferLive(false)}>
          {t("Karero und Janzen Klassik", "Karero and Janzen Klassik")}
        </button>
      </span>
      {live.status === "loading" && (
        <span className="inline-flex items-center gap-1 text-muted">
          <Loader2 className="size-3.5 animate-spin" /> {t(`lade mobile.de … ${live.listings.length} zugeordnet`, `loading mobile.de … ${live.listings.length} matched`)}
        </span>
      )}
      {live.status === "ready" && (
        <span className="text-muted">
          {t(`${live.listings.length} Inserate den Varianten zugeordnet`, `${live.listings.length} listings matched to variants`)}
          {live.loadedAt ? ` · ${t("Stand", "as of")} ${new Date(live.loadedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      )}
      {live.error && <span className="text-down">{live.error}</span>}
      {(live.status === "ready" || live.status === "error") && (
        <button className="inline-flex items-center gap-1 text-gold hover:underline" onClick={live.refresh}>
          <RefreshCw className="size-3" /> {t("aktualisieren", "refresh")}
        </button>
      )}
    </div>
  );
}
