import { CATALOG, PAINTS } from "./catalog";
import type { Brand, Generation, Model, ModelCategory, Variant, VariantOption, VariantSeed } from "./types";
import { rng, slug } from "../lib/random";
import { launchPhotos, officialLinks, realData, type Photo } from "./real";
import { isBrandEnabled } from "../config";
import { OPTIONS } from "./options";
import { marketBasis } from "./real/model";
import { t } from "../i18n";
import { tr } from "../i18n/terms";
import { num } from "../lib/format";

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

const BODY_LABEL: Record<string, string> = { "Coupé": "Karosserie Coupé", Cabriolet: "Karosserie Cabriolet", Targa: "Karosserie Targa", Roadster: "Karosserie Roadster" };

/**
 * Where the auction data shows it, gearbox and body effects are measured instead of estimated: median of the
 * time-adjusted prices of that configuration against the variant's median (at least 6 sales each, see model.ts).
 */
function withMeasuredEffects(opts: VariantOption[], seed: VariantSeed, id: string): VariantOption[] {
  const basis = marketBasis(id);
  if (!basis) return opts;
  const gb = basis.gearbox;
  const out = [...opts];
  if (gb.Manual && gb.Automatik) {
    const i = out.findIndex((o) => o.name.startsWith("Schaltgetriebe"));
    const measured = { impact: Math.round(gb.Manual[0] * 100) / 100, measured: gb.Manual[1] };
    if (i >= 0) out[i] = { ...out[i], ...measured };
    else out.unshift({ name: "Schaltgetriebe", standard: false, ...measured });
  }
  const bodies = Object.keys(seed.body ?? {});
  for (const [body, [effect, n]] of Object.entries(basis.body)) {
    if (!BODY_LABEL[body] || !bodies.includes(body) || bodies.length < 2) continue;
    out.push({ name: BODY_LABEL[body], standard: false, impact: Math.round(effect * 100) / 100, measured: n, group: "Karosserie" });
  }
  return out;
}

/** Curated value-relevant options (src/data/options.ts); fallback: manual gearbox where Tiptronic/PDK existed, special paint. */
function buildOptions(seed: VariantSeed, id: string): VariantOption[] {
  return withMeasuredEffects(baseOptions(seed, id), seed, id);
}

