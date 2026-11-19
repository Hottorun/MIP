import { describe, expect, it } from "vitest";
import { variantShortTitle, variantTitle, variants } from "../data/db";
import { hasWords } from "./words";

describe("Wortsuche (Auktionen, Kaufen, Suche)", () => {
  it("ein Suchwort muss einen Wortanfang treffen, nicht irgendeinen Teil", () => {
    expect(hasWords("Porsche 718 Spyder RS", "718 Spyder RS")).toBe(true);
    expect(hasWords("Porsche 718 Spyder", "718 Spyder RS")).toBe(false); // "rs" in "Porsche"
    expect(hasWords("Porsche 911 (997.2) Turbo", "turbo s")).toBe(false);
    expect(hasWords("Porsche 911 (997.2) Turbo S", "turbo s")).toBe(true);
    expect(hasWords("Porsche 911 (993) Turbo", "993 turbo")).toBe(true);
    expect(hasWords("Porsche 911 Carrera RS 2.7 (F-Modell)", "carr 2.7 modell")).toBe(true);
    expect(hasWords("Porsche 911 (997.2) GT3", "997.2")).toBe(true);
    expect(hasWords("Porsche 911 (997.1) GT3", "997.2")).toBe(false);
    expect(hasWords("BAT-123456 Bring a Trailer", "bat-123 trailer")).toBe(true);
    expect(hasWords("Porsche 356 Speedster Pré-A", "pre")).toBe(true);
    expect(hasWords("Porsche 718 Spyder", "")).toBe(true);
  });

  it("der Kurzname einer Variante („Alle Ergebnisse“) bezeichnet genau eine Variante", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const v of variants)
      for (const n of new Set([variantTitle(v), variantTitle(v, { brand: false }), variantShortTitle(v)].map((x) => x.toLowerCase()))) {
        const other = seen.get(n);
        if (other && other !== v.id) twice.push(`${n}: ${other} / ${v.id}`);
        seen.set(n, v.id);
      }
    expect(twice).toEqual([]);
  });
});
