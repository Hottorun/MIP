import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * mobile.de Search API ("Ad-Integration") proxy — https://services.mobile.de/docs/search-api.html
 * Credentials are issued by mobile.de to dealers/partners and stay on the server:
 *   MOBILEDE_USERNAME, MOBILEDE_PASSWORD (optional MOBILEDE_BASE_URL)
 */

const BASE = process.env.MOBILEDE_BASE_URL ?? "https://services.mobile.de";
const CACHE_MS = 20 * 60_000;
const SAFE = /^[\p{L}\p{N} .\-/]{1,40}$/u;

export type MobileAd = {
  id: string;
  url: string | null;
  make: string;
  model: string;
  title: string;
  firstRegistration: string | null; // yyyyMM
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

const credentials = () => {
  const user = process.env.MOBILEDE_USERNAME;
  const pass = process.env.MOBILEDE_PASSWORD;
  return user && pass ? Buffer.from(`${user}:${pass}`).toString("base64") : null;
};

const cache = new Map<string, { at: number; body: unknown }>();

type Json = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

function normalize(ad: Json): MobileAd {
  const price = (ad.price ?? {}) as Json;
  const seller = (ad.seller ?? {}) as Json;
  const address = (seller.address ?? {}) as Json;
  const images = Array.isArray(ad.images) ? (ad.images as Json[]) : [];
  const commercial = seller.type === "DEALER" || seller.commercial === true || Boolean(seller.companyName);
  const description = str(ad.plainTextDescription) ?? str(ad.description);
  return {
    id: String(ad.mobileAdId ?? ""),
    url: str(ad.detailPageUrl),
    make: str(ad.make) ?? "",
    model: str(ad.model) ?? "",
    title: [str(ad.make), str(ad.modelDescription) ?? str(ad.model)].filter(Boolean).join(" "),
    firstRegistration: str(ad.firstRegistration),
    mileage: num(ad.mileage),
    price: num(price.consumerPriceGross),
    currency: str(price.currency) ?? "EUR",
    color: str(ad.manufacturerColorName),
    exteriorColor: str(ad.exteriorColor),
    gearbox: str(ad.gearbox),
    powerKw: num(ad.power),
    vin: str(ad.vin),
    fullServiceHistory: bool(ad.fullServiceHistory),
    accidentDamaged: bool(ad.accidentDamaged),
    previousOwners: num(ad.numberOfPreviousOwners),
    images: images.map((i) => str(i.xxl) ?? str(i.xl) ?? str(i.l)).filter((u): u is string => Boolean(u)).slice(0, 12),
    sellerName: commercial ? (str(seller.companyName) ?? "Händler") : "Privatanbieter",
    sellerType: commercial ? "Händler" : "Privat",
    city: str(address.city),
    country: str(address.country),
    created: str(ad.creationDate),
    description: description ? description.slice(0, 600) : null,
  };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/** GET /api/mobilede/status, GET /api/mobilede/search?make=PORSCHE&model=911&from=1992&to=1994[&page=1] */
export async function handleMobileDe(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/mobilede/status") return send(res, 200, { configured: Boolean(credentials()) });
  if (url.pathname !== "/api/mobilede/search" || req.method !== "GET") return send(res, 404, { error: "Not found" });

  const auth = credentials();
  if (!auth) return send(res, 503, { error: "mobile.de ist nicht konfiguriert (MOBILEDE_USERNAME / MOBILEDE_PASSWORD fehlen)", configured: false });

  const make = url.searchParams.get("make") ?? "";
  const model = url.searchParams.get("model") ?? "";
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const page = Math.max(1, Math.min(20, Number(url.searchParams.get("page") ?? 1)));
  if (!SAFE.test(make) || (model && !SAFE.test(model))) return send(res, 400, { error: "Ungültige Marke/Modell" });

  const q = new URLSearchParams({
    classification: `refdata/classes/Car/makes/${make}${model ? `/models/${model}` : ""}`,
    "page.size": "100",
    "page.number": String(page),
    "sort.field": "modificationTime",
    "sort.order": "DESCENDING",
  });
  if (from >= 1900 && from <= 2100) q.set("firstRegistrationDate.min", `${from}-01`);
  if (to >= 1900 && to <= 2100) q.set("firstRegistrationDate.max", `${to}-12`);
  const target = `${BASE}/search-api/search?${q}`;

  const hit = cache.get(target);
  if (hit && Date.now() - hit.at < CACHE_MS) return send(res, 200, hit.body);

  try {
    const r = await fetch(target, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/vnd.de.mobile.api+json", "Accept-Language": "de" },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 401 || r.status === 403) return send(res, 502, { error: "mobile.de hat die Zugangsdaten abgelehnt" });
    if (!r.ok) return send(res, 502, { error: `mobile.de antwortet mit ${r.status}` });
    const data = (await r.json()) as Json;
    const body = {
      total: num(data.total) ?? 0,
      maxPages: num(data.maxPages) ?? 1,
      currentPage: num(data.currentPage) ?? page,
      ads: (Array.isArray(data.ads) ? (data.ads as Json[]) : []).map(normalize),
      warnings: Array.isArray(data.errors) ? data.errors : [],
    };
    cache.set(target, { at: Date.now(), body });
    send(res, 200, body);
  } catch (e) {
    send(res, 504, { error: e instanceof Error && e.name === "TimeoutError" ? "mobile.de antwortet nicht (Timeout)" : "mobile.de nicht erreichbar" });
  }
}