function baseOptions(seed: VariantSeed, id: string): VariantOption[] {
  const curated = OPTIONS[id];
  if (curated) return curated.map(([name, impact, requires]) => ({ name, standard: false, impact, ...(requires ? { requires } : {}) }));
  if (seed.tags?.includes("Rennwagen")) {
    // Race cars are valued on their history, not on factory options.
    return seed.years[0] < 2000
      ? [
          { name: "Dokumentierte Renngeschichte (Werkseinsatz oder Klassensieg)", standard: false, impact: 0.3 },
          { name: "Originalmotor und -chassis (Matching Numbers)", standard: false, impact: 0.12 },
        ]
      : [
          { name: "Motor frisch revidiert (wenige Stunden seit Revision)", standard: false, impact: 0.06 },
          { name: "Ersatzteilpaket (Felgen, Karosserie- und Verschleißteile)", standard: false, impact: 0.03 },
        ];
  }
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
  if (tags.includes("Rennwagen")) {
    list.push("Chassis-Historie lückenlos belegt (Fahrgestellnummer, Rennergebnisse, Vorbesitzer)");
    list.push("Unfallschäden und Reparaturen an Rahmen bzw. Monocoque");
    list.push("Laufzeit von Motor und Getriebe seit der letzten Revision");
    list.push(y < 2000 ? "Wagenpass / FIA-HTP für historische Rennen" : "Homologation und Einsatzmöglichkeit (Rennserie, Balance of Performance)");
    list.push("Keine Straßenzulassung, Betrieb nur auf der Rennstrecke");
    return list;
  }
  if (brandId === "porsche") {
    if (y < 1998) list.push("Rost (v. a. Kotflügel, Schweller, Wagenheberaufnahmen)");
    if (y < 1998) list.push("Motor (Ölverlust, Kopfdichtung, Stehbolzen)");
    if (generationName === "964") list.push("Zweimassenschwungrad und Verteilerantrieb");
    // Early 911: mechanical injection on E, S and Carrera; the others: chain tensioners, oil-fed only from the Carrera 3.2 (1983).
    if (generationName === "F-Modell" || generationName === "G-Modell") {
      if (/^(E 2\.[024]|S 2\.[24]|Carrera 2\.7|Carrera RS 2\.7|Carrera RS 3\.0)$/.test(seed.name)) list.push("Mechanische Einspritzpumpe (Bosch): Revision und Einstellung");
      else if (y < 1983) list.push("Kettenspanner (bis 1983 nicht ölgespeist)");
    }
    // M96/M97 engines (911 and Boxster/Cayman); the 997.2/987.2 got the new 9A1 engine without intermediate shaft.
    if (["996.1", "996.2", "997.1", "986", "987.1"].includes(generationName) && !tags.includes("Leichtbau") && !tags.includes("Turbo"))
      list.push("IMS-Lager und Zylinderlaufbahnen (M96/M97)");
    if (y >= 1998) list.push("Wartungsnachweise und Software-/Steuergerätestand");
  }
  if (tags.includes("Leichtbau")) list.push("Rennstreckeneinsatz / Unfallhistorie (Spaltmaße, Lackschichtdicke)");
  if (tags.includes("Turbo")) list.push("Turbolader und Ladeluftkühlung");
  if (y < 1990) list.push("Originalität (Interieur, Felgen, Werkzeug)");
  return list.slice(0, 5);
}

/**
 * Market tab gallery: official manufacturer photos only; empty → illustration. launch.json is curated so the first
 * photo (also the preview everywhere) is a front three-quarter view where one exists, followed by side and rear views.
 */
function marketPhotos(id: string): Photo[] {
  return (launchPhotos[id] ?? []).filter((p) => p.file);
}

/** Model families in menu order; models sort by family first, then by first build year. */
export const MODEL_CATEGORIES: { id: ModelCategory; readonly label: string }[] = [
  { id: "heck", get label() { return t("Heckmotor", "Rear-engined"); } },
  { id: "mittel", get label() { return t("Mittelmotor", "Mid-engined"); } },
  { id: "super", get label() { return t("Supersportwagen", "Supercars"); } },
  { id: "motorsport", get label() { return "Motorsport"; } },
];
const categoryIndex = (c: ModelCategory) => MODEL_CATEGORIES.findIndex((x) => x.id === c);

