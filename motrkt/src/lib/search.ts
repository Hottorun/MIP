import { brands, generations, genName, modelById, modelName, models, variantById, variantTitle, variants, yearsLabel } from "../data/db";
import { tr } from "../i18n/terms";
import { getAllListings, getAllSales } from "../data/generate";
import { eur } from "./format";
import { getLang, t } from "../i18n";

export type SearchHit = { kind: string; label: string; detail: string; href: string };

const KIND = {
  get brand() { return t("Marke", "Brand"); },
  get model() { return t("Modell", "Model"); },
  get generation() { return "Generation"; },
  get variant() { return t("Variante", "Variant"); },
  get auction() { return t("Auktion", "Auction"); },
  get listing() { return t("Inserat", "Listing"); },
  get vin() { return t("FIN", "VIN"); },
  get topic() { return t("Forum", "Forum"); },
  get dealer() { return t("Händler", "Dealer"); },
  get house() { return t("Auktionshaus", "Auction house"); },
};

type TopicHit = { id: string; variant: string; title: string; username: string };
let topics: TopicHit[] = [];
let topicsAt = 0;
/** Fetches the latest forum topics for the search (once a minute at most); call when the search opens. `onReady` fires when new topics arrived. */
export function prepareSearch(onReady?: () => void) {
  if (Date.now() - topicsAt < 60_000) return;
  topicsAt = Date.now();
  fetch("/api/forum/neueste?limit=200", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { topics?: TopicHit[] } | null) => {
      if (j?.topics) {
        topics = j.topics;
        onReady?.();
      }
    })
    .catch(() => {});
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry = SearchHit & { text: string };
let index: Entry[] | null = null;
let indexLang = getLang();

function buildIndex(): Entry[] {
  const out: Entry[] = [];
  for (const b of brands) out.push({ kind: KIND.brand, label: b.name, detail: KIND.brand, href: `/modelle?marke=${b.id}`, text: norm(b.name) });
  for (const m of models) {
    const brand = brands.find((b) => b.id === m.brandId)!;
    out.push({ kind: KIND.model, label: `${brand.name} ${modelName(m)}`, detail: t(`${m.generationIds.length} Generation(en)`, `${m.generationIds.length} generation(s)`), href: `/modelle?modell=${m.id}`, text: norm(`${brand.name} ${m.name}`) });
  }
  for (const g of generations) {
    const m = modelById.get(g.modelId)!;
    if (g.name === m.name) continue;
    const brand = brands.find((b) => b.id === m.brandId)!;
    out.push({ kind: KIND.generation, label: `${brand.name} ${modelName(m)} (${genName(g)})`, detail: yearsLabel(g.years), href: `/markt/${g.variantIds[0]}`, text: norm(`${brand.name} ${m.name} ${g.name} ${genName(g)}`) });
  }
  for (const v of variants) {
    const title = variantTitle(v);
    out.push({ kind: KIND.variant, label: title, detail: yearsLabel(v.years), href: `/markt/${v.id}`, text: norm(`${title} ${v.name} ${v.tags.join(" ")}`) });
  }
  // Dealers with cars for sale (their listings on Buy) and auction houses (their results on Auctions)
  const dealers = new Map<string, number>();
  const platforms = new Set(["Classic Trader", "mobile.de"]); // marketplaces, not dealers (a dealer's own site is its name)
  for (const l of getAllListings()) if (l.sellerType === "Händler" && !platforms.has(l.seller)) dealers.set(l.seller, (dealers.get(l.seller) ?? 0) + 1);
  for (const [name, n] of dealers) {
    out.push({ kind: KIND.dealer, label: name, detail: t(`${n} Inserat${n === 1 ? "" : "e"}`, `${n} listing${n === 1 ? "" : "s"}`), href: `/kaufen?suche=${encodeURIComponent(name)}`, text: norm(name) });
  }
  const houses = new Map<string, number>();
  for (const s of getAllSales()) houses.set(s.house, (houses.get(s.house) ?? 0) + 1);
  for (const [name, n] of houses) {
    out.push({ kind: KIND.house, label: name, detail: t(`${n} Auktionsergebnisse`, `${n} auction results`), href: `/auktionen?haus=${encodeURIComponent(name)}`, text: norm(name) });
  }
  return out;
}

/** `lite`: no hammer prices in the hits (the auction archive is premium, src/lib/plan.tsx). */
export function search(query: string, limit = 9, lite = false): SearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  if (!index || indexLang !== getLang()) {
    index = buildIndex();
    indexLang = getLang();
  }
  const terms = q.split(" ");
  const scored: [number, Entry][] = [];
  for (const e of index) {
    if (!terms.every((t) => e.text.includes(t))) continue;
    const score = (e.text.startsWith(q) ? 0 : 10) + e.text.length / 100 + (e.kind === KIND.variant ? 1 : 0);
    scored.push([score, e]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  const hits: SearchHit[] = scored.slice(0, limit).map(([, e]) => e);

  // Forum topics by title, listings by title, seller or city (three letters or more)
  if (q.length >= 3) {
    for (const x of topics) {
      if (hits.length >= limit + 3) break;
      if (!terms.every((w) => norm(x.title).includes(w))) continue;
      const v = variantById.get(x.variant);
      hits.push({ kind: KIND.topic, label: x.title, detail: `${v ? variantTitle(v) : x.variant} · ${x.username}`, href: `/markt/${x.variant}?thema=${x.id}#forum` });
    }
    let n = 0;
    for (const l of getAllListings()) {
      if (n >= 4) break;
      const hay = norm(`${l.title} ${l.seller} ${l.city}`);
      if (!terms.every((w) => hay.includes(w))) continue;
      n++;
      hits.push({ kind: KIND.listing, label: `${l.title} (${l.year})`, detail: `${eur(l.price)} · ${l.seller}`, href: `/kaufen?inserat=${l.id}` });
    }
  }

  // Auction / transaction IDs ("RMS-25-0412") and VINs (FIN) – exact-prefix lookups.
  const raw = query.trim().toUpperCase();
  if (raw.length >= 5 && /[0-9]/.test(raw)) {
    for (const s of getAllSales()) {
      if (hits.length >= limit + 4) break;
      if (s.id.startsWith(raw)) {
        const v = variantById.get(s.variantId)!;
        hits.push({ kind: KIND.auction, label: `${s.id} · ${variantTitle(v)}`, detail: lite ? s.house : `${s.house} · ${s.price ? eur(s.price) : t("nicht verkauft", "not sold")}`, href: `/auktionen?q=${encodeURIComponent(s.id)}` });
      } else if (s.vin.startsWith(raw) && !hits.some((h) => h.kind === KIND.vin && h.label === s.vin)) {
        // a car sold more than once: one VIN hit is enough (the auction search lists all its sales)
        const v = variantById.get(s.variantId)!;
        hits.push({ kind: KIND.vin, label: `${s.vin}`, detail: `${variantTitle(v)} · ${t("Verkauf", "Sale")} ${s.id}`, href: `/auktionen?q=${encodeURIComponent(s.vin)}` });
      }
    }
    for (const l of getAllListings()) {
      if (hits.length >= limit + 6) break;
      if (l.id.toUpperCase().startsWith(raw) || l.vin.startsWith(raw)) {
        hits.push({ kind: KIND.listing, label: `${l.id} · ${l.title}`, detail: `${eur(l.price)} · ${tr(l.city)}`, href: `/kaufen?inserat=${l.id}` });
      }
    }
  }
  return hits;
}
