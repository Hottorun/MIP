import { CATALOG, PAINTS } from "./catalog";
import type { Brand, Generation, Model, Variant, VariantOption, VariantSeed } from "./types";
import { rng, slug } from "../lib/random";
import { launchPhotos, officialLinks, realData, type Photo } from "./real";
import { isBrandEnabled } from "../config";
import { OPTIONS } from "./options";

/** Normalised catalog: brands → models → generations → variants, plus lookup maps. */

export const brands: Brand[] = [];
export const models: Model[] = [];
export const generations: Generation[] = [];
export const variants: Variant[] = [];

export const brandById = new Map<string, Brand>();
export const modelById = new Map<string, Model>();
export const generationById = new Map<string, Generation>();
export const variantById = new Map<string, Variant>();
/** Variant ids of brands that are switched off in src/config.ts (kept so stored data and imports are not treated as unknown). */
export const hiddenVariantIds = new Set<string>();

const MARKET_BASE: Record<string, Record<string, number>> = {
  porsche: { Deutschland: 32, USA: 24, UK: 12, Japan: 8, "Rest Europa": 18, "Naher Osten": 6 },
};

function buildMarkets(brandId: string, id: string) {
  const r = rng(`markets:${id}`);
  const base = MARKET_BASE[brandId];
  const raw = Object.entries(base).map(([country, share]) => ({ country, share: share * r.range(0.75, 1.25) }));
  const total = raw.reduce((s, m) => s + m.share, 0);
  return raw
    .map((m) => ({ country: m.country, share: Math.round((m.share / total) * 1000) / 10 }))
    .sort((a, b) => b.share - a.share);
}

/** Curated value-relevant options (src/data/options.ts); fallback: manual gearbox where Tiptronic/PDK existed, special paint. */
function buildOptions(seed: VariantSeed, id: string): VariantOption[] {
  const curated = OPTIONS[id];
  if (curated) return curated.map(([name, impact, requires]) => ({ name, standard: false, impact, ...(requires ? { requires } : {}) }));
  const manualShare = seed.gearbox?.Manual ?? 1;
  const opts: VariantOption[] = [];
  if (manualShare > 0 && manualShare < 0.99) opts.push({ name: "Schaltgetriebe", standard: false, impact: 0.1 });
  opts.push({ name: "Farbsonderwunsch (Sonderlack ab Werk)", standard: false, impact: 0.06 });
  return opts;
}

function buildWeaknesses(brandId: string, seed: VariantSeed, generationName: string): string[] {
  const tags = seed.tags ?? [];
  const y = seed.years[0];
  const list: string[] = [];
  if (brandId === "porsche") {
    if (y < 1998) list.push("Rost (v. a. Kotflügel, Schweller, Wagenheberaufnahmen)");
    if (y < 1998) list.push("Motor (Ölverlust, Kopfdichtung, Stehbolzen)");
    if (generationName === "964") list.push("Zweimassenschwungrad und Verteilerantrieb");
    if (["996", "997"].includes(generationName) && !tags.includes("Leichtbau") && !tags.includes("Turbo"))
      list.push("IMS-Lager und Zylinderlaufbahnen (M96/M97)");
    if (y >= 1998) list.push("Wartungsnachweise und Software-/Steuergerätestand");
  }
  if (tags.includes("Leichtbau")) list.push("Rennstreckeneinsatz / Unfallhistorie (Spaltmaße, Lackschichtdicke)");
  if (tags.includes("Turbo")) list.push("Turbolader und Ladeluftkühlung");
  if (y < 1990) list.push("Originalität (Interieur, Felgen, Werkzeug)");
  return list.slice(0, 5);
}

/** Market tab gallery: official manufacturer photos only (presentation shots first); empty → illustration. */
function marketPhotos(id: string): Photo[] {
  const photos = (launchPhotos[id] ?? []).filter((p) => p.file);
  return [...photos.filter((p) => p.premiere), ...photos.filter((p) => !p.premiere)];
}

/** The 911 counts from its 1963 debut, not from the oldest generation in the catalog (964). */
const DEBUT_YEAR: Record<string, number> = { "911": 1963 };
function firstYear(m: { name: string; generations: { years: [number, number | null] }[] }) {
  return DEBUT_YEAR[m.name] ?? Math.min(...m.generations.map((g) => g.years[0]));
}

/**
 * Order within a generation: 0 standard (Carrera, Targa, Coupé), 1 Turbo, 2 special editions,
 * 3 GT / RS / lightweight, 4 GT2 (most extreme, always last).
 */
function variantTier(name: string): number {
  if (/\bGT2\b/.test(name)) return 4;
  if (/\b(GT3|RS|R|Leichtbau|Weissach)\b|^959 Sport$|^356 Carrera/.test(name)) return 3;
  if (/Speedster|Sport Classic|Dakar|S\/T|50 Jahre|Flachbau/.test(name)) return 2;
  if (/^Turbo\b/.test(name)) return 1;
  return 0;
}

