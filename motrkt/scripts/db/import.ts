import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect } from "./client.ts";

/**
 * Loads the market data files written by the daily update (src/data/real) into Postgres. Replaces the whole snapshot in
 * one transaction, so the app never sees half an import. Run after `npm run db:migrate`.
 */
const REAL = fileURLToPath(new URL("../../src/data/real/", import.meta.url));
const read = (f: string) => readFileSync(REAL + f, "utf8");
const json = (f: string) => JSON.parse(read(f));
const int = (s: string) => (s === "" ? null : Math.round(Number(s)));
const str = (s: string | null | undefined) => (s === "" || s === undefined ? null : s);

// sales.csv: semicolon-separated, no quoting (export.py replaces ";" inside fields)
const [header, ...lines] = read("sales.csv").trimEnd().split("\n");
const cols = header.split(";");
const sales = lines.map((line) => {
  const f = line.split(";");
  if (f.length !== cols.length) throw new Error(`sales.csv: ${f.length} statt ${cols.length} Felder: ${line.slice(0, 80)}`);
  const r = Object.fromEntries(cols.map((c, i) => [c, f[i]]));
  return {
    lot_id: r.los_id,
    variant_id: r.variant_id,
    title: r.fahrzeug,
    sale_date: r.datum,
    channel: r.quelle,
    house: r.haus,
    sold: r.verkauft === "ja",
    price_eur: int(r.preis_eur),
    estimate_low: int(r.schaetzung_von),
    estimate_high: int(r.schaetzung_bis),
    condition: str(r.zustand),
    km: int(r.km),
    buyer_country: str(r.kaeuferland),
    origin_country: str(r.herkunft),
    delivery_country: str(r.auslieferung),
    color: str(r.farbe),
    body: str(r.karosserie),
    gearbox: str(r.getriebe),
    chassis: str(r.fin),
    url: str(r.url),
    price_original: int(r.preis_original),
    currency: str(r.waehrung),
    location: str(r.standort),
    high_bid_eur: int(r.hoechstgebot_eur ?? ""),
  };
});

type Ask = {
  id: string; variant: string; date: string; eur: number; price: number; cur: string; km: number | null; year: number; title: string;
  body: string | null; seller: string; sellerName: string | null; country: string; url: string; source: string; excluded: string | null; note: string | null;
};
const asks = (json("asks.json") as Ask[]).map((a) => ({
  id: a.id,
  variant_id: a.variant,
  seen_on: a.date,
  price_eur: Math.round(a.eur),
  price: Math.round(a.price),
  currency: a.cur,
  km: a.km,
  year: a.year,
  title: a.title,
  body: a.body,
  seller_type: a.seller,
  seller_name: a.sellerName,
  country: a.country,
  url: a.url,
  source: a.source,
  excluded: a.excluded,
  note: a.note,
}));

type History = { src: string; variant: string | null; cur: string; first: string; last: string; status: "active" | "gone"; goneOn?: string; prices: [string, number][] };
const historyFile = json("listing-history.json") as { summary: unknown; listings: Record<string, History> };

const model = json("market-model.json") as Record<string, unknown> & { asOf: string; variants: Record<string, Record<string, unknown>> };

const sql = connect();
const counts = await sql.begin(async (tx) => {
  await tx`truncate sales, asks, listing_history, variant_values, market_meta`;
  // stay well below Postgres' 65,535 parameters per statement
  const insert = async (table: string, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += 1000) await tx`insert into ${tx(table)} ${tx(rows.slice(i, i + 1000))}`;
  };
  await insert("sales", sales);
  await insert("asks", asks);
  await insert(
    "listing_history",
    Object.entries(historyFile.listings).map(([url, h]) => ({
      url,
      source: h.src,
      variant_id: h.variant,
      currency: h.cur,
      first_seen: h.first,
      last_seen: h.last,
      status: h.status,
      gone_on: h.goneOn ?? null,
      prices: tx.json(h.prices),
    })),
  );
  await insert(
    "variant_values",
    Object.entries(model.variants).map(([id, v]) => {
      const { value, lo, hi, n, n12, n24, first, last, index, family, own, series, ...detail } = v as Record<string, never>;
      return {
        variant_id: id, value, lo: lo ?? null, hi: hi ?? null, n, n12: n12 ?? null, n24: n24 ?? null, first_sale: first ?? null, last_sale: last ?? null,
        index_group: index, family, own_series: own ?? null, series: series ? (series as number[]).map(Math.round) : null, detail: tx.json(detail),
      };
    }),
  );
  const { variants: _variants, ...meta } = model;
  await insert("market_meta", [...Object.entries(meta), ["listingTracking", historyFile.summary]].map(([key, value]) => ({ key, value: tx.json(value as never) })));
  const counts = {
    sales: sales.length,
    asks: asks.length,
    listing_history: Object.keys(historyFile.listings).length,
    variant_values: Object.keys(model.variants).length,
  };
  await tx`insert into data_imports (as_of, counts) values (${model.asOf}, ${tx.json(counts)})`;
  return counts;
});
console.log(`Marktdaten vom ${model.asOf} importiert:`, counts);
await sql.end();
