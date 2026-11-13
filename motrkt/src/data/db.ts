import { CATALOG, PAINTS } from "./catalog";
import { paintsOfVariant } from "./real/paints";
import type { Body, Brand, Generation, Model, ModelCategory, Variant, VariantOption, VariantSeed } from "./types";
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

/** Buying hints. Each has one wording here and one translation in i18n/terms.ts. */
const HINT = {
  rustAir: "Rost (v. a. Kotflügel, Schweller, Wagenheberaufnahmen)",
  rust356: "Rost (Bodenbleche, Schweller, Batteriekasten, Längsträger)",
  rust914: "Rost (Batteriekasten, Längsträger, Kofferraumböden)",
  rustTransaxle: "Rost (Schweller, Radläufe, Batteriekasten)",
  rustScreens: "Rost an Front- und Heckscheibenrahmen",
  engine356: "Motor: Ölverlust und zum Fahrgestell passender Motortyp (Kardex)",
  fourCam: "Königswellenmotor (Fuhrmann): Revision sehr aufwendig, nur wenige Spezialisten",
  engineEarly911: "Motor: Ölverlust und Verschleiß der Ventilführungen",
  engineStuds: "Motor: Ölverlust und gerissene Zylinderkopf-Stehbolzen",
  engine964: "Motor: Ölverlust an Zylindern und Köpfen (frühe Motoren ohne Kopfdichtung)",
  engineLeaks: "Motor: Ölverlust (Ventildeckel, Steuerkettenkästen)",
  engine993: "Verkokte Sekundärluftkanäle und Verschleiß der Ventilführungen",
  engine912: "Motor (Typ 616): Ölverlust, Zustand von Zylindern und Kurbeltrieb",
  engine912E: "Motor (2,0-Liter-Typ-4) und L-Jetronic-Einspritzung",
  mfi: "Mechanische Einspritzpumpe (Bosch): Revision und Einstellung",
  tensioners: "Kettenspanner (bis 1983 nicht ölgespeist)",
  flywheel964: "Zweimassenschwungrad und Verteilerantrieb",
  distributor964: "Verteilerantrieb (Riemen des Doppelzündverteilers)",
  ims: "IMS-Lager und Zylinderlaufbahnen (M96/M97)",
  rms: "Kurbelwellen-Dichtring (Ölverlust zwischen Motor und Getriebe)",
  radiators: "Kühler und Klimakondensatoren im Bug (Laub, Korrosion)",
  mezger: "Geklebte Kühlwasseranschlüsse am Motor (Mezger): verstiftet oder verschweißt?",
  gt3Engine991: "Motor der 991.1 GT3: Tauschmotor bzw. verlängerte Motorgarantie belegt",
  service: "Wartungsnachweise und Software-/Steuergerätestand",
  overrev: "Überdrehzahlen im Motorsteuergerät auslesen",
  track: "Rennstreckeneinsatz / Unfallhistorie (Spaltmaße, Lackschichtdicke)",
  authentic: "Echtheit als Sondermodell belegen (Fahrgestellnummer, Geburtsurkunde)",
  turbo: "Turbolader und Ladeluftkühlung",
  turboNoIntercooler: "Turbolader (noch ohne Ladeluftkühler)",
  flatnose: "Flachbau ab Werk belegen (Sonderwunsch-Auftrag bzw. Option M505/M506)",
  matching: "Matching Numbers (Motor und Getriebe laut Geburtsurkunde)",
  original: "Originalität (Interieur, Felgen, Werkzeug)",
  authentic9146: "Echtheit als 914/6 belegen (viele Umbauten aus Vierzylindern)",
  fuel914: "Gemischaufbereitung (Einspritzung bzw. Vergaser) und Unterdruckschläuche",
  shift914: "Schaltgestänge (bis Modelljahr 1972 mit Heckschaltung)",
  belt4: "Zahnriemen und Wasserpumpe (Wechselintervall)",
  beltBalance: "Zahnriemen, Ausgleichswellenriemen und Wasserpumpe (Wechselintervall)",
  camChain: "Steuerkette zwischen den Nockenwellen und Spanner (16V)",
  clutch944: "Kupplung (Tausch aufwendig)",
  dash944: "Risse im Armaturenbrett (frühe Modelle)",
  flywheel968: "Zweimassenschwungrad und Kupplung",
  torqueTube: "Transaxle: Lager der Zentralwelle und Getriebegeräusche",
  belt928: "Zahnriemen, Riemenspannung und Wasserpumpe (V8)",
  electrics928: "Zentralelektrik und Steckverbindungen",
  thrust928: "Axiallager der Kurbelwelle bei Automatik (Vorspannung der Mitnehmerscheibe)",
  awd959: "Allradsteuerung, Fahrwerkshydraulik und Elektronik: Wartung nur bei wenigen Spezialisten",
  ride959: "Niveauregulierung und verstellbare Dämpfer (nur Komfort)",
  wheels959: "Magnesium-Hohlspeichenräder mit Reifendrucküberwachung (Sonderreifen)",
  idle: "Standzeiten und Wartungsnachweise",
  clutchCGT: "Keramik-Kupplung (PCCC): Verschleiß und Tauschkosten",
  recallCGT: "Fahrwerks-Rückruf von 2023 (Gelenke der Radaufhängung) erledigt?",
  tyres: "Reifenalter und freigegebene Reifen",
  hybrid: "Hochvoltbatterie und Hybridkomponenten (Garantie, Softwarestand)",
  recall918: "Rückrufe erledigt? (Fahrwerksteile, Kabelbaum, Gurtbefestigung)",
} as const;

