import { generationById, modelById, variants } from "../data/db";
import type { Gearbox, Listing, Variant } from "../data/types";

/** mobile.de Search API client: builds queries per catalog generation and maps ads onto MOTRKT variants. */

export type MobileAd = {
  id: string;
  url: string | null;
  make: string;
  model: string;
  title: string;
  firstRegistration: string | null;
  mileage: number | null;
  price: number | null;
  currency: string;
  color: string | null;
  exteriorColor: string | null;
  gearbox: string | null;
  powerKw: number | null;
  vin: string | null;
  fullServiceHistory: boolean | null;
  accidentDamaged: boolean | null;
  previousOwners: number | null;
  images: string[];
  sellerName: string;
  sellerType: "Händler" | "Privat";
  city: string | null;
  country: string | null;
  created: string | null;
  description: string | null;
};

// mobile.de reference-data codes (services.mobile.de/refdata/classes/Car/makes/{make}/models).
const MAKES: Record<string, string> = {
  porsche: "PORSCHE",
};
const MODELS: Record<string, string | null> = {
  "porsche-911": "911",
  "porsche-356": "356",
  "porsche-912": "912",
  "porsche-930": "930",
  "porsche-918": "918",
  "porsche-carrera-gt": "Carrera GT",
  "porsche-959": "959",
  "porsche-boxster": "Boxster",
  "porsche-cayman": "Cayman",
  // mobile.de files the 718 under Boxster and Cayman: search by make + years, match "718" in the title.
  "porsche-718": null,
};

const norm = (s: string) =>
  ` ${s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()} `;
const words = (s: string) => norm(s).trim().split(" ").filter(Boolean);

export type GenerationQuery = { key: string; make: string; model: string; from: number; to: number; generationId: string };

/** One mobile.de query per catalog generation (model code + first-registration window). */
export function generationQueries(): GenerationQuery[] {
  const seen = new Map<string, GenerationQuery>();
  for (const v of variants) {
    const gen = generationById.get(v.generationId)!;
    const make = MAKES[v.brandId];
    // Models without a mobile.de model code are searched by make + years and filtered by keywords.
    const model = MODELS[v.modelId] ?? "";
    const from = gen.years[0];
    const to = Math.min(new Date().getFullYear(), (gen.years[1] ?? new Date().getFullYear()) + 1);
    const key = `${make}|${model}|${from}|${to}`;
    if (!seen.has(key)) seen.set(key, { key, make, model, from, to, generationId: gen.id });
  }
  return [...seen.values()];
}

/** Score how well an ad title matches a variant; null = not this variant. */
function matchScore(v: Variant, text: string): number | null {
  const model = modelById.get(v.modelId)!;
  const gen = generationById.get(v.generationId)!;
  const generic = new Set([...words(model.name), ...words(gen.name), "coupe", "porsche"]);
  const required = words(v.name).filter((w) => !generic.has(w));
  const hasModelCode = MODELS[v.modelId] !== null && MODELS[v.modelId] !== undefined;
  if (!hasModelCode && !text.includes(norm(model.name.replace("-", " ")).trim()) && !words(model.name).every((w) => text.includes(` ${w} `))) return null;
  if (!required.every((w) => text.includes(` ${w} `))) return null;
  // Tokens that only appear in sibling variants (e.g. "rs" when looking for the plain Carrera) exclude the ad.
  const siblings = gen.variantIds.map((id) => variants.find((o) => o.id === id)!).filter((o) => o.id !== v.id);
  const own = new Set(words(v.name));
  for (const s of siblings) for (const w of words(s.name)) if (w.length > 1 && !own.has(w) && !generic.has(w) && text.includes(` ${w} `)) return null;
  // Other generation codes of the same model in the title ("993" in a 964 search) exclude the ad.
  const code = (name: string) => name.split(".")[0].toLowerCase();
  for (const gid of model.generationIds) {
    const other = code(generationById.get(gid)!.name);
    if (other !== code(gen.name) && /^\d{3}$|^[a-z]\d+$/i.test(other) && text.includes(` ${other} `)) return null;
  }
  return required.length;
}