let built = false;
function build() {
  if (built) return;
  built = true;
  for (const b of CATALOG) {
    if (!isBrandEnabled(b.id)) {
      for (const m of b.models)
        for (const g of m.generations) {
          const modelId = `${b.id}-${slug(m.name)}`;
          const genId = g.name === m.name ? modelId : `${modelId}-${slug(g.name)}`;
          for (const s of g.variants) hiddenVariantIds.add(`${genId}-${slug(s.name)}`);
        }
      continue;
    }
    const brand: Brand = { id: b.id, name: b.name, country: b.country, color: b.color, featured: b.featured };
    brands.push(brand);
    brandById.set(brand.id, brand);
    // Models in order of first build year: 356, 911, 912, 930, 959, Carrera GT, 918.
    const byFirstYear = [...b.models].sort((x, y) => firstYear(x) - firstYear(y));
    for (const m of byFirstYear) {
      const model: Model = {
        id: `${b.id}-${slug(m.name)}`,
        brandId: b.id,
        name: m.name,
        generationIds: [],
        featured: m.featured ?? false,
      };
      models.push(model);
      modelById.set(model.id, model);
      for (const g of m.generations) {
        const genId = g.name === m.name ? model.id : `${model.id}-${slug(g.name)}`;
        const gen: Generation = { id: genId, modelId: model.id, name: g.name, years: g.years, shape: g.shape, variantIds: [] };
        model.generationIds.push(genId);
        generations.push(gen);
        generationById.set(genId, gen);
        // Standard models first, special models last; within a tier by first build year.
        const seeds = [...g.variants].sort((x, y) => variantTier(x.name) - variantTier(y.name) || x.years[0] - y.years[0]);
        for (const s of seeds) {
          const id = `${genId}-${slug(s.name)}`;
          const paint = PAINTS[b.id];
          const real = realData[id];
          const specs = real?.specs;
          const variant: Variant = {
            ...s,
            ...(specs?.production ? { production: specs.production } : {}),
            ...(specs?.hp ? { hp: specs.hp } : {}),
            ...(specs?.liters ? { liters: specs.liters } : {}),
            ...(specs?.years ? { years: specs.years } : {}),
            ...(specs?.newPrice?.eur ? { newPrice: Math.round(specs.newPrice.eur) } : {}),
            id,
            brandId: b.id,
            modelId: model.id,
            generationId: genId,
            vol: s.vol ?? 0,
            tags: s.tags ?? [],
            body: s.body ?? { Coupé: 1 },
            gearbox: s.gearbox ?? { Manual: 1 },
            drive: s.drive ?? (g.shape === "wedge" || g.shape === "hyper" ? "Mittelmotor, Heck (RWD)" : "Heck (RWD)"),
            transmission:
              s.transmission ?? (s.gearbox?.Automatik === 1 ? "Automatik / Doppelkupplung" : "5-Gang Schaltgetriebe"),
            color: real?.launchColor?.hex ?? s.color ?? paint[0].hex,
            launchColor: real?.launchColor,
            photos: (real?.images ?? []).filter((p) => p.file),
            marketPhotos: marketPhotos(id),
            officialLink: officialLinks[id],
            specSources: specs?.sources ?? [],
            options: buildOptions(s, id),
            shape: g.shape,
            markets: buildMarkets(b.id, id),
            weaknesses: buildWeaknesses(b.id, s, g.name),
          };
          gen.variantIds.push(id);
          variants.push(variant);
          variantById.set(id, variant);
        }
      }
    }
  }
}
build();

export const DEFAULT_VARIANT_ID = "porsche-911-964-carrera-rs";

/** Former variants that are now an option of another variant (old links and saved data point to the new one). */
export const VARIANT_ALIASES: Record<string, string> = {
  "porsche-911-991-gt3-touring": "porsche-911-991-gt3",
  "porsche-911-992-gt3-touring": "porsche-911-992-gt3",
};

export function resolveVariantId(id: string): string {
  return VARIANT_ALIASES[id] ?? id;
}

export function getVariant(id: string | undefined): Variant | undefined {
  return id ? variantById.get(resolveVariantId(id)) : undefined;
}

function includesModel(v: Variant, modelName: string) {
  const n = ` ${v.name} `;
  return n.includes(` ${modelName} `);
}

/** "Porsche 911 (964) Carrera RS", "Porsche 959 Komfort" */
export function variantTitle(v: Variant, opts: { brand?: boolean } = {}): string {
  const brand = brandById.get(v.brandId)!;
  const model = modelById.get(v.modelId)!;
  const gen = generationById.get(v.generationId)!;
  const parts: string[] = [];
  if (opts.brand !== false) parts.push(brand.name);
  const genSuffix = gen.name !== model.name ? ` (${gen.name})` : "";
  if (includesModel(v, model.name)) parts.push(`${v.name}${genSuffix}`);
  else parts.push(`${model.name}${genSuffix}`, v.name);
  return parts.join(" ");
}

/** Compact label for tables and chips: "964 Carrera RS", "Testarossa", "F40". */
export function variantShortTitle(v: Variant): string {
  const model = modelById.get(v.modelId)!;
  const gen = generationById.get(v.generationId)!;
  const multiGen = model.generationIds.length > 1;
  if (includesModel(v, model.name)) return multiGen ? `${v.name} (${gen.name})` : v.name;
  return multiGen ? `${gen.name} ${v.name}` : `${model.name} ${v.name}`;
}

export function variantsOfModel(modelId: string): Variant[] {
  return variants.filter((v) => v.modelId === modelId);
}

export function variantsOfBrand(brandId: string): Variant[] {
  return variants.filter((v) => v.brandId === brandId);
}

export function paintsFor(brandId: string) {
  return PAINTS[brandId];
}

export function yearsLabel([a, b]: [number, number | null]): string {
  if (b === null) return `${a}–heute`;
  return a === b ? `${a}` : `${a}–${b}`;
}

/** Value factor for the picked options (effects multiply), e.g. 1.12 = +12 %. */
export function optionFactor(v: Variant, picked: string[]): number {
  return v.options.filter((o) => !o.standard && picked.includes(o.name)).reduce((f, o) => f * (1 + o.impact), 1);
}
