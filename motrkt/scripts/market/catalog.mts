// Writes the catalog facts the Python pipeline needs, from the catalog in src/data:
//   variant_years.json   build years of each variant [from, to or null] (classify.py, audit.py)
//   variant_bodies.json  body styles of each variant (audit.py)
// Run after adding or changing a variant:  npx tsx scripts/market/catalog.mts
// src/data/real/variantMatch.test.ts (npm test) fails while either file is out of date.
import { writeFileSync } from "node:fs";
import "../../src/test/setup";

const { variants } = await import("../../src/data/db");
const years: Record<string, unknown> = {};
const bodies: Record<string, string[]> = {};
for (const v of variants) {
  years[v.id] = v.years;
  bodies[v.id] = Object.keys(v.body ?? {}).sort();
}
writeFileSync(new URL("./variant_years.json", import.meta.url), JSON.stringify(years));
writeFileSync(new URL("./variant_bodies.json", import.meta.url), JSON.stringify(bodies) + "\n");
console.log(variants.length, "Varianten");
