import { hiddenVariantIds, variantById, variants, variantShortTitle, variantTitle } from "../db";
import { inLang, t } from "../../i18n";
import type { Body, Condition, Gearbox, SaleSource } from "../types";
import bundledCsv from "./sales.csv?raw";

/**
 * Real transaction records imported from CSV (bundled file `sales.csv` and/or a browser upload kept in localStorage).
 * When a variant has real records, they replace its synthetic sales and anchor its market value and trend.
 */

export const IMPORT_STORAGE_KEY = "motrkt:sales-import";

export type RealSale = {
  id: string;
  variantId: string;
  date: number;
  source: SaleSource;
  house: string;
  price: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  condition: Condition;
  mileage: number;
  buyerCountry: string;
  originCountry: string;
  deliveryCountry: string;
  body: Body;
  gearbox: Gearbox;
  color: string;
  vin: string;
  url?: string;
  conditionUnknown?: boolean;
};

export type ParseResult = { rows: RealSale[]; errors: string[]; total: number };

const ALIASES: Record<string, string[]> = {
  variant: ["variant_id", "variante_id", "id_variante"],
  title: ["fahrzeug", "vehicle", "title", "modell", "model"],
  date: ["datum", "date", "verkaufsdatum", "sale_date"],
  source: ["quelle", "source", "kanal"],
  house: ["haus", "house", "auktionshaus", "haendler", "händler", "dealer", "seller"],
  price: ["preis_eur", "preis", "price", "price_eur", "zuschlag", "hammer_price"],
  estLow: ["schaetzung_von", "schätzung_von", "estimate_low", "low_estimate"],
  estHigh: ["schaetzung_bis", "schätzung_bis", "estimate_high", "high_estimate"],
  sold: ["verkauft", "sold", "status"],
  condition: ["zustand", "condition", "note"],
  mileage: ["km", "mileage", "laufleistung", "kilometerstand"],
  buyer: ["kaeuferland", "käuferland", "buyer_country"],
  origin: ["herkunft", "origin_country", "origin"],
  delivery: ["auslieferung", "delivery_country", "erstauslieferung"],
  color: ["farbe", "color", "colour"],
  body: ["karosserie", "body"],
  gearbox: ["getriebe", "gearbox", "transmission"],
  vin: ["fin", "vin", "fahrgestellnummer", "chassis"],
  lot: ["los_id", "lot_id", "lot", "id"],
  url: ["url", "link", "quelle_url"],
};

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      out.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

let titleIndex: Map<string, string> | null = null;
function matchVariant(id: string, title: string): string | null {
  if (id && variantById.has(id.trim())) return id.trim();
  if (!title) return null;
  // Titles in both languages ("F-Modell" / "F-Model").
  titleIndex ??= new Map(
    (["de", "en"] as const).flatMap((l) =>
      inLang(l, () => variants.flatMap((v) => [[norm(variantTitle(v)), v.id], [norm(variantTitle(v, { brand: false })), v.id], [norm(variantShortTitle(v)), v.id]] as [string, string][])),
    ),
  );
  return titleIndex.get(norm(title)) ?? null;
}

