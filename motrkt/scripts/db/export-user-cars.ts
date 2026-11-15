import { writeFileSync } from "node:fs";
import { connect } from "./client.ts";

/**
 * Approved car reports of users (table user_cars, server/userCars.ts) as a semicolon file for model.py, in the format of
 * scripts/market/manual/*.csv (art = Verkauf). Only what the model needs: no chassis number, no user.
 *
 *   tsx scripts/db/export-user-cars.ts OUT.csv
 *
 * daily.sh writes the file to a temporary folder (not the work folder, which GitHub Actions keeps in its cache) and
 * deletes it after the model run.
 */
const out = process.argv[2];
if (!out) {
  console.error("Ausgabedatei fehlt");
  process.exit(1);
}
const sql = connect();
const [{ ok }] = await sql<{ ok: boolean }[]>`select to_regclass('user_cars') is not null as ok`;
const rows = ok
  ? await sql<{ id: string; sale_date: Date; title: string; build_year: number; price: string; currency: string; km: number; country: string; variant_id: string; counterparty: string }[]>`
      select id, sale_date, title, build_year, price, currency, km, country, variant_id, counterparty
      from user_cars where status = 'approved' order by sale_date`
  : [];
const clean = (v: unknown) => String(v ?? "").replace(/[;\n\r]/g, ",");
const lines = rows.map((r) =>
  [r.id, r.sale_date.toISOString().slice(0, 10), "Carbay-Nutzer (Kaufvertrag geprüft)", "Verkauf", "", clean(r.title), r.build_year, Number(r.price), r.currency,
   r.km, r.counterparty === "haendler" ? "Händler" : r.counterparty === "auktion" ? "Auktion" : "Privat", r.country, r.variant_id].join(";"),
);
writeFileSync(out, ["id;datum;quelle;art;url;fahrzeug;baujahr;preis;waehrung;km;anbieter;land;variant_id", ...lines].join("\n") + "\n");
console.log(`${rows.length} geprüfte Nutzerfahrzeuge exportiert`);
await sql.end();