/**
 * What to check before buying, by drivetrain family rather than by build year: air-cooled 911 (by generation),
 * M96/M97 engines with intermediate shaft, Mezger engines, transaxle cars, and the supercars.
 */
function buildWeaknesses(brandId: string, seed: VariantSeed, modelName: string, generationName: string): string[] {
  const tags = seed.tags ?? [];
  const y = seed.years[0];
  const name = seed.name;
  const list: string[] = [];
  if (tags.includes("Rennwagen")) {
    list.push("Chassis-Historie lückenlos belegt (Fahrgestellnummer, Rennergebnisse, Vorbesitzer)");
    list.push("Unfallschäden und Reparaturen an Rahmen bzw. Monocoque");
    list.push("Laufzeit von Motor und Getriebe seit der letzten Revision");
    list.push(y < 2000 ? "Wagenpass / FIA-HTP für historische Rennen" : "Homologation und Einsatzmöglichkeit (Rennserie, Balance of Performance)");
    list.push("Keine Straßenzulassung, Betrieb nur auf der Rennstrecke");
    return list;
  }
  const turbo = tags.includes("Turbo");
  const light = tags.includes("Leichtbau");
  const gen = generationName;
  if (brandId !== "porsche") {
    if (light) list.push(HINT.track);
    if (turbo) list.push(HINT.turbo);
    if (y < 1990) list.push(HINT.original);
    return list;
  }
  // Mechanical injection on E, S and Carrera of the early 911; the others ran chain tensioners without oil feed until 1983.
  const mfi = /^(E 2\.[024]|S 2\.[24]|Carrera 2\.7|Carrera RS 2\.7|Carrera RS 3\.0)$/.test(name);
  if (modelName === "356") {
    list.push(HINT.rust356, /Carrera/.test(name) ? HINT.fourCam : HINT.engine356, HINT.matching, HINT.original);
  } else if (modelName === "912") {
    list.push(HINT.rustAir, / E$/.test(name) ? HINT.engine912E : HINT.engine912, HINT.matching, HINT.original);
  } else if (modelName === "914") {
    list.push(HINT.rust914, name.includes("914/6") ? HINT.authentic9146 : HINT.fuel914, HINT.shift914, HINT.original);
  } else if (gen === "F-Modell") {
    list.push(HINT.rustAir, HINT.engineEarly911, mfi ? HINT.mfi : HINT.tensioners);
    if (light) list.push(HINT.authentic);
    list.push(HINT.matching, HINT.original);
  } else if (gen === "G-Modell" || modelName === "930") {
    list.push(HINT.rustAir, HINT.engineStuds);
    if (mfi) list.push(HINT.mfi);
    else if (y < 1983) list.push(HINT.tensioners);
    if (turbo) list.push(name.includes("3.0") ? HINT.turboNoIntercooler : HINT.turbo);
    if (name.includes("Flachbau")) list.push(HINT.flatnose);
    if (light) list.push(HINT.authentic);
    list.push(HINT.original);
  } else if (gen === "964") {
    list.push(HINT.rustScreens, turbo ? HINT.engineLeaks : HINT.engine964);
    // Dual-mass flywheel on the Carrera; the RS has a light single-mass flywheel, the Turbo a single distributor.
    if (!turbo) list.push(light ? HINT.distributor964 : HINT.flywheel964);
    if (turbo) list.push(HINT.turbo);
    if (light) list.push(HINT.authentic, HINT.track);
  } else if (gen === "993") {
    list.push(HINT.rustScreens, HINT.engine993, HINT.engineLeaks);
    if (turbo) list.push(HINT.turbo);
    if (light) list.push(HINT.authentic);
  } else if (modelName === "924") {
    list.push(name.includes("924 S") ? HINT.beltBalance : HINT.belt4);
    // The 924 Turbo has no intercooler; the Carrera GT and GTS do.
    if (turbo) list.push(name === "924 Turbo" ? HINT.turboNoIntercooler : HINT.turbo);
    if (light) list.push(HINT.authentic);
    // Fully galvanised from model year 1981.
    if (y < 1981) list.push(HINT.rustTransaxle);
    list.push(HINT.torqueTube, HINT.original);
  } else if (modelName === "944") {
    list.push(HINT.beltBalance);
    if (/944 S/.test(name)) list.push(HINT.camChain);
    if (turbo) list.push(HINT.turbo);
    list.push(HINT.clutch944, HINT.rustTransaxle);
    if (name === "944") list.push(HINT.dash944);
    list.push(HINT.original);
  } else if (modelName === "968") {
    list.push(HINT.beltBalance, HINT.camChain, HINT.flywheel968);
    if (turbo) list.push(HINT.turbo);
    if (light) list.push(turbo ? HINT.authentic : HINT.track);
  } else if (modelName === "928") {
    list.push(HINT.belt928, HINT.electrics928);
    // The 928 GT came with the manual gearbox only.
    if (!name.includes("GT") || name.includes("GTS")) list.push(HINT.thrust928);
    list.push(HINT.torqueTube);
    if (y < 1990) list.push(HINT.original);
  } else if (modelName === "959") {
    list.push(HINT.awd959);
    if (name.includes("Komfort")) list.push(HINT.ride959);
    list.push(HINT.wheels959, HINT.turbo, HINT.idle);
  } else if (modelName === "Carrera GT") {
    list.push(HINT.clutchCGT, HINT.recallCGT, HINT.tyres, HINT.service);
  } else if (modelName === "918") {
    list.push(HINT.hybrid, HINT.recall918, HINT.service);
  } else {
    // Water-cooled 911, Boxster, Cayman and 718.
    const m96 = ["996.1", "996.2", "997.1", "986", "987.1"].includes(gen);
    // Mezger engine: Turbo, GT2 and GT3 of the 996 and 997.1, and the GT3 and GT2 RS of the 997.2.
    const mezger = (m96 && (turbo || light)) || (gen === "997.2" && /^(GT3|GT2)/.test(name));
    if (m96 && !mezger) list.push(HINT.ims, HINT.rms, HINT.radiators);
    if (mezger) list.push(HINT.mezger);
    if (gen === "991.1" && name === "GT3") list.push(HINT.gt3Engine991);
    if (tags.includes("Hybrid")) list.push(HINT.hybrid);
    if (turbo) list.push(HINT.turbo);
    if (light) list.push(HINT.track, HINT.overrev);
    list.push(HINT.service);
  }
  return list.slice(0, 5);
}