function parseNumber(s: string): number | null {
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function parseDate(s: string): number | null {
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  return null;
}

const CONDITIONS = ["1", "1-", "2+", "2", "2-", "3"];

export function parseSalesCsv(text: string, origin = "CSV"): ParseResult {
  const lines = text.replace(/^\ufeff/, "").split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (lines.length === 0) return { rows: [], errors: [], total: 0 };
  const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase().trim());
  const col: Record<string, number> = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  const errors: string[] = [];
  if (col.variant < 0 && col.title < 0) errors.push(t(`${origin}: Spalte „variant_id“ oder „fahrzeug“ fehlt`, `${origin}: column “variant_id” or “vehicle” missing`));
  if (col.date < 0) errors.push(t(`${origin}: Spalte „datum“ fehlt`, `${origin}: column “date” missing`));
  if (errors.length) return { rows: [], errors, total: lines.length - 1 };

  const rows: RealSale[] = [];
  lines.slice(1).forEach((line, i) => {
    const f = splitLine(line, delim);
    const get = (k: string) => (col[k] >= 0 ? f[col[k]] ?? "" : "");
    const where = `${origin} ${t("Zeile", "row")} ${i + 2}`;
    if (hiddenVariantIds.has(get("variant").trim())) return; // brand switched off in src/config.ts – keep the row, skip it
    const variantId = matchVariant(get("variant"), get("title"));
    if (!variantId) return void errors.push(t(`${where}: Fahrzeug „${get("variant") || get("title")}“ nicht im Katalog`, `${where}: vehicle “${get("variant") || get("title")}” not in the catalogue`));
    const date = parseDate(get("date"));
    if (!date) return void errors.push(t(`${where}: Datum „${get("date")}“ ungültig (JJJJ-MM-TT oder TT.MM.JJJJ)`, `${where}: invalid date “${get("date")}” (YYYY-MM-DD or DD.MM.YYYY)`));
    const soldRaw = norm(get("sold"));
    const unsold = ["nein", "no", "false", "0", "nicht verkauft", "unsold", "bought in"].includes(soldRaw);
    const price = unsold ? null : parseNumber(get("price"));
    if (!unsold && !price) return void errors.push(t(`${where}: Preis fehlt`, `${where}: price missing`));
    const v = variantById.get(variantId)!;
    const srcRaw = norm(get("source"));
    const source: SaleSource = srcRaw.startsWith("h") || srcRaw.startsWith("d") ? "Händler" : srcRaw.startsWith("p") ? "Privat" : "Auktion";
    const cond = get("condition").replace(/\s/g, "");
    const bodyRaw = get("body");
    const gearRaw = norm(get("gearbox"));
    rows.push({
      id: get("lot") || `IMP-${String(rows.length + 1).padStart(4, "0")}`,
      variantId,
      date,
      source,
      house: get("house") || (source === "Privat" ? "Privatverkauf" : "–"),
      price,
      estimateLow: parseNumber(get("estLow")),
      estimateHigh: parseNumber(get("estHigh")),
      condition: (CONDITIONS.includes(cond) ? cond : "2") as Condition,
      conditionUnknown: !CONDITIONS.includes(cond),
      mileage: parseNumber(get("mileage")) ?? 0,
      buyerCountry: get("buyer").toUpperCase().slice(0, 2) || "–",
      originCountry: get("origin").toUpperCase().slice(0, 2) || "–",
      deliveryCountry: get("delivery").toUpperCase().slice(0, 2) || "–",
      body: ((Object.keys(v.body) as Body[]).find((b) => norm(b) === norm(bodyRaw)) ?? (Object.keys(v.body)[0] as Body)),
      gearbox: gearRaw.startsWith("a") || gearRaw.includes("pdk") || gearRaw.includes("tip") ? "Automatik" : gearRaw ? "Manual" : (Object.keys(v.gearbox)[0] as Gearbox),
      color: get("color") || "–",
      vin: get("vin") || "–",
      url: get("url") || undefined,
    });
  });
  return { rows, errors, total: lines.length - 1 };
}

function loadAll(): { byVariant: Map<string, RealSale[]>; count: number; errors: string[] } {
  const bundled = parseSalesCsv(bundledCsv, "sales.csv");
  let uploaded: ParseResult = { rows: [], errors: [], total: 0 };
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(IMPORT_STORAGE_KEY) : null;
    if (stored) uploaded = parseSalesCsv(stored, "Import");
  } catch {
    /* storage unavailable */
  }
  const byVariant = new Map<string, RealSale[]>();
  for (const s of [...bundled.rows, ...uploaded.rows]) {
    if (!byVariant.has(s.variantId)) byVariant.set(s.variantId, []);
    byVariant.get(s.variantId)!.push(s);
  }
  for (const list of byVariant.values()) list.sort((a, b) => b.date - a.date);
  return { byVariant, count: bundled.rows.length + uploaded.rows.length, errors: [...bundled.errors, ...uploaded.errors] };
}

export const realSales = loadAll();

export function realSalesFor(variantId: string): RealSale[] {
  return realSales.byVariant.get(variantId) ?? [];
}

export const TEMPLATE_CSV = bundledCsv.split(/\r?\n/)[0] + "\nporsche-911-964-carrera-rs;;2025-09-14;Auktion;RM Sotheby's;412000;380000;440000;ja;1-;28900;DE;DE;DE;Rubinsternrot;Coupé;Manual;WP0ZZZ96ZPS490000;RMS-25-0412;https://…\n";
