import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Briefcase, ExternalLink, Heart, Loader2, Mail, RefreshCw, Search, Star, X } from "lucide-react";
import { brandById, brands, models, variantById, variantShortTitle, variantTitle, yearsLabel } from "../data/db";
import { AS_OF, CONDITION_FACTOR, CONDITION_SCORE, COUNTRY_NAMES, DAY, getAllListings, getSeries } from "../data/generate";
import { useLiveListings } from "../state/liveListings";
import { getMetrics } from "../data/market";
import type { Condition, Listing, Variant } from "../data/types";
import { cn, date, eur, flag, km, num, pct } from "../lib/format";
import { useStore } from "../state/store";
import { type Scene } from "../components/CarArt";
import { CarImage } from "../components/CarImage";
import { BrandEmblem, Delta, Empty, Modal, Pill, Sparkline, Money } from "../components/ui";

type SortKey = "deal" | "priceAsc" | "priceDesc" | "newest" | "mileage";
type SellerFilter = "" | Listing["sellerType"];

const SCENES: Scene[] = ["mountain", "studio", "sunset", "city", "track"];
const CONDITIONS: Condition[] = ["1", "1-", "2+", "2", "2-", "3"];
const PAGE = 24;
const filterSelect = "border-b border-line-2 pb-1 focus:border-ink focus:outline-none";
const filterInput = "border-b border-line-2 bg-transparent pb-1 placeholder:text-faint focus:border-ink focus:outline-none";

type Enriched = { l: Listing; v: Variant; value: number; condFactor: number; kmFactor: number; fair: number; deal: number; scene: Scene };

function mileageAdjustment(v: Variant, l: Listing) {
  const age = Math.max(1, new Date(AS_OF).getUTCFullYear() - l.year);
  const perYear = v.tags.includes("Leichtbau") || v.value > 1_000_000 ? 2500 : v.value > 250_000 ? 3500 : 6500;
  const typical = age * perYear;
  return Math.min(1.08, Math.max(0.88, 1 + 0.06 * (1 - l.mileage / typical)));
}

function enrich(list: Listing[]): Enriched[] {
  return list.map((l, i) => {
    const v = variantById.get(l.variantId)!;
    const value = getMetrics(v.id).value;
    const condFactor = CONDITION_FACTOR[l.condition];
    const kmFactor = mileageAdjustment(v, l);
    const fair = value * condFactor * kmFactor;
    return { l, v, value, condFactor, kmFactor, fair, deal: l.price / fair - 1, scene: SCENES[i % SCENES.length] };
  });
}

function dealLabel(deal: number): { label: string; tone: "up" | "neutral" | "down" } {
  if (deal < -0.07) return { label: "Unter Marktwert", tone: "up" };
  if (deal > 0.07) return { label: "Über Marktwert", tone: "down" };
  return { label: "Fairer Preis", tone: "neutral" };
}

