/**
 * Builds the lite copies of the market data: what an account without premium gets instead of the full files
 * (src/lib/plan.tsx, server/auth.ts). Run by the data plugin in vite.config.ts, in development and in the build:
 *
 *   tsx scripts/data/lite.ts <output directory>
 *
 * The lite copies hold what the lite version shows and nothing else, so nothing can be read out of the browser:
 *
 *  - market-model.lite.json: per variant the market value, the number of records behind it, its typical range and
 *    the body style effects. No value history (the curve is flat at today's value), no auction houses, channel
 *    levels, gearbox effects or outliers, no segment indices. Added under `lite`: the overall market index and the
 *    four biggest gains of the start page, computed here from the full data.
 *  - sales.lite.csv: which lot of which variant was offered when and where, and whether it sold. No hammer price,
 *    estimate, bid, mileage, chassis number, colour, link or photo. The price column of a sold lot carries the
 *    variant's published market value (or, without one, the median the app shows) as a stand-in, so every figure
 *    the lite version shows comes out the same and nothing else does.
 *
 * The app's own data modules do the reading, so variant ids, dates and medians are exactly what the app computes.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setDataset } from "../../src/data/real/dataset";

const out = process.argv[2];
if (!out) throw new Error("usage: tsx scripts/data/lite.ts <output directory>");
const REAL = fileURLToPath(new URL("../../src/data/real/", import.meta.url));
const json = (f: string) => JSON.parse(readFileSync(REAL + f, "utf8"));
const model = json("market-model.json");
const salesCsv = readFileSync(REAL + "sales.csv", "utf8");
setDataset({ model, asks: json("asks.json"), history: json("listing-history.json"), salesCsv });

// after setDataset: these modules read the data when they load
const { variants } = await import("../../src/data/db");
const { realSalesFor } = await import("../../src/data/real/sales");
const { fewRecordsMedian, getMetrics, homeWinners, marketIndex } = await import("../../src/data/market");

const thousand = (v: number) => Math.round(v / 1000) * 1000;

// ---- model
const KEEP = ["value", "n", "n12", "n24", "lo", "hi", "first", "last", "index", "own", "family", "ch", "body"];
const shown = new Map(variants.filter((v) => v.measured).map((v) => [v.id, getMetrics(v.id).value]));
const liteVariants: Record<string, Record<string, unknown>> = {};
for (const [id, e] of Object.entries(model.variants as Record<string, Record<string, unknown>>)) {
  const o: Record<string, unknown> = {};
  for (const k of KEEP) if (k in e) o[k] = e[k];
  // flat at the value the full version shows today: the app reads the value from the end of the series
  if (e.series && e.value) o.series = (model.grid as number[]).map(() => Math.round(shown.get(id) ?? (e.value as number)));
  liteVariants[id] = o;
}
const { index: _segmentIndices, variants: _variants, ...rest } = model;
void _segmentIndices;
void _variants;
const liteModel = {
  ...rest,
  variants: liteVariants,
  lite: {
    index: marketIndex().map((p) => [p.t, Math.round(p.value * 100) / 100]),
    winners: homeWinners().map((w) => ({ id: w.id, change: Math.round(w.change * 10000) / 10000 })),
  },
};

// ---- sales
const header = salesCsv.replace(/^﻿/, "").split(/\r?\n/)[0];
const cols = header.split(";");
const cell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const lines = [header];
let sold = 0;
for (const v of variants) {
  const standIn = v.measured ? thousand(shown.get(v.id)!) : thousand(fewRecordsMedian(v.id)?.value ?? 0);
  for (const s of realSalesFor(v.id)) {
    const row: Record<string, string> = {
      variant_id: v.id,
      datum: new Date(s.date).toISOString().slice(0, 10),
      quelle: s.source,
      haus: s.house,
      verkauft: s.price === null ? "nein" : "ja",
      preis_eur: s.price === null ? "" : String(standIn),
      karosserie: s.body,
      los_id: s.id,
    };
    if (s.price !== null) sold++;
    lines.push(cols.map((c) => cell(row[c] ?? "")).join(";"));
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "market-model.lite.json"), JSON.stringify(liteModel));
writeFileSync(join(out, "sales.lite.csv"), lines.join("\n") + "\n");
console.log(`lite data: ${Object.keys(liteVariants).length} variants, ${lines.length - 1} lots (${sold} sold), written to ${out}`);