/**
 * Market tab gallery: official manufacturer photos only; empty → illustration. launch.json is curated so the first
 * photo (also the preview everywhere) is a front three-quarter view where one exists, followed by side and rear views.
 */
function marketPhotos(id: string): Photo[] {
  return (launchPhotos[id] ?? []).filter((p) => p.file);
}

/** Model families in menu order; models sort by family first, then by first build year (oldest first). */
export const MODEL_CATEGORIES: { id: ModelCategory; readonly label: string }[] = [
  { id: "heck", get label() { return t("Heckmotor", "Rear-engined"); } },
  { id: "mittel", get label() { return t("Mittelmotor", "Mid-engined"); } },
  { id: "front", get label() { return t("Frontmotor", "Front-engined"); } },
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
 * Exclusivity of a variant for ordering variants built from the same year: dearer and rarer = more exclusive.
 * Price alone puts the 993 Carrera RS before the Carrera 4S, production alone the 911 S 2.7 before the 2.7;
 * together they give T < E < S, Carrera < Turbo < RS < GT2, Boxster < Boxster S.
 */
function exclusivity(newPrice: number, production: number): number {
  return Math.log(Math.max(newPrice, 1)) - 0.5 * Math.log(Math.max(production, 1));
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
      // Generations oldest first.
      const gensByYear = [...m.generations].sort((x, y) => x.years[0] - y.years[0]);
      for (const g of gensByYear) {
        const genId = g.name === m.name ? model.id : `${model.id}-${slug(g.name)}`;
        const gen: Generation = { id: genId, modelId: model.id, name: g.name, years: g.years, shape: g.shape, variantIds: [] };
        model.generationIds.push(genId);
        generations.push(gen);
        generationById.set(genId, gen);
        // Oldest first, by first build year (sourced years where known); same year: the more exclusive one later.
        const real = (x: VariantSeed) => realData[`${genId}-${slug(x.name)}`]?.specs;
        const yearsOf = (x: VariantSeed) => real(x)?.years ?? x.years;
        const excl = (x: VariantSeed) => exclusivity(real(x)?.newPrice?.eur ?? x.newPrice, real(x)?.production ?? x.production);
        const seeds = [...g.variants].sort((x, y) => yearsOf(x)[0] - yearsOf(y)[0] || excl(x) - excl(y));
        for (const s of seeds) {
          const id = `${genId}-${slug(s.name)}`;
          const paint = PAINTS[b.id];
          const real = realData[id];
          const specs = real?.specs;
          const basis = marketBasis(id);
          const variant: Variant = {
            ...s,
            // Market value from the market model; variants with too few records keep the catalog figure internally
            // and show no value (`measured: false`).
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
            weaknesses: buildWeaknesses(b.id, s, m.name, g.name),
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

/** Paints the factory offered for this variant (its colour charts), else the brand's generic list. */
export function paintsForVariant(v: Variant): { name: string; hex: string }[] {
  const chart = paintsOfVariant(v);
  return chart.length ? chart.map((c) => ({ name: c.name, hex: c.hex })) : PAINTS[v.brandId];
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

/** Body styles a variant was built in, when there is more than one (the body switcher on the variant page). */
export function bodyChoices(v: Variant): Body[] {
  const bodies = (Object.keys(v.body) as Body[]).filter((b) => (v.body[b] ?? 0) > 0);
  return bodies.length >= 2 ? bodies : [];
}

/**
 * Measured price effect of a body style against the variant's market value (median of the time-adjusted prices of
 * that body against all, at least 6 records), or null when there are too few records of it.
 */
export function bodyEffect(v: Variant, body: Body | null): { factor: number; n: number } | null {
  if (!body || !v.measured) return null;
  const e = marketBasis(v.id)?.body[body];
  return e ? { factor: 1 + e[0], n: e[1] } : null;
}