export default function Buy() {
  const [params, setParams] = useSearchParams();
  const { savedListings, toggleSavedListing } = useStore();
  const variantParam = params.get("variant");
  const variantFilter = variantParam ? variantById.get(variantParam) : undefined;
  const selectedId = params.get("inserat");

  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [seller, setSeller] = useState<SellerFilter>("");
  const [minCondition, setMinCondition] = useState<Condition | "">("");
  const [matchingOnly, setMatchingOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [text, setText] = useState("");
  const [sort, setSort] = useState<SortKey>("deal");
  const [visible, setVisible] = useState(PAGE);
  const [moreFilters, setMoreFilters] = useState(false);

  const live = useLiveListings();
  const [preferLive, setPreferLive] = useState(true);
  const liveAvailable = live.listings.length > 0;
  const showingLive = preferLive && liveAvailable;
  const source = showingLive ? live.listings : getAllListings();
  const all = useMemo(() => enrich(source), [source]);
  const brandModels = models.filter((m) => !brand || m.brandId === brand);

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase();
    const pMin = Number(priceMin) || 0;
    const pMax = Number(priceMax) || Infinity;
    const yFrom = Number(yearFrom) || 0;
    const yTo = Number(yearTo) || Infinity;
    const kMax = Number(maxKm) || Infinity;
    const saved = new Set(savedListings);
    const out = all.filter(({ l, v }) => {
      if (variantFilter && v.id !== variantFilter.id) return false;
      if (brand && v.brandId !== brand) return false;
      if (model && v.modelId !== model) return false;
      if (l.price < pMin || l.price > pMax) return false;
      if (l.year < yFrom || l.year > yTo) return false;
      if (l.mileage > kMax) return false;
      if (seller && l.sellerType !== seller) return false;
      if (minCondition && CONDITION_SCORE[l.condition] > CONDITION_SCORE[minCondition]) return false;
      if (matchingOnly && !l.matchingNumbers) return false;
      if (savedOnly && !saved.has(l.id)) return false;
      if (t) {
        const hay = `${variantTitle(v)} ${l.id} ${l.vin} ${l.city} ${l.seller} ${l.color}`.toLowerCase();
        if (!t.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const cmp: Record<SortKey, (a: Enriched, b: Enriched) => number> = {
      deal: (a, b) => a.deal - b.deal,
      priceAsc: (a, b) => a.l.price - b.l.price,
      priceDesc: (a, b) => b.l.price - a.l.price,
      newest: (a, b) => b.l.listedAt - a.l.listedAt,
      mileage: (a, b) => a.l.mileage - b.l.mileage,
    };
    return out.sort(cmp[sort]);
  }, [all, variantFilter, brand, model, priceMin, priceMax, yearFrom, yearTo, maxKm, seller, minCondition, matchingOnly, savedOnly, savedListings, text, sort]);

  useEffect(() => setVisible(PAGE), [variantParam, brand, model, priceMin, priceMax, yearFrom, yearTo, maxKm, seller, minCondition, matchingOnly, savedOnly, text, sort]);

  const selected = selectedId ? all.find((e) => e.l.id === selectedId) : undefined;
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
  const reset = () => {
    setBrand("");
    setModel("");
    setPriceMin("");
    setPriceMax("");
    setYearFrom("");
    setYearTo("");
    setMaxKm("");
    setSeller("");
    setMinCondition("");
    setMatchingOnly(false);
    setSavedOnly(false);
    setText("");
    if (variantParam) clearVariant();
  };

  const topDeals = filtered.filter((e) => e.deal < -0.07).length;
  const digits = (s: string) => s.replace(/\D/g, "");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[44px] leading-tight sm:text-[52px]">Kaufen</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-muted">
            {num(all.length)} {showingLive ? "Inserate live von mobile.de" : "Demo-Inserate"}, jeweils verglichen mit dem fairen Marktwert für Zustand und Laufleistung.
          </p>
          <SourceBar live={live} preferLive={preferLive} setPreferLive={setPreferLive} />
        </div>
        <label className="flex items-center gap-2 text-[14px] text-muted">
          Sortiert nach
          <select className="border-b border-line-2 pb-1 text-ink focus:border-ink focus:outline-none" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="deal">Bester Preis zum Marktwert</option>
            <option value="priceAsc">Preis aufsteigend</option>
            <option value="priceDesc">Preis absteigend</option>
            <option value="newest">Neueste zuerst</option>
            <option value="mileage">Laufleistung</option>
          </select>
        </label>
      </div>

      <div className="space-y-4 border-y border-line py-5 text-[14px]">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex w-72 items-center gap-2 border-b border-line-2 pb-1 focus-within:border-ink">
            <Search className="size-4 text-muted" strokeWidth={1.5} />
            <input className="min-w-0 flex-1 bg-transparent focus:outline-none" value={text} onChange={(e) => setText(e.target.value)} placeholder="Modell, Stadt, Händler oder FIN" aria-label="Inserate durchsuchen" />
          </div>
          {brands.length > 1 && (
            <select
              className={filterSelect}
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel("");
              }}
              aria-label="Marke"
            >
              <option value="">Alle Marken</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          <select className={filterSelect} value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modell">
            <option value="">Alle Modelle</option>
            {brandModels.map((m) => (
              <option key={m.id} value={m.id}>
                {brand || brands.length === 1 ? m.name : `${brandById.get(m.brandId)!.name} ${m.name}`}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input className={cn(filterInput, "w-24")} inputMode="numeric" placeholder="Preis ab €" value={priceMin} onChange={(e) => setPriceMin(digits(e.target.value))} aria-label="Preis ab" />
            <span className="text-faint">bis</span>
            <input className={cn(filterInput, "w-24")} inputMode="numeric" placeholder="€" value={priceMax} onChange={(e) => setPriceMax(digits(e.target.value))} aria-label="Preis bis" />
          </div>
          <button className="text-muted underline-offset-4 hover:text-ink hover:underline" onClick={() => setMoreFilters((m) => !m)} aria-expanded={moreFilters}>
            {moreFilters ? "Weniger Filter" : "Weitere Filter"}
          </button>
        </div>
        {moreFilters && (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
            <div className="flex items-center gap-2">
              <input className={cn(filterInput, "w-20")} inputMode="numeric" placeholder="Baujahr" value={yearFrom} onChange={(e) => setYearFrom(digits(e.target.value).slice(0, 4))} aria-label="Baujahr ab" />
              <span className="text-faint">bis</span>
              <input className={cn(filterInput, "w-20")} inputMode="numeric" placeholder="Baujahr" value={yearTo} onChange={(e) => setYearTo(digits(e.target.value).slice(0, 4))} aria-label="Baujahr bis" />
            </div>
            <input className={cn(filterInput, "w-36")} inputMode="numeric" placeholder="Max. Laufleistung km" value={maxKm} onChange={(e) => setMaxKm(digits(e.target.value))} aria-label="Maximale Laufleistung" />
            <select className={filterSelect} value={seller} onChange={(e) => setSeller(e.target.value as SellerFilter)} aria-label="Verkäufer">
              <option value="">Alle Verkäufer</option>
              <option value="Händler">Händler</option>
              <option value="Privat">Privat</option>
              <option value="Auktion">Auktion</option>
            </select>
            <select className={filterSelect} value={minCondition} onChange={(e) => setMinCondition(e.target.value as Condition | "")} aria-label="Mindestzustand">
              <option value="">Jeder Zustand</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  mindestens Note {c}
                </option>
              ))}
            </select>
            <button className={cn("chip", matchingOnly && "chip-active")} onClick={() => setMatchingOnly((m) => !m)}>
              Nur Matching Numbers
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className={cn("chip", savedOnly && "chip-active")} onClick={() => setSavedOnly((m) => !m)}>
            <Heart className="size-3.5" strokeWidth={1.5} /> Gemerkt ({savedListings.length})
          </button>
          {variantFilter && (
            <span className="chip chip-active">
              {variantTitle(variantFilter)}
              <button onClick={clearVariant} aria-label="Variantenfilter entfernen">
                <X className="size-3" />
              </button>
            </span>
          )}
          <span className="ml-auto text-[13px] text-muted">
            {num(filtered.length)} Inserate, davon {num(topDeals)} deutlich unter Marktwert
          </span>
          <button className="text-[13px] text-muted hover:text-ink" onClick={reset}>
            Filter zurücksetzen
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>Keine Inserate für diese Filter. {savedOnly && "Merke dir Inserate über das Herz-Symbol."}</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, visible).map((e) => (
            <ListingCard key={e.l.id} e={e} saved={savedListings.includes(e.l.id)} onSave={() => toggleSavedListing(e.l.id)} onOpen={() => openListing(e.l.id)} />
          ))}
        </div>
      )}
      {visible < filtered.length && (
        <div className="flex justify-center">
          <button className="btn" onClick={() => setVisible((n) => n + PAGE)}>
            Mehr laden ({num(filtered.length - visible)} weitere)
          </button>
        </div>
      )}

      {selected && <ListingModal e={selected} all={all} onClose={() => openListing(null)} onOpen={openListing} />}
      {selectedId && !selected && (
        <Modal open onClose={() => openListing(null)} title="Inserat nicht gefunden">
          <p className="text-sm text-muted">Das Inserat {selectedId} ist nicht mehr aktiv.</p>
        </Modal>
      )}
    </div>
  );
}