const COLOR_HEX: Record<string, string> = {
  BLACK: "#151619", WHITE: "#ebeae6", SILVER: "#b7babe", GREY: "#7d7f7a", RED: "#b3121b", BLUE: "#1f3f8f",
  GREEN: "#2f6b3a", YELLOW: "#efc11a", ORANGE: "#ee7a12", BROWN: "#5a3a22", BEIGE: "#cfc2a2", GOLD: "#c8a35a", PURPLE: "#5a2a6b",
};

function toListing(ad: MobileAd, v: Variant): Listing | null {
  if (!ad.price || !ad.id) return null;
  const year = ad.firstRegistration ? Number(ad.firstRegistration.slice(0, 4)) : v.years[0];
  const gearbox: Gearbox = ad.gearbox === "MANUAL_GEAR" ? "Manual" : ad.gearbox ? "Automatik" : (Object.keys(v.gearbox)[0] as Gearbox);
  return {
    id: `MDE-${ad.id}`,
    variantId: v.id,
    title: ad.title,
    year,
    mileage: ad.mileage ?? 0,
    price: ad.price, // the Search API reports gross consumer prices in EUR
    country: (ad.country ?? "DE").toUpperCase(),
    city: ad.city ?? "–",
    seller: ad.sellerName,
    sellerType: ad.sellerType,
    condition: "2",
    conditionUnknown: true,
    color: ad.color ?? ad.exteriorColor ?? "–",
    colorHex: COLOR_HEX[ad.exteriorColor ?? ""] ?? v.color,
    body: Object.keys(v.body)[0] as Listing["body"],
    gearbox,
    vin: ad.vin ?? "–",
    listedAt: ad.created ? Date.parse(ad.created) : Date.now(),
    matchingNumbers: false,
    serviceHistory: Boolean(ad.fullServiceHistory),
    description: ad.description ?? "",
    source: "mobile.de",
    url: ad.url ?? undefined,
    images: ad.images,
    powerPs: ad.powerKw ? Math.round(ad.powerKw * 1.35962) : undefined,
    accidentDamaged: ad.accidentDamaged,
    previousOwners: ad.previousOwners,
  };
}

/** Assign each ad to the best-matching variant of the queried generation (most specific name wins). */
export function mapAds(query: GenerationQuery, ads: MobileAd[]): Listing[] {
  const candidates = variants.filter((v) => {
    const gen = generationById.get(v.generationId)!;
    return MAKES[v.brandId] === query.make && (MODELS[v.modelId] ?? "") === query.model && gen.years[0] === query.from;
  });
  const out: Listing[] = [];
  for (const ad of ads) {
    const year = ad.firstRegistration ? Number(ad.firstRegistration.slice(0, 4)) : null;
    let best: { v: Variant; score: number } | null = null;
    for (const v of candidates) {
      if (year && (year < v.years[0] || year > (v.years[1] ?? 9999) + 1)) continue;
      const score = matchScore(v, norm(`${ad.model} ${ad.title}`));
      if (score !== null && (!best || score > best.score)) best = { v, score };
    }
    if (!best) continue;
    const l = toListing(ad, best.v);
    if (l) out.push(l);
  }
  return out;
}

export async function fetchMobileStatus(): Promise<boolean> {
  try {
    const r = await fetch("/api/mobilede/status");
    return r.ok && Boolean((await r.json()).configured);
  } catch {
    return false;
  }
}

export async function fetchGeneration(query: GenerationQuery, signal?: AbortSignal): Promise<Listing[]> {
  const out: Listing[] = [];
  for (let page = 1; page <= 3; page++) {
    const p = new URLSearchParams({ make: query.make, model: query.model, from: String(query.from), to: String(query.to), page: String(page) });
    const r = await fetch(`/api/mobilede/search?${p}`, { signal });
    const body = await r.json();
    if (!r.ok) throw new Error(body.error ?? `mobile.de Fehler ${r.status}`);
    out.push(...mapAds(query, body.ads as MobileAd[]));
    if (page >= (body.maxPages ?? 1)) break;
  }
  return out;
}
