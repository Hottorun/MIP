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
};

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
  return out;
}

export function search(query: string, limit = 9): SearchHit[] {
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

  // Auction / transaction IDs ("RMS-25-0412") and VINs (FIN) – exact-prefix lookups.
  const raw = query.trim().toUpperCase();
  if (raw.length >= 5 && /[0-9]/.test(raw)) {
    for (const s of getAllSales()) {
      if (hits.length >= limit + 4) break;
      if (s.id.startsWith(raw)) {
        const v = variantById.get(s.variantId)!;
        hits.push({ kind: KIND.auction, label: `${s.id} · ${variantTitle(v)}`, detail: `${s.house} · ${s.price ? eur(s.price) : t("nicht verkauft", "not sold")}`, href: `/auktionen?q=${encodeURIComponent(s.id)}` });
      } else if (s.vin.startsWith(raw)) {
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
