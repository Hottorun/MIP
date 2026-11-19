import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { variants } from "../db";

// Every auction result in sales.csv must be exactly the variant it is listed under (no 718 Spyder in the Spyder RS).
// The full check runs in Python (scripts/market/test_zuordnung.py, audit.py); this one runs with `npm test` and guards
// the typical confusions directly on the data the app shows, plus the catalog files the Python check depends on.
const REAL = fileURLToPath(new URL("./", import.meta.url));
const MARKET = fileURLToPath(new URL("../../../scripts/market/", import.meta.url));
const [head, ...lines] = readFileSync(REAL + "sales.csv", "utf8").trimEnd().split("\n");
const cols = head.split(";");
const rows = lines.map((l) => Object.fromEntries(l.split(";").map((v, i) => [cols[i], v])) as Record<string, string>);
const RACE = /rennsportwagen-|gt-rennwagen-|cup-und-clubsport-/;
// Rows moved by hand (FIN contradicts the title, scripts/market/manual/zuordnung-korrekturen.csv) keep their original title.
const fixed = new Set(
  readFileSync(MARKET + "manual/zuordnung-korrekturen.csv", "utf8").trimEnd().split("\n").slice(1)
    .flatMap((l) => { const [lot, fin, to] = l.split(";"); return to ? [lot, fin].filter(Boolean) : []; }),
);
// Production ended 1988, but Porsche assembled a last few 959 from spare parts in 1992/93 (classify.py takes them too).
const LATE: Record<string, number> = { "porsche-959-959-komfort": 1993, "porsche-959-959-sport": 1993 };

/** Sports versions and the word their title must carry: listed under the version ⇔ named in the title. */
const PAIRS: { name: string; variant: RegExp; title: RegExp; scope: RegExp }[] = [
  { name: "Spyder RS", variant: /-718-spyder-rs$/, title: /spyder rs/i, scope: /-718-718-(spyder|boxster)/ },
  { name: "GT4 RS", variant: /gt4-rs$/, title: /gt4 ?rs/i, scope: /-718-718-cayman/ },
  { name: "GT3 RS", variant: /gt3-rs(-4-0)?$/, title: /gt3 ?rs|gt3 carrera rs/i, scope: /-911-9(96|97|91|92)-.*gt3/ },
  { name: "GT2 RS", variant: /gt2-rs$/, title: /gt2 ?rs/i, scope: /-911-9(97|91)-.*gt2/ },
  { name: "Turbo S", variant: /turbo-s$/, title: /turbo ['"]?s\b|turbo 3\.[36] s\b/i, scope: /-911-9(93|96|97|91|92)-[12-]*-?turbo/ },
  { name: "Cayman S", variant: /cayman-s$/, title: /cayman (\(?98[17](\.[12])?\)? )?([23]\.\d ?)?s\b/i, scope: /-cayman-98[17]-|-718-718-cayman(-s)?$/ },
  { name: "GTS", variant: /gts(-4-0)?$/, title: /\bgts\b/i, scope: /-911-992-|-981-|-718-718-(boxster|cayman)/ },
];

describe("Zuordnung der Auktionsergebnisse (sales.csv)", () => {
  it("keine Sportversion bei der Basisversion und umgekehrt", () => {
    const bad: string[] = [];
    for (const r of rows) {
      if (RACE.test(r.variant_id) || fixed.has(r.los_id) || fixed.has(r.fin)) continue;
      for (const p of PAIRS) {
        if (!p.scope.test(r.variant_id)) continue;
        if (p.variant.test(r.variant_id) !== p.title.test(r.fahrzeug)) bad.push(`${p.name}: ${r.variant_id} | ${r.fahrzeug} | ${r.los_id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("Angebote (asks.json): dieselbe Prüfung für die Angebote, die die App zeigt", () => {
    const asks = JSON.parse(readFileSync(REAL + "asks.json", "utf8")) as { id: string; variant: string; title: string; excluded?: string }[];
    const bad: string[] = [];
    for (const a of asks) {
      if (a.excluded || RACE.test(a.variant)) continue;
      for (const p of PAIRS) {
        if (!p.scope.test(a.variant)) continue;
        if (p.variant.test(a.variant) !== p.title.test(a.title)) bad.push(`${p.name}: ${a.variant} | ${a.title} | ${a.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("Baujahr im Titel innerhalb der Bauzeit (ein Jahr Spielraum für Modelljahre)", () => {
    const byId = new Map(variants.map((v) => [v.id, v]));
    const bad: string[] = [];
    for (const r of rows) {
      const v = byId.get(r.variant_id);
      if (!v || RACE.test(r.variant_id)) continue;
      const y = Number(r.fahrzeug.match(/\b(19[4-9]\d|20[0-3]\d)\s+Porsche\b/)?.[1]);
      const [a, b] = v.years;
      if (y && (y < a - 1 || y > (LATE[v.id] ?? b ?? 9999) + 1)) bad.push(`${r.variant_id} (${a}–${b ?? ""}) | ${r.fahrzeug}`);
    }
    expect(bad).toEqual([]);
  });

  it("keine Nachbauten, Umbauten oder Teile", () => {
    const bad = rows.filter((r) => /\b(replica|tribute|recreation|backdate[d]?|[- ]look\b|clone|kit car|owner's manual|engine only)\b/i.test(r.fahrzeug));
    expect(bad.map((r) => `${r.variant_id} | ${r.fahrzeug}`)).toEqual([]);
  });

  it("ausgeblendete Ergebnisse haben einen Grund und sind nicht zugleich sichtbar", () => {
    const [h2, ...l2] = readFileSync(REAL + "sales-ausgeblendet.csv", "utf8").trimEnd().split("\n");
    const c2 = h2.split(";");
    expect(c2.at(-1)).toBe("grund");
    const hidden = l2.map((l) => Object.fromEntries(l.split(";").map((v, i) => [c2[i], v])) as Record<string, string>);
    expect(hidden.filter((r) => !r.grund?.trim())).toEqual([]);
    const visible = new Set(rows.map((r) => r.los_id));
    expect(hidden.filter((r) => visible.has(r.los_id)).map((r) => r.los_id)).toEqual([]);
  });
});

describe("Katalogdateien für die Zuordnung (scripts/market)", () => {
  it("variant_years.json und variant_bodies.json entsprechen dem Katalog (sonst: npx tsx scripts/market/catalog.mts)", () => {
    const years = JSON.parse(readFileSync(MARKET + "variant_years.json", "utf8")) as Record<string, [number, number | null]>;
    const bodies = JSON.parse(readFileSync(MARKET + "variant_bodies.json", "utf8")) as Record<string, string[]>;
    for (const v of variants) {
      expect(years[v.id], v.id).toEqual(v.years);
      expect(bodies[v.id], v.id).toEqual(Object.keys(v.body ?? {}).sort());
    }
  });
});
