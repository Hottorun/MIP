import { brands, generations, modelById, models, variantById, variantTitle, variants, yearsLabel } from "../data/db";
import { getAllListings, getAllSales } from "../data/generate";
import { eur } from "./format";

export type SearchHit = { kind: "Marke" | "Modell" | "Generation" | "Variante" | "Auktion" | "Inserat" | "FIN"; label: string; detail: string; href: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Entry = SearchHit & { text: string };
let index: Entry[] | null = null;

function buildIndex(): Entry[] {
  const out: Entry[] = [];
  for (const b of brands) out.push({ kind: "Marke", label: b.name, detail: "Marke", href: `/modelle?marke=${b.id}`, text: norm(b.name) });
  for (const m of models) {
    const brand = brands.find((b) => b.id === m.brandId)!;
    out.push({ kind: "Modell", label: `${brand.name} ${m.name}`, detail: `${m.generationIds.length} Generation(en)`, href: `/modelle?modell=${m.id}`, text: norm(`${brand.name} ${m.name}`) });
  }
  for (const g of generations) {
    const m = modelById.get(g.modelId)!;
    if (g.name === m.name) continue;
    const brand = brands.find((b) => b.id === m.brandId)!;
    out.push({ kind: "Generation", label: `${brand.name} ${m.name} (${g.name})`, detail: yearsLabel(g.years), href: `/markt/${g.variantIds[0]}`, text: norm(`${brand.name} ${m.name} ${g.name}`) });
  }
  for (const v of variants) {
    const title = variantTitle(v);
    out.push({ kind: "Variante", label: title, detail: yearsLabel(v.years), href: `/markt/${v.id}`, text: norm(`${title} ${v.tags.join(" ")}`) });
  }
  return out;
}

export function search(query: string, limit = 9): SearchHit[] {
  const q = norm(query);
  if (q.length < 2) return [];
  index ??= buildIndex();
  const terms = q.split(" ");
  const scored: [number, Entry][] = [];
  for (const e of index) {
    if (!terms.every((t) => e.text.includes(t))) continue;
    const score = (e.text.startsWith(q) ? 0 : 10) + e.text.length / 100 + (e.kind === "Variante" ? 1 : 0);
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
        hits.push({ kind: "Auktion", label: `${s.id} · ${variantTitle(v)}`, detail: `${s.house} · ${s.price ? eur(s.price) : "nicht verkauft"}`, href: `/auktionen?q=${encodeURIComponent(s.id)}` });
      } else if (s.vin.startsWith(raw)) {
        const v = variantById.get(s.variantId)!;
        hits.push({ kind: "FIN", label: `${s.vin}`, detail: `${variantTitle(v)} · Verkauf ${s.id}`, href: `/auktionen?q=${encodeURIComponent(s.vin)}` });
      }
    }
    for (const l of getAllListings()) {
      if (hits.length >= limit + 6) break;
      if (l.id.toUpperCase().startsWith(raw) || l.vin.startsWith(raw)) {
        hits.push({ kind: "Inserat", label: `${l.id} · ${l.title}`, detail: `${eur(l.price)} · ${l.city}`, href: `/kaufen?inserat=${l.id}` });
      }
    }
  }
  return hits;
}