function ListingCard({ e, saved, onSave, onOpen }: { e: Enriched; saved: boolean; onSave: () => void; onOpen: () => void }) {
  const { l, v } = e;
  const d = dealLabel(e.deal);
  return (
    <article className="group cursor-pointer" onClick={onOpen}>
      <div className="relative aspect-video overflow-hidden bg-panel-3">
        {l.images?.[0] ? (
          <img src={l.images[0]} alt={l.title} loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" />
        ) : (
          <CarImage variant={v} fallbackColor={l.colorHex} scene={e.scene} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.02]" label={l.title} />
        )}
        {l.source === "mobile.de" && <span className="absolute bottom-3 left-3 rounded-full bg-bg/90 px-2 py-0.5 text-[11px] text-ink">mobile.de</span>}
        <button
          onClick={(ev) => {
            ev.stopPropagation();
            onSave();
          }}
          className={cn("absolute top-3 right-3 rounded-full bg-bg/85 p-2 text-ink transition-opacity focus-visible:opacity-100", saved ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          aria-label={saved ? "Nicht mehr merken" : "Inserat merken"}
          aria-pressed={saved}
        >
          <Heart className="size-4" strokeWidth={1.5} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate font-serif text-[16.5px] group-hover:underline group-hover:decoration-line-2 group-hover:underline-offset-4">{variantTitle(v, { brand: false })}</span>
        <Money value={l.price} className="shrink-0 text-[16.5px]" />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate text-muted">
          {l.year}, {km(l.mileage)}, {l.city}
        </span>
        <span className={cn("shrink-0", d.tone === "up" ? "text-up" : d.tone === "down" ? "text-down" : "text-muted")}>{d.label}</span>
      </div>
    </article>
  );
}

function ListingModal({ e, all, onClose, onOpen }: { e: Enriched; all: Enriched[]; onClose: () => void; onOpen: (id: string) => void }) {
  const { l, v } = e;
  const { watchlist, toggleWatch, addHolding, toast } = useStore();
  const [inquiry, setInquiry] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", message: `Guten Tag, ich interessiere mich für Ihr Inserat ${l.id} (${l.title}, ${l.year}). Ist das Fahrzeug noch verfügbar?` });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [added, setAdded] = useState(false);
  const d = dealLabel(e.deal);
  const watched = watchlist.includes(v.id);
  const m = getMetrics(v.id);
  const spark = getSeries(v.id).slice(-52).map((p) => p.value);
  const similar = all
    .filter((o) => o.v.id === v.id && o.l.id !== l.id)
    .sort((a, b) => a.deal - b.deal)
    .slice(0, 4);

  useEffect(() => {
    setInquiry(false);
    setErrors({});
    setAdded(false);
  }, [l.id]);

  const submit = () => {
    const errs: Record<string, string> = {};
    if (form.name.trim().length < 2) errs.name = "Bitte Namen angeben";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Bitte gültige E-Mail angeben";
    if (form.message.trim().length < 10) errs.message = "Nachricht zu kurz";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    toast(`Anfrage an ${l.seller} gesendet`);
    setInquiry(false);
  };

  const specs: [string, React.ReactNode][] = [
    ["Inserat-ID", <span className="font-mono">{l.id}</span>],
    ["FIN", <span className="font-mono">{l.vin}</span>],
    ...(l.source === "mobile.de"
      ? ([
          ["Vorbesitzer", l.previousOwners ?? "k. A."],
          ["Unfallschaden", l.accidentDamaged === null || l.accidentDamaged === undefined ? "k. A." : l.accidentDamaged ? <span className="text-warn">Ja</span> : "Nein"],
        ] as [string, React.ReactNode][])
      : []),
    ["Baujahr", `${l.year} (Bauzeit ${yearsLabel(v.years)})`],
    ["Laufleistung", km(l.mileage)],
    ["Zustand", l.conditionUnknown ? "k. A. (Bewertung nimmt Note 2 an)" : `Note ${l.condition}`],
    ["Farbe", <span className="inline-flex items-center gap-1.5"><span className="inline-block size-3 rounded-full border border-white/20" style={{ background: l.colorHex }} />{l.color}</span>],
    ["Karosserie", l.body],
    ["Getriebe", l.gearbox === "Manual" ? "Schaltgetriebe" : "Automatik"],
    ["Leistung", `${l.powerPs ?? v.hp} PS · ${num(v.liters, 1)} l`],
    ["Matching Numbers", l.source === "mobile.de" ? "k. A." : l.matchingNumbers ? "Ja" : <span className="text-warn">Nein</span>],
    ["Servicehistorie", l.serviceHistory ? "Lückenlos" : <span className="text-warn">Unvollständig</span>],
    ["Standort", `${flag(l.country)} ${l.city}, ${COUNTRY_NAMES[l.country] ?? l.country}`],
    ["Anbieter", `${l.seller} (${l.sellerType})`],
    ["Inseriert", `${date(l.listedAt)} · seit ${Math.max(1, Math.round((AS_OF - l.listedAt) / DAY))} Tagen`],
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
              toast(watched ? `${variantShortTitle(v)} von der Watchlist entfernt` : `${variantShortTitle(v)} zur Watchlist hinzugefügt`, watched ? "info" : "success");
            }}
          >
            <Star className="size-4" fill={watched ? "currentColor" : "none"} /> {watched ? "Auf der Watchlist" : "Zur Watchlist"}
          </button>
          <button
            className="btn"
            disabled={added}
            onClick={() => {
              addHolding({ variantId: v.id, purchasePrice: l.price, purchaseDate: AS_OF, mileage: l.mileage, condition: l.condition, color: l.color, note: `Gekauft über Inserat ${l.id} (${l.seller})` });
              setAdded(true);
              toast(`${variantShortTitle(v)} ins Portfolio übernommen`);
            }}
          >
            <Briefcase className="size-4" /> {added ? "Im Portfolio" : "Als gekauft ins Portfolio"}
          </button>
          <button className="btn btn-gold" hidden={Boolean(l.url)} onClick={() => setInquiry((i) => !i)}>
            <Mail className="size-4" /> Anfrage senden
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-lg border border-line">
          {l.images?.length ? (
            <div className="flex snap-x gap-1 overflow-x-auto">
              {l.images.map((src) => (
                <img key={src} src={src} alt={l.title} className="aspect-[4/3] h-56 shrink-0 snap-start object-cover" />
              ))}
            </div>
          ) : (
            <>
              <CarImage variant={v} fallbackColor={l.colorHex} scene={e.scene} className="aspect-video w-full" label={l.title} credit />
              {(v.marketPhotos.length > 0 || v.photos.length > 0) && <p className="px-3 py-1.5 text-[11px] text-faint">Symbolfoto des Modells – das inserierte Fahrzeug ist {l.color}.</p>}
            </>
          )}
          {l.url && (
            <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center justify-between border-t border-line px-3 py-2 text-sm text-gold hover:bg-panel-3">
              Inserat bei mobile.de ansehen und Anbieter kontaktieren <ExternalLink className="size-4" />
            </a>
          )}
        </div>

        {inquiry && (
          <div className="animate-fade-in space-y-2 rounded-lg border border-gold/40 bg-gold/5 p-3">
            <div className="text-sm font-semibold">Anfrage an {l.seller}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <input className="input" placeholder="Name" value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
                {errors.name && <div className="mt-0.5 text-xs text-down">{errors.name}</div>}
              </div>
              <div>
                <input className="input" placeholder="E-Mail" type="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} />
                {errors.email && <div className="mt-0.5 text-xs text-down">{errors.email}</div>}
              </div>
            </div>
            <textarea className="input min-h-20" value={form.message} onChange={(ev) => setForm({ ...form, message: ev.target.value })} />
            {errors.message && <div className="text-xs text-down">{errors.message}</div>}
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost" onClick={() => setInquiry(false)}>
                Abbrechen
              </button>
              <button className="btn btn-gold" onClick={submit}>
                Senden
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          <dl className="space-y-1.5 text-sm md:col-span-3">
            {specs.map(([k, val]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{val}</dd>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted italic">„{l.description}“</p>
          </dl>
          <div className="space-y-3 md:col-span-2">
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Preisbewertung</span>
                <Pill tone={d.tone}>{d.label}</Pill>
              </div>
              <div className="space-y-1 text-xs">
                <Row label="Marktwert Variante (Median)" value={eur(e.value)} />
                <Row label={`Zustandsfaktor (Note ${l.condition})`} value={`× ${num(e.condFactor, 2)}`} />
                <Row label="Laufleistungsfaktor" value={`× ${num(e.kmFactor, 2)}`} />
                <Row label="Fairer Wert" value={<Money value={e.fair} className="text-[16px]" />} />
                <Row label="Angebotspreis" value={<Money value={l.price} className="text-[16px]" />} />
                <Row label="Abweichung" value={<Delta value={e.deal} />} />
              </div>
            </div>
            <div className="rounded-lg border border-line bg-panel-2 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Marktwert 12 Monate</span>
                <Delta value={m.change12m} />
              </div>
              <Sparkline values={spark} width={260} height={48} className="mt-1 w-full" />
              <Link to={`/markt/${v.id}`} onClick={onClose} className="mt-1 inline-flex items-center gap-1 text-xs text-gold hover:underline">
                Marktdaten öffnen <ExternalLink className="size-3" />
              </Link>
            </div>
          </div>
        </div>

        {similar.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-semibold">Ähnliche Angebote</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {similar.map((s) => {
                const sd = dealLabel(s.deal);
                return (
                  <button key={s.l.id} onClick={() => onOpen(s.l.id)} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 p-2 text-left hover:border-line-2 hover:bg-panel-3">
                    <CarImage variant={s.v} fallbackColor={s.l.colorHex} scene={s.scene} className="aspect-video w-28 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs text-muted">
                        {s.l.year} · {km(s.l.mileage)} · {flag(s.l.country)} {s.l.city}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Money value={s.l.price} className="text-[15px]" />
                        <Pill tone={sd.tone} className="text-[10px]">
                          {pct(s.deal)}
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
}: {
  live: ReturnType<typeof useLiveListings>;
  preferLive: boolean;
  setPreferLive: (v: boolean) => void;
}) {
  if (live.status === "checking") return null;
  if (live.status === "off") {
    return (
      <p className="mt-1 text-xs text-faint">
        Demo-Inserate. Für echte Angebote mobile.de-API-Zugang in <code>.env</code> eintragen (<code>MOBILEDE_USERNAME</code>, <code>MOBILEDE_PASSWORD</code>) und
        neu starten.
      </p>
    );
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex rounded-md border border-line p-0.5">
        <button className={cn("rounded px-2 py-0.5", preferLive ? "bg-gold/20 text-gold-2" : "text-muted")} onClick={() => setPreferLive(true)}>
          mobile.de live
        </button>
        <button className={cn("rounded px-2 py-0.5", !preferLive ? "bg-gold/20 text-gold-2" : "text-muted")} onClick={() => setPreferLive(false)}>
          Demo
        </button>
      </span>
      {live.status === "loading" && (
        <span className="inline-flex items-center gap-1 text-muted">
          <Loader2 className="size-3.5 animate-spin" /> lade mobile.de … {live.listings.length} zugeordnet
        </span>
      )}
      {live.status === "ready" && (
        <span className="text-muted">
          {live.listings.length} Inserate den Varianten zugeordnet{live.loadedAt ? ` · Stand ${new Date(live.loadedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </span>
      )}
      {live.error && <span className="text-down">{live.error}</span>}
      {(live.status === "ready" || live.status === "error") && (
        <button className="inline-flex items-center gap-1 text-gold hover:underline" onClick={live.refresh}>
          <RefreshCw className="size-3" /> aktualisieren
        </button>
      )}
    </div>
  );
}