/** The 911 counts from its 1963 debut (IAA premiere as the 901), not from the F-Modell's first production year (1964). */
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
  if (/50 Jahre|25 Jahre|Black Edition|RS 60/.test(name)) return 2;
  if (/\b(GT3|GT4|RS|R|Spyder|Leichtbau|Weissach)\b|^959 Sport$|^356 Carrera/.test(name)) return 3;
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
    // Rear-engined (356, 911, 912, 930), mid-engined (Boxster, Cayman, 718), supercars (959, Carrera GT, 918).
    const byFirstYear = [...b.models].sort((x, y) => categoryIndex(x.category) - categoryIndex(y.category) || firstYear(x) - firstYear(y));
    for (const m of byFirstYear) {
      const model: Model = {
        id: `${b.id}-${slug(m.name)}`,
        brandId: b.id,
        name: m.name,
        generationIds: [],
        featured: m.featured ?? false,
        category: m.category,
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
        // A base model sorts with its first derivative ("Cayman" before "Cayman S", even though the S came first).
        const start = (x: VariantSeed) => Math.min(x.years[0], ...g.variants.filter((o) => o.name.startsWith(`${x.name} `)).map((o) => o.years[0]));
        const prefix = (x: VariantSeed, y: VariantSeed) => (y.name.startsWith(`${x.name} `) ? -1 : x.name.startsWith(`${y.name} `) ? 1 : 0);
        // Race cars simply follow their racing years.
        const seeds = [...g.variants].sort((x, y) =>
          m.category === "motorsport" ? x.years[0] - y.years[0] : variantTier(x.name) - variantTier(y.name) || start(x) - start(y) || prefix(x, y),
        );
        for (const s of seeds) {
          const id = `${genId}-${slug(s.name)}`;
          const paint = PAINTS[b.id];
          const real = realData[id];
          const specs = real?.specs;
          const basis = marketBasis(id);
          const variant: Variant = {
            ...s,
            // Market value from the market model; variants with too few records keep the catalog figure internally
            // (demo listings and auctions only) and show no value (`measured: false`).
            ...(basis?.value ? { value: basis.value } : {}),
            measured: !!basis?.value,
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
            productionNote: specs?.productionNote,
            newPriceYear: (specs?.newPrice?.eur && specs.newPrice.year) || (specs?.years ?? s.years)[0],
            options: buildOptions(s, id),
            shape: s.shape ?? g.shape,
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

/** Former variant ids (e.g. before the split into 991.1/991.2, or GT3 Touring, now a GT3 option) → current id. Old links and saved data follow them. */
export const VARIANT_ALIASES: Record<string, string> = {
  "porsche-911-991-gt3-touring": "porsche-911-991-2-gt3",
  "porsche-911-992-gt3-touring": "porsche-911-992-1-gt3",
  "porsche-911-996-carrera": "porsche-911-996-1-carrera",
  "porsche-911-996-turbo": "porsche-911-996-1-turbo",
  "porsche-911-996-gt3": "porsche-911-996-1-gt3",
  "porsche-911-996-gt2": "porsche-911-996-1-gt2",
  "porsche-911-996-carrera-4s": "porsche-911-996-2-carrera-4s",
  "porsche-911-996-targa": "porsche-911-996-2-targa",
  "porsche-911-996-turbo-s": "porsche-911-996-2-turbo-s",
  "porsche-911-996-gt3-rs": "porsche-911-996-2-gt3-rs",
  "porsche-911-997-carrera-s": "porsche-911-997-1-carrera-s",
  "porsche-911-997-turbo": "porsche-911-997-1-turbo",
  "porsche-911-997-gt3": "porsche-911-997-1-gt3",
  "porsche-911-997-gt3-rs": "porsche-911-997-1-gt3-rs",
  "porsche-911-997-gt2": "porsche-911-997-1-gt2",
  "porsche-911-997-turbo-s": "porsche-911-997-2-turbo-s",
  "porsche-911-997-sport-classic": "porsche-911-997-2-sport-classic",
  "porsche-911-997-speedster": "porsche-911-997-2-speedster",
  "porsche-911-997-gt3-rs-4-0": "porsche-911-997-2-gt3-rs-4-0",
  "porsche-911-997-gt2-rs": "porsche-911-997-2-gt2-rs",
  "porsche-911-991-carrera-s": "porsche-911-991-1-carrera-s",
  "porsche-911-991-turbo-s": "porsche-911-991-1-turbo-s",
  "porsche-911-991-50-jahre-edition": "porsche-911-991-1-50-jahre-edition",
  "porsche-911-991-gt3": "porsche-911-991-1-gt3",
  "porsche-911-991-gt3-rs": "porsche-911-991-1-gt3-rs",
  "porsche-911-991-r": "porsche-911-991-1-r",
  "porsche-911-991-carrera-t": "porsche-911-991-2-carrera-t",
  "porsche-911-991-speedster": "porsche-911-991-2-speedster",
  "porsche-911-991-gt2-rs": "porsche-911-991-2-gt2-rs",
  "porsche-911-992-carrera-s": "porsche-911-992-1-carrera-s",
  "porsche-911-992-carrera-gts": "porsche-911-992-1-carrera-gts",
  "porsche-911-992-turbo-s": "porsche-911-992-1-turbo-s",
  "porsche-911-992-sport-classic": "porsche-911-992-1-sport-classic",
  "porsche-911-992-dakar": "porsche-911-992-1-dakar",
  "porsche-911-992-s-t": "porsche-911-992-1-s-t",
  "porsche-911-992-gt3": "porsche-911-992-1-gt3",
  "porsche-911-992-gt3-rs": "porsche-911-992-1-gt3-rs",
};

export function resolveVariantId(id: string): string {
  return VARIANT_ALIASES[id] ?? id;
}

export function getVariant(id: string | undefined): Variant | undefined {
  return id ? variantById.get(resolveVariantId(id)) : undefined;
}

function includesModel(v: Variant, modelName: string) {
  // "914/6" names the model too
  return ` ${v.name} `.includes(` ${modelName} `) || v.name.startsWith(`${modelName}/`);
}

/** Display names: German words in model, generation and variant names ("F-Modell", "25 Jahre") in the current language. */
export const modelName = (m: Model) => tr(m.name);
export const genName = (g: Generation) => tr(g.name);
export const variantName = (v: Variant) => tr(v.name);

/** "Porsche 911 (964) Carrera RS", "Porsche Boxster Spyder (987.2)", "Porsche 718 Spyder", "Porsche 959 Komfort" */
export function variantTitle(v: Variant, opts: { brand?: boolean } = {}): string {
  const brand = brandById.get(v.brandId)!;
  const model = modelById.get(v.modelId)!;
  const gen = generationById.get(v.generationId)!;
  const parts: string[] = [];
  if (opts.brand !== false) parts.push(brand.name);
  // Race cars carry their own names ("Porsche 917 K"); the motorsport groups are only for the menus.
  if (model.category === "motorsport") return [...parts, variantName(v)].join(" ");
  const genSuffix = gen.name !== model.name ? ` (${genName(gen)})` : "";
  if (includesModel(v, model.name)) parts.push(`${variantName(v)}${genSuffix}`);
  else parts.push(`${modelName(model)}${genSuffix}`, variantName(v));
  return parts.join(" ");
}

/** Compact label for tables and chips: "964 Carrera RS", "Testarossa", "F40". */
export function variantShortTitle(v: Variant): string {
  const model = modelById.get(v.modelId)!;
  const gen = generationById.get(v.generationId)!;
  if (model.category === "motorsport") return variantName(v);
  const multiGen = model.generationIds.length > 1;
  if (includesModel(v, model.name)) return multiGen ? `${variantName(v)} (${genName(gen)})` : variantName(v);
  return multiGen ? `${genName(gen)} ${variantName(v)}` : `${modelName(model)} ${variantName(v)}`;
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
  if (b === null) return `${a}–${t("heute", "today")}`;
  return a === b ? `${a}` : `${a}–${b}`;
}

/** Value factor for the picked options (effects multiply), e.g. 1.12 = +12 %. Only measured effects count. */
export function optionFactor(v: Variant, picked: string[]): number {
  return v.options.filter((o) => !o.standard && o.measured && picked.includes(o.name)).reduce((f, o) => f * (1 + o.impact), 1);
}

/** Variants with a measured market value (for rankings, indices and comparisons). */
export const measuredVariants = () => variants.filter((v) => v.measured);

/** "3.338 Stück", or "115.631 Stück (alle Vierzylinder)" when only a shared figure is published. */
export function productionLabel(v: Variant, unitDe = "Stück", unitEn = "units") {
  const note = v.productionNote ? ` (${tr(v.productionNote)})` : "";
  return t(`${num(v.production)} ${unitDe}${note}`, `${num(v.production)} ${unitEn}${note}`);
}
