import type { Brand, CarShape, ModelCategory, VariantSeed } from "./types";

type GenerationDef = { name: string; years: [number, number | null]; shape: CarShape; variants: VariantSeed[] };
type ModelDef = { name: string; category: ModelCategory; featured?: boolean; generations: GenerationDef[] };
type BrandDef = Omit<Brand, "id"> & { id: string; models: ModelDef[] };

/** Compact variant helper: name, years, production, median value, 5y CAGR, hp, displacement, list price. */
function v(
  name: string,
  years: [number, number | null],
  production: number,
  value: number,
  cagr: number,
  hp: number,
  liters: number,
  newPrice: number,
  extra: Partial<VariantSeed> = {},
): VariantSeed {
  return { name, years, production, value, cagr, hp, liters, newPrice, ...extra };
}

const AWD = { drive: "Allrad (AWD)", tags: ["Allrad"] };
const PDK = { gearbox: { Automatik: 1 }, transmission: "7-Gang PDK" };
/** Boxster: open mid-engine roadster (the "roadster" shape alone would label it rear-engined). */
const MID = { drive: "Mittelmotor, Heck (RWD)", body: { Roadster: 1 } };
/** Race cars: tagged so mileage, options and weak points follow racing use. */
const race = (...tags: string[]) => ({ tags: ["Rennwagen", ...tags] });
/** Open mid-engined Spyder of the 1950s. */
const SPYDER = { ...MID, transmission: "4-Gang Schaltgetriebe" };

export const PAINTS: Record<string, { name: string; hex: string }[]> = {
  porsche: [
    { name: "Rubinstern", hex: "#7a1f3d" },
    { name: "Guardsrot", hex: "#b3121b" },
    { name: "Grand-Prix-Weiß", hex: "#e9e8e1" },
    { name: "Speedgelb", hex: "#efc11a" },
    { name: "Schwarz", hex: "#151619" },
    { name: "Polarsilber", hex: "#b7babe" },
    { name: "Mintgrün", hex: "#5fc9a9" },
    { name: "Maritimblau", hex: "#1f3f8f" },
    { name: "Arenarot", hex: "#741726" },
    { name: "Riviera-Blau", hex: "#1f6fd0" },
    { name: "Signalgrün", hex: "#3aa83a" },
    { name: "Kreide", hex: "#cfccc2" },
  ],
};

export const CATALOG: BrandDef[] = [
  {
    id: "porsche",
    name: "Porsche",
    country: "DE",
    color: "#d4a24c",
    featured: true,
    models: [
      {
        name: "911",
        category: "heck",
        featured: true,
        generations: [
          // Original 911 from the O series (production from September 1964) to the F series (model year 1973).
          {
            name: "F-Modell",
            years: [1964, 1973],
            shape: "classic911",
            variants: [
              v("2.0", [1964, 1967], 8520, 125_000, 0.045, 130, 2.0, 11_200, {
                body: { Coupé: 0.92, Targa: 0.08 },
                color: "#cfccc2",
              }),
              v("S 2.0", [1966, 1969], 6121, 215_000, 0.05, 160, 2.0, 12_500, {
                body: { Coupé: 0.75, Targa: 0.25 },
                gearbox: { Manual: 0.95, Automatik: 0.05 },
                transmission: "5-Gang Schaltgetriebe / Sportomatic",
                color: "#b3121b",
              }),
              v("L 2.0", [1967, 1968], 1610, 115_000, 0.042, 130, 2.0, 11_000, {
                body: { Coupé: 0.73, Targa: 0.27 },
                gearbox: { Manual: 0.85, Automatik: 0.15 },
                transmission: "5-Gang Schaltgetriebe / Sportomatic",
                color: "#1f3f8f",
              }),
              v("T 2.0", [1967, 1969], 6318, 92_000, 0.04, 110, 2.0, 9_700, {
                body: { Coupé: 0.87, Targa: 0.13 },
                gearbox: { Manual: 0.9, Automatik: 0.1 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#efc11a",
              }),
              v("E 2.0", [1968, 1969], 2826, 125_000, 0.045, 140, 2.0, 11_700, {
                body: { Coupé: 0.7, Targa: 0.3 },
                gearbox: { Manual: 0.85, Automatik: 0.15 },
                transmission: "5-Gang Schaltgetriebe / Sportomatic",
                color: "#b7babe",
              }),
              v("T 2.2", [1969, 1971], 15082, 95_000, 0.04, 125, 2.2, 10_600, {
                body: { Coupé: 0.6, Targa: 0.4 },
                gearbox: { Manual: 0.9, Automatik: 0.1 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#3aa83a",
              }),
              v("E 2.2", [1969, 1971], 4927, 130_000, 0.045, 155, 2.2, 12_300, {
                body: { Coupé: 0.62, Targa: 0.38 },
                gearbox: { Manual: 0.88, Automatik: 0.12 },
                transmission: "5-Gang Schaltgetriebe / Sportomatic",
                color: "#1f6fd0",
              }),
              v("S 2.2", [1969, 1971], 4691, 225_000, 0.05, 180, 2.2, 14_000, {
                body: { Coupé: 0.68, Targa: 0.32 },
                color: "#741726",
              }),
              v("T 2.4", [1971, 1973], 16903, 98_000, 0.04, 130, 2.4, 12_000, {
                body: { Coupé: 0.6, Targa: 0.4 },
                gearbox: { Manual: 0.9, Automatik: 0.1 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#e9e8e1",
              }),
              v("E 2.4", [1971, 1973], 4406, 140_000, 0.045, 165, 2.4, 13_800, {
                body: { Coupé: 0.57, Targa: 0.43 },
                gearbox: { Manual: 0.9, Automatik: 0.1 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#151619",
              }),
              v("S 2.4", [1971, 1973], 5094, 230_000, 0.05, 190, 2.4, 15_800, {
                body: { Coupé: 0.7, Targa: 0.3 },
                transmission: "4-/5-Gang Schaltgetriebe",
                color: "#efc11a",
              }),
              v("Carrera RS 2.7", [1972, 1973], 1525, 640_000, 0.06, 210, 2.7, 17_400, {
                tags: ["Leichtbau"],
                color: "#e9e8e1",
              }),
            ],
          },
          // Second generation with impact bumpers, model years 1974 (G series) to 1989; the 911 Turbo is its own model (930).
          {
            name: "G-Modell",
            years: [1973, 1989],
            shape: "classic911",
            variants: [
              v("2.7", [1973, 1977], 17017, 55_000, 0.035, 150, 2.7, 13_800, {
                body: { Coupé: 0.6, Targa: 0.4 },
                gearbox: { Manual: 0.92, Automatik: 0.08 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#b3121b",
              }),
              v("S 2.7", [1973, 1977], 17024, 62_000, 0.035, 175, 2.7, 15_300, {
                body: { Coupé: 0.65, Targa: 0.35 },
                gearbox: { Manual: 0.92, Automatik: 0.08 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#b7babe",
              }),
              v("Carrera 2.7", [1973, 1976], 2262, 220_000, 0.05, 210, 2.7, 19_000, {
                body: { Coupé: 0.72, Targa: 0.28 },
                transmission: "4-/5-Gang Schaltgetriebe",
                color: "#efc11a",
              }),
              v("Carrera 3.0", [1975, 1977], 3687, 115_000, 0.045, 200, 3.0, 23_000, {
                body: { Coupé: 0.7, Targa: 0.3 },
                gearbox: { Manual: 0.97, Automatik: 0.03 },
                transmission: "4-/5-Gang Schaltgetriebe / Sportomatic",
                color: "#741726",
              }),
              v("Carrera RS 3.0", [1974, 1974], 56, 1_600_000, 0.07, 230, 3.0, 33_000, {
                tags: ["Leichtbau"],
                color: "#e9e8e1",
              }),
              v("SC", [1977, 1983], 58914, 68_000, 0.035, 180, 3.0, 20_400, {
                body: { Coupé: 0.6, Targa: 0.33, Cabriolet: 0.07 },
                gearbox: { Manual: 0.97, Automatik: 0.03 },
                transmission: "5-Gang Schaltgetriebe / Sportomatic",
                color: "#1f3f8f",
              }),
              v("SC RS", [1984, 1984], 20, 2_000_000, 0.08, 250, 3.0, 95_000, {
                tags: ["Leichtbau"],
                color: "#e9e8e1",
              }),
              v("Carrera 3.2", [1983, 1989], 76473, 78_000, 0.035, 231, 3.2, 31_700, {
                body: { Coupé: 0.5, Targa: 0.25, Cabriolet: 0.25 },
                transmission: "5-Gang Schaltgetriebe (Typ 915, ab Modelljahr 1987 G50)",
                color: "#b3121b",
              }),
              v("Carrera 3.2 Clubsport", [1987, 1989], 340, 260_000, 0.06, 231, 3.2, 41_000, {
                tags: ["Leichtbau"],
                transmission: "5-Gang Schaltgetriebe (G50)",
                color: "#e9e8e1",
              }),
              v("Speedster", [1989, 1989], 2274, 175_000, 0.04, 231, 3.2, 56_200, {
                body: { Roadster: 1 },
                transmission: "5-Gang Schaltgetriebe (G50)",
                color: "#151619",
              }),
            ],
          },
          {
            name: "964",
            years: [1989, 1994],
            shape: "classic911",
            variants: [
              v("Carrera 2", [1989, 1994], 19484, 98_000, 0.052, 250, 3.6, 50_500, {
                body: { Coupé: 0.55, Cabriolet: 0.33, Targa: 0.12 },
                gearbox: { Manual: 0.8, Automatik: 0.2 },
                transmission: "5-Gang Schaltgetriebe / 4-Stufen Tiptronic",
                color: "#1f3f8f",
              }),
              v("Carrera 4", [1989, 1994], 13353, 91_000, 0.046, 250, 3.6, 58_900, {
                ...AWD,
                body: { Coupé: 0.62, Cabriolet: 0.28, Targa: 0.1 },
                color: "#b7babe",
              }),
              v("Carrera RS", [1992, 1994], 2282, 378_000, 0.108, 260, 3.6, 74_400, {
                tags: ["Leichtbau"],
                color: "#7a1f3d",
              }),
              v("Turbo", [1990, 1992], 3660, 236_000, 0.079, 320, 3.3, 100_500, {
                tags: ["Turbo"],
                color: "#b3121b",
              }),
              v("Speedster", [1993, 1994], 936, 214_000, 0.071, 250, 3.6, 66_000, {
                body: { Roadster: 1 },
                gearbox: { Manual: 0.86, Automatik: 0.14 },
                color: "#e9e8e1",
              }),
              v("Turbo S Leichtbau", [1992, 1992], 86, 1_150_000, 0.112, 381, 3.3, 150_800, {
                tags: ["Turbo", "Leichtbau"],
                color: "#b3121b",
              }),
              v("Carrera RS 3.8", [1993, 1993], 55, 1_350_000, 0.118, 300, 3.8, 115_000, {
                tags: ["Leichtbau"],
                transmission: "5-Gang Schaltgetriebe",
                color: "#efc11a",
              }),
              v("Turbo 3.6", [1993, 1994], 1437, 335_000, 0.088, 360, 3.6, 104_300, {
                tags: ["Turbo"],
                color: "#151619",
              }),
            ],
          },
          {
            name: "993",
            years: [1994, 1998],
            shape: "classic911",
            variants: [
              v("Carrera", [1994, 1998], 38626, 114_000, 0.061, 285, 3.6, 64_000, {
                body: { Coupé: 0.6, Cabriolet: 0.32, Targa: 0.08 },
                gearbox: { Manual: 0.76, Automatik: 0.24 },
                transmission: "6-Gang Schaltgetriebe / 4-Stufen Tiptronic S",
                color: "#1f3f8f",
              }),
              v("Carrera 4S", [1995, 1998], 6948, 164_000, 0.068, 285, 3.6, 76_000, { ...AWD, color: "#151619" }),
              v("Carrera RS", [1995, 1996], 1014, 346_000, 0.093, 300, 3.8, 82_000, {
                tags: ["Leichtbau"],
                color: "#efc11a",
              }),
              v("Turbo", [1995, 1998], 5978, 262_000, 0.084, 408, 3.6, 105_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                color: "#b7babe",
              }),
              v("Turbo S", [1997, 1998], 345, 720_000, 0.121, 450, 3.6, 155_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                color: "#efc11a",
              }),
              v("GT2", [1995, 1998], 57, 2_400_000, 0.135, 430, 3.6, 145_000, {
                tags: ["Turbo", "Leichtbau"],
                color: "#e9e8e1",
              }),
              v("Carrera 4", [1994, 1998], 4000, 108_000, 0.058, 285, 3.6, 68_000, {
                ...AWD,
                body: { Coupé: 0.65, Cabriolet: 0.35 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
              v("Targa", [1996, 1998], 4583, 118_000, 0.059, 285, 3.6, 69_500, {
                body: { Targa: 1 },
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "6-Gang Schaltgetriebe / 4-Stufen Tiptronic S",
                color: "#1f3f8f",
              }),
              v("Carrera S", [1997, 1998], 3714, 168_000, 0.066, 285, 3.6, 71_600, {
                gearbox: { Manual: 0.75, Automatik: 0.25 },
                transmission: "6-Gang Schaltgetriebe / 4-Stufen Tiptronic S",
                color: "#7d7f7a",
              }),
            ],
          },
          {
            name: "996.1",
            years: [1997, 2001],
            shape: "modern911",
            variants: [
              v("Carrera", [1997, 2001], 56733, 30_000, 0.045, 300, 3.4, 69_336, {
                body: { Coupé: 0.65, Cabriolet: 0.35 },
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#b7babe",
              }),
              v("Turbo", [2000, 2005], 20499, 79_000, 0.065, 420, 3.6, 120_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#151619",
              }),
              v("GT3", [1999, 2001], 1868, 158_000, 0.085, 360, 3.6, 91_777, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT2", [2001, 2005], 1287, 241_000, 0.089, 462, 3.6, 185_000, {
                tags: ["Turbo", "Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "996.2",
            years: [2001, 2005],
            shape: "modern911",
            variants: [
              v("Carrera", [2001, 2004], 35000, 38_000, 0.04, 320, 3.6, 73_000, {
                body: { Coupé: 0.62, Cabriolet: 0.38 },
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#b7babe",
              }),
              v("Carrera 4S", [2001, 2005], 23000, 48_000, 0.039, 320, 3.6, 93_000, {
                ...AWD,
                body: { Coupé: 0.6, Cabriolet: 0.4 },
                gearbox: { Manual: 0.65, Automatik: 0.35 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#7d7f7a",
              }),
              v("Targa", [2001, 2005], 5100, 42_000, 0.036, 320, 3.6, 87_000, {
                body: { Targa: 1 },
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#b7babe",
              }),
              v("Turbo S", [2004, 2005], 1500, 112_000, 0.052, 450, 3.6, 147_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                body: { Coupé: 0.6, Cabriolet: 0.4 },
                gearbox: { Manual: 0.4, Automatik: 0.6 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#151619",
              }),
              v("GT3", [2003, 2005], 2313, 140_000, 0.08, 381, 3.6, 102_112, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT3 RS", [2003, 2004], 682, 276_000, 0.097, 381, 3.6, 120_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
            ],
          },
          {
            name: "997.1",
            years: [2004, 2008],
            shape: "modern911",
            variants: [
              v("Carrera S", [2004, 2008], 41000, 55_000, 0.045, 355, 3.8, 86_900, {
                body: { Coupé: 0.65, Cabriolet: 0.3, Targa: 0.05 },
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#7d7f7a",
              }),
              v("Turbo", [2006, 2009], 19000, 88_000, 0.05, 480, 3.6, 133_603, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                body: { Coupé: 0.7, Cabriolet: 0.3 },
                gearbox: { Manual: 0.4, Automatik: 0.6 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#151619",
              }),
              v("GT3", [2006, 2008], 2378, 175_000, 0.095, 415, 3.6, 108_083, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT3 RS", [2006, 2008], 1900, 250_000, 0.1, 415, 3.6, 129_659, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#ee7a12",
              }),
              v("GT2", [2007, 2009], 1242, 285_000, 0.071, 530, 3.6, 189_000, {
                tags: ["Turbo", "Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "997.2",
            years: [2008, 2012],
            shape: "modern911",
            variants: [
              v("Carrera S", [2008, 2012], 15000, 76_000, 0.05, 385, 3.8, 94_000, {
                body: { Coupé: 0.65, Cabriolet: 0.3, Targa: 0.05 },
                gearbox: { Manual: 0.45, Automatik: 0.55 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#1f6fd0",
              }),
              v("Turbo", [2009, 2012], 9000, 105_000, 0.052, 500, 3.8, 145_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                body: { Coupé: 0.7, Cabriolet: 0.3 },
                gearbox: { Manual: 0.2, Automatik: 0.8 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Turbo S", [2010, 2012], 4000, 128_000, 0.048, 530, 3.8, 169_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                gearbox: { Automatik: 1 },
                transmission: "7-Gang PDK",
                color: "#151619",
              }),
              v("Sport Classic", [2009, 2010], 250, 340_000, 0.081, 408, 3.8, 201_000, {
                transmission: "6-Gang Schaltgetriebe",
                color: "#7d7f7a",
              }),
              v("Speedster", [2010, 2011], 356, 345_000, 0.076, 408, 3.8, 201_000, {
                body: { Roadster: 1 },
                gearbox: { Automatik: 1 },
                transmission: "7-Gang PDK",
                color: "#1f6fb5",
              }),
              v("GT3", [2009, 2011], 2200, 215_000, 0.1, 435, 3.8, 116_947, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT3 RS", [2009, 2011], 1500, 330_000, 0.105, 450, 3.8, 145_871, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT3 RS 4.0", [2011, 2011], 600, 545_000, 0.118, 500, 4.0, 179_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT2 RS", [2010, 2011], 500, 495_000, 0.102, 620, 3.6, 237_000, {
                tags: ["Turbo", "Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#151619",
              }),
            ],
          },
          {
            name: "991.1",
            years: [2011, 2015],
            shape: "modern911",
            variants: [
              v("Carrera S", [2011, 2015], 35000, 72_000, 0.035, 400, 3.8, 102_436, {
                body: { Coupé: 0.6, Cabriolet: 0.32, Targa: 0.08 },
                gearbox: { Manual: 0.25, Automatik: 0.75 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("Turbo S", [2013, 2015], 10000, 112_000, 0.025, 560, 3.8, 195_256, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                ...PDK,
                color: "#151619",
              }),
              v("50 Jahre Edition", [2013, 2014], 1963, 152_000, 0.058, 430, 3.8, 124_000, {
                gearbox: { Manual: 0.5, Automatik: 0.5 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#3b5a52",
              }),
              v("GT3", [2013, 2016], 2700, 132_000, 0.05, 475, 3.8, 137_303, { tags: ["Leichtbau"], ...PDK, color: "#3aa83a" }),
              v("GT3 RS", [2015, 2016], 4000, 188_000, 0.05, 500, 4.0, 181_690, { tags: ["Leichtbau"], ...PDK, color: "#ee7a12" }),
              v("R", [2016, 2016], 991, 341_000, 0.071, 500, 4.0, 190_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
            ],
          },
          {
            name: "991.2",
            years: [2015, 2019],
            shape: "modern911",
            variants: [
              v("Carrera S", [2015, 2019], 25000, 92_000, 0.04, 420, 3.0, 110_000, {
                body: { Coupé: 0.6, Cabriolet: 0.32, Targa: 0.08 },
                gearbox: { Manual: 0.25, Automatik: 0.75 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("Carrera T", [2017, 2019], 5000, 108_000, 0.041, 370, 3.0, 107_000, {
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#7d7f7a",
              }),
              v("Turbo S", [2016, 2019], 16000, 142_000, 0.032, 580, 3.8, 202_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                ...PDK,
                color: "#151619",
              }),
              v("Speedster", [2019, 2019], 1948, 335_000, 0.069, 510, 4.0, 269_000, {
                body: { Roadster: 1 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("GT3", [2017, 2019], 3200, 172_000, 0.065, 500, 4.0, 152_416, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("GT3 RS", [2018, 2019], 2400, 228_000, 0.06, 520, 4.0, 195_137, { tags: ["Leichtbau"], ...PDK, color: "#3aa83a" }),
              v("GT2 RS", [2017, 2019], 1000, 395_000, 0.061, 700, 3.8, 285_000, {
                tags: ["Turbo", "Leichtbau"],
                ...PDK,
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "992.1",
            years: [2019, 2024],
            shape: "modern911",
            variants: [
              v("Carrera S", [2019, 2024], 52000, 132_000, 0.015, 450, 3.0, 125_000, {
                body: { Coupé: 0.65, Cabriolet: 0.3, Targa: 0.05 },
                gearbox: { Manual: 0.12, Automatik: 0.88 },
                transmission: "7-Gang Schaltgetriebe / 8-Gang PDK",
                color: "#cfccc2",
              }),
              v("Carrera GTS", [2021, 2024], 15000, 148_000, 0.032, 480, 3.0, 148_000, {
                gearbox: { Manual: 0.2, Automatik: 0.8 },
                transmission: "7-Gang Schaltgetriebe / 8-Gang PDK",
                color: "#151619",
              }),
              v("Turbo S", [2020, 2024], 10000, 215_000, 0.028, 650, 3.7, 216_000, {
                ...AWD,
                tags: ["Turbo", "Allrad"],
                gearbox: { Automatik: 1 },
                transmission: "8-Gang PDK",
                color: "#b7babe",
              }),
              v("Sport Classic", [2022, 2023], 1250, 334_000, 0.062, 550, 3.7, 272_000, {
                tags: ["Turbo"],
                transmission: "7-Gang Schaltgetriebe",
                color: "#7d7f7a",
              }),
              v("Dakar", [2022, 2024], 2500, 264_000, 0.041, 480, 3.0, 223_000, { ...AWD, ...PDK, color: "#cfccc2" }),
              v("S/T", [2023, 2024], 1963, 468_000, 0.085, 525, 4.0, 292_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#5fc9a9",
              }),
              v("GT3", [2021, 2024], 9000, 206_000, 0.028, 510, 4.0, 167_000, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.3, Automatik: 0.7 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#5fc9a9",
              }),
              v("GT3 RS", [2022, null], 7500, 334_000, 0.046, 525, 4.0, 229_000, { tags: ["Leichtbau"], ...PDK, color: "#3aa83a" }),
            ],
          },
          {
            name: "992.2",
            years: [2024, null],
            shape: "modern911",
            variants: [
              v("Carrera S", [2025, null], 8000, 158_000, 0, 480, 3.0, 154_800, {
                body: { Coupé: 0.7, Cabriolet: 0.3 },
                ...PDK,
                transmission: "8-Gang PDK",
                color: "#7d7f7a",
              }),
              v("Carrera GTS", [2024, null], 9000, 172_000, 0, 541, 3.6, 170_600, {
                body: { Coupé: 0.65, Cabriolet: 0.25, Targa: 0.1 },
                tags: ["Hybrid"],
                ...PDK,
                transmission: "8-Gang PDK (T-Hybrid)",
                color: "#3b5a52",
              }),
              v("Turbo S", [2025, null], 3000, 285_000, 0, 711, 3.6, 271_000, {
                ...AWD,
                tags: ["Turbo", "Allrad", "Hybrid"],
                body: { Coupé: 0.65, Cabriolet: 0.35 },
                gearbox: { Automatik: 1 },
                transmission: "8-Gang PDK (T-Hybrid)",
                color: "#b7babe",
              }),
              v("GT3", [2025, null], 3000, 245_000, 0, 510, 4.0, 230_000, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.35, Automatik: 0.65 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#5fc9a9",
              }),
            ],
          },
        ],
      },
      {
        name: "356",
        category: "heck",
        featured: true,
        generations: [
          {
            name: "356",
            years: [1948, 1965],
            shape: "roadster",
            variants: [
              v("356 Pre-A Coupé", [1950, 1955], 7600, 185_000, 0.047, 55, 1.5, 7_000, {
                body: { Coupé: 0.8, Cabriolet: 0.2 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#7d7f7a",
              }),
              v("356 A Coupé", [1955, 1959], 21045, 136_000, 0.044, 60, 1.6, 9_500, {
                body: { Coupé: 0.74, Cabriolet: 0.26 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
              v("356 Speedster", [1954, 1958], 4145, 388_000, 0.056, 75, 1.6, 9_000, {
                body: { Roadster: 1 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("356 Carrera 2", [1962, 1964], 436, 950_000, 0.067, 130, 2.0, 15_000, {
                body: { Coupé: 0.7, Cabriolet: 0.3 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#b3121b",
              }),
              v("356 B Coupé", [1960, 1963], 30900, 98_000, 0.043, 60, 1.6, 9_000, {
                body: { Coupé: 0.72, Cabriolet: 0.2, Roadster: 0.08 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#1f3f8f",
              }),
              v("356 C Coupé", [1964, 1965], 16700, 112_000, 0.045, 75, 1.6, 9_500, {
                body: { Coupé: 0.8, Cabriolet: 0.2 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#cfccc2",
              }),
            ],
          },
        ],
      },
      {
        name: "912",
        category: "heck",
        featured: true,
        generations: [
          {
            name: "912",
            years: [1965, 1969],
            shape: "classic911",
            variants: [
              v("912 Coupé", [1965, 1969], 30300, 62_000, 0.052, 90, 1.6, 8_500, {
                body: { Coupé: 0.9, Targa: 0.1 },
                transmission: "4-/5-Gang Schaltgetriebe",
                color: "#cfccc2",
              }),
              v("912 E", [1976, 1976], 2092, 52_000, 0.046, 90, 2.0, 10_000, {
                transmission: "5-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
            ],
          },
        ],
      },
      {
        name: "930",
        category: "heck",
        featured: true,
        generations: [
          {
            name: "930",
            years: [1975, 1989],
            shape: "classic911",
            variants: [
              v("Turbo 3.0", [1975, 1977], 2850, 246_000, 0.071, 260, 3.0, 33_000, {
                tags: ["Turbo"],
                transmission: "4-Gang Schaltgetriebe",
                color: "#741726",
              }),
              v("Turbo 3.3", [1978, 1989], 17300, 176_000, 0.062, 300, 3.3, 47_000, {
                tags: ["Turbo"],
                body: { Coupé: 0.82, Cabriolet: 0.1, Targa: 0.08 },
                transmission: "4-/5-Gang Schaltgetriebe",
                color: "#151619",
              }),
              v("Turbo 3.3 Flachbau", [1981, 1989], 948, 421_000, 0.083, 330, 3.3, 77_000, {
                tags: ["Turbo"],
                transmission: "4-/5-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
            ],
          },
        ],
      },
      {
        name: "918",
        category: "super",
        featured: true,
        generations: [
          {
            name: "918",
            years: [2013, 2015],
            shape: "hyper",
            variants: [
              v("918 Spyder", [2013, 2015], 688, 1_560_000, 0.052, 887, 4.6, 768_000, {
                body: { Roadster: 1 },
                drive: "Allrad (AWD)",
                tags: ["Hybrid", "Allrad"],
                ...PDK,
                color: "#b7babe",
              }),
              v("918 Spyder Weissach", [2013, 2015], 230, 2_060_000, 0.071, 887, 4.6, 840_000, {
                body: { Roadster: 1 },
                drive: "Allrad (AWD)",
                tags: ["Hybrid", "Allrad", "Leichtbau"],
                ...PDK,
                color: "#e9e8e1",
              }),
            ],
          },
        ],
      },
      {
        name: "Carrera GT",
        category: "super",
        generations: [
          {
            name: "Carrera GT",
            years: [2003, 2007],
            shape: "hyper",
            variants: [
              v("Carrera GT", [2003, 2007], 1270, 1_340_000, 0.128, 612, 5.7, 452_000, {
                body: { Roadster: 1 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
            ],
          },
        ],
      },
      {
        name: "Boxster",
        category: "mittel",
        featured: true,
        generations: [
          {
            name: "986",
            years: [1996, 2004],
            shape: "roadster",
            variants: [
              v("Boxster", [1996, 2004], 109000, 16_000, 0.03, 204, 2.5, 39_100, {
                ...MID,
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "5-Gang Schaltgetriebe / 5-Gang Tiptronic",
                color: "#b7babe",
              }),
              v("Boxster S", [2000, 2004], 55000, 20_000, 0.035, 252, 3.2, 45_500, {
                ...MID,
                gearbox: { Manual: 0.75, Automatik: 0.25 },
                transmission: "6-Gang Schaltgetriebe / 5-Gang Tiptronic",
                color: "#151619",
              }),
              v("Boxster S 50 Jahre 550 Spyder", [2004, 2004], 1953, 38_000, 0.07, 266, 3.2, 57_600, {
                ...MID,
                gearbox: { Manual: 0.85, Automatik: 0.15 },
                transmission: "6-Gang Schaltgetriebe / 5-Gang Tiptronic",
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "987.1",
            years: [2004, 2008],
            shape: "roadster",
            variants: [
              v("Boxster", [2004, 2008], 40000, 19_000, 0.03, 240, 2.7, 42_000, {
                ...MID,
                gearbox: { Manual: 0.65, Automatik: 0.35 },
                transmission: "5-Gang Schaltgetriebe / 5-Gang Tiptronic S",
                color: "#b7babe",
              }),
              v("Boxster S", [2004, 2008], 35000, 24_000, 0.035, 280, 3.2, 51_000, {
                ...MID,
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "6-Gang Schaltgetriebe / 5-Gang Tiptronic S",
                color: "#1f3f8f",
              }),
              v("Boxster RS 60 Spyder", [2008, 2008], 1960, 45_000, 0.07, 303, 3.4, 61_600, {
                ...MID,
                gearbox: { Manual: 0.8, Automatik: 0.2 },
                transmission: "6-Gang Schaltgetriebe / 5-Gang Tiptronic S",
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "987.2",
            years: [2008, 2012],
            shape: "roadster",
            variants: [
              v("Boxster", [2008, 2012], 20000, 27_000, 0.035, 255, 2.9, 46_900, {
                ...MID,
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("Boxster S", [2008, 2012], 15000, 34_000, 0.04, 310, 3.4, 57_000, {
                ...MID,
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Boxster S Black Edition", [2011, 2011], 987, 48_000, 0.06, 320, 3.4, 64_000, {
                ...MID,
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Boxster Spyder", [2010, 2012], 2000, 78_000, 0.075, 320, 3.4, 63_400, {
                ...MID,
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#e9e8e1",
              }),
            ],
          },
          {
            name: "981",
            years: [2012, 2016],
            shape: "roadster",
            variants: [
              v("Boxster", [2012, 2016], 35000, 38_000, 0.035, 265, 2.7, 48_300, {
                ...MID,
                gearbox: { Manual: 0.5, Automatik: 0.5 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#cfccc2",
              }),
              v("Boxster S", [2012, 2016], 25000, 46_000, 0.04, 315, 3.4, 60_000, {
                ...MID,
                gearbox: { Manual: 0.45, Automatik: 0.55 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#1f3f8f",
              }),
              v("Boxster GTS", [2014, 2016], 6000, 62_000, 0.05, 330, 3.4, 73_000, {
                ...MID,
                gearbox: { Manual: 0.45, Automatik: 0.55 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Boxster Spyder", [2015, 2016], 2400, 118_000, 0.065, 375, 3.8, 79_900, {
                ...MID,
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b3121b",
              }),
            ],
          },
        ],
      },
      {
        name: "Cayman",
        category: "mittel",
        featured: true,
        generations: [
          {
            name: "987.1",
            years: [2005, 2008],
            shape: "wedge",
            variants: [
              v("Cayman", [2006, 2008], 25000, 22_000, 0.03, 245, 2.7, 50_000, {
                gearbox: { Manual: 0.65, Automatik: 0.35 },
                transmission: "5-Gang Schaltgetriebe / 5-Gang Tiptronic S",
                color: "#b7babe",
              }),
              v("Cayman S", [2005, 2008], 30000, 26_000, 0.035, 295, 3.4, 58_500, {
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "6-Gang Schaltgetriebe / 5-Gang Tiptronic S",
                color: "#b7babe",
              }),
            ],
          },
          {
            name: "987.2",
            years: [2009, 2012],
            shape: "wedge",
            variants: [
              v("Cayman", [2009, 2012], 12000, 30_000, 0.035, 265, 2.9, 51_000, {
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Cayman S", [2009, 2012], 12000, 38_000, 0.04, 320, 3.4, 62_000, {
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b3121b",
              }),
              v("Cayman R", [2011, 2012], 2500, 78_000, 0.07, 330, 3.4, 66_100, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.75, Automatik: 0.25 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#3aa83a",
              }),
            ],
          },
          {
            name: "981",
            years: [2013, 2016],
            shape: "wedge",
            variants: [
              v("Cayman", [2013, 2016], 20000, 42_000, 0.035, 275, 2.7, 51_400, {
                gearbox: { Manual: 0.5, Automatik: 0.5 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b3121b",
              }),
              v("Cayman S", [2013, 2016], 15000, 52_000, 0.04, 325, 3.4, 64_100, {
                gearbox: { Manual: 0.45, Automatik: 0.55 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("Cayman GTS", [2014, 2016], 5000, 70_000, 0.05, 340, 3.4, 77_000, {
                gearbox: { Manual: 0.45, Automatik: 0.55 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#151619",
              }),
              v("Cayman GT4", [2015, 2016], 2500, 112_000, 0.06, 385, 3.8, 85_800, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b3121b",
              }),
            ],
          },
        ],
      },
      {
        name: "718",
        category: "mittel",
        featured: true,
        generations: [
          {
            // Type 982: Boxster and Cayman marketed together as the 718 series.
            name: "718",
            years: [2016, 2025],
            shape: "wedge",
            variants: [
              v("718 Boxster", [2016, 2025], 40000, 52_000, 0.03, 300, 2.0, 53_600, {
                ...MID,
                shape: "roadster",
                tags: ["Turbo"],
                gearbox: { Manual: 0.35, Automatik: 0.65 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#efc11a",
              }),
              v("718 Boxster S", [2016, 2025], 25000, 60_000, 0.03, 350, 2.5, 66_100, {
                ...MID,
                shape: "roadster",
                tags: ["Turbo"],
                gearbox: { Manual: 0.3, Automatik: 0.7 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#1f3f8f",
              }),
              v("718 Boxster GTS 4.0", [2020, 2025], 8000, 98_000, 0.05, 400, 4.0, 91_800, {
                ...MID,
                shape: "roadster",
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#7d7f7a",
              }),
              v("718 Boxster 25 Jahre", [2021, 2021], 1250, 115_000, 0.06, 400, 4.0, 97_600, {
                ...MID,
                shape: "roadster",
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("718 Spyder", [2019, 2023], 5000, 125_000, 0.06, 420, 4.0, 93_400, {
                ...MID,
                shape: "roadster",
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#7d7f7a",
              }),
              v("718 Spyder RS", [2023, 2025], 3000, 210_000, 0.05, 500, 4.0, 161_500, {
                ...MID,
                shape: "roadster",
                tags: ["Leichtbau"],
                ...PDK,
                color: "#b3121b",
              }),
              v("718 Cayman", [2016, 2025], 35000, 52_000, 0.03, 300, 2.0, 51_600, {
                tags: ["Turbo"],
                gearbox: { Manual: 0.35, Automatik: 0.65 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b3121b",
              }),
              v("718 Cayman S", [2016, 2025], 20000, 60_000, 0.03, 350, 2.5, 64_100, {
                tags: ["Turbo"],
                gearbox: { Manual: 0.3, Automatik: 0.7 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#1f6fd0",
              }),
              v("718 Cayman GTS 4.0", [2020, 2025], 8000, 95_000, 0.05, 400, 4.0, 89_000, {
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#7d7f7a",
              }),
              v("718 Cayman GT4", [2019, 2023], 8000, 120_000, 0.05, 420, 4.0, 96_200, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.65, Automatik: 0.35 },
                transmission: "6-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("718 Cayman GT4 RS", [2021, 2025], 6000, 215_000, 0.05, 500, 4.0, 141_000, {
                tags: ["Leichtbau"],
                ...PDK,
                color: "#7d7f7a",
              }),
            ],
          },
        ],
      },
      {
        name: "959",
        category: "super",
        generations: [
          {
            name: "959",
            years: [1986, 1988],
            shape: "classic911",
            variants: [
              v("959 Komfort", [1986, 1988], 263, 2_050_000, 0.094, 450, 2.85, 210_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
              v("959 Sport", [1987, 1988], 29, 3_600_000, 0.112, 515, 2.85, 225_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad", "Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
              }),
            ],
          },
        ],
      },
      // Motorsport: race cars Porsche sold to customer teams and collectors. Factory-only cars and one-offs
      // (936, 919 Hybrid, 911 RSR works cars) are left out as they have no market.
      {
        name: "Rennsportwagen",
        category: "motorsport",
        generations: [
          {
            name: "550 bis RS 60",
            years: [1953, 1960],
            shape: "roadster",
            variants: [
              v("550 Spyder", [1953, 1956], 89, 4_200_000, 0.058, 110, 1.5, 12_600, { ...SPYDER, ...race(), color: "#b7babe" }),
              v("550 A Spyder", [1956, 1957], 40, 4_600_000, 0.06, 135, 1.5, 12_800, { ...SPYDER, ...race(), color: "#b7babe" }),
              v("718 RSK", [1957, 1959], 34, 4_100_000, 0.055, 148, 1.5, 15_300, { ...SPYDER, ...race(), color: "#b7babe" }),
              v("718 RS 60", [1960, 1960], 14, 5_200_000, 0.06, 160, 1.6, 16_400, { ...SPYDER, ...race(), color: "#b7babe" }),
            ],
          },
          {
            name: "904 bis 917",
            years: [1963, 1973],
            shape: "hyper",
            variants: [
              v("904 Carrera GTS", [1963, 1965], 106, 2_300_000, 0.065, 180, 2.0, 15_200, { ...race(), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("906 Carrera 6", [1966, 1966], 65, 2_000_000, 0.06, 210, 2.0, 23_000, { ...race(), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("910", [1967, 1967], 29, 2_600_000, 0.058, 220, 2.0, 25_600, { ...race(), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("908/02 Spyder", [1969, 1969], 28, 3_400_000, 0.062, 350, 3.0, 61_000, { ...race(), body: { Roadster: 1 }, transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("908/03 Spyder", [1970, 1971], 13, 4_300_000, 0.066, 370, 3.0, 66_000, { ...race(), body: { Roadster: 1 }, transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("917 K", [1969, 1971], 25, 15_000_000, 0.07, 600, 4.9, 71_600, { ...race(), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("917/10", [1971, 1973], 13, 4_800_000, 0.06, 850, 5.0, 153_000, { ...race("Turbo"), body: { Roadster: 1 }, transmission: "4-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("917/30", [1973, 1973], 6, 9_500_000, 0.065, 1100, 5.4, 205_000, { ...race("Turbo"), body: { Roadster: 1 }, transmission: "4-Gang Schaltgetriebe", color: "#e9e8e1" }),
            ],
          },
          {
            name: "956 bis 911 GT1",
            years: [1982, 1998],
            shape: "hyper",
            variants: [
              v("956", [1982, 1984], 28, 9_000_000, 0.072, 620, 2.65, 322_000, { ...race("Turbo"), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("962", [1984, 1991], 91, 3_800_000, 0.068, 680, 3.0, 409_000, { ...race("Turbo"), transmission: "5-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("911 GT1", [1996, 1998], 10, 7_500_000, 0.074, 600, 3.2, 900_000, { ...race("Turbo"), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
            ],
          },
          {
            name: "RS Spyder und 963",
            years: [2005, null],
            shape: "hyper",
            variants: [
              v("RS Spyder", [2005, 2010], 16, 3_200_000, 0.055, 503, 3.4, 1_100_000, { ...race(), body: { Roadster: 1 }, transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("963", [2023, null], 21, 2_900_000, -0.02, 680, 4.6, 2_800_000, { ...race("Turbo", "Hybrid"), transmission: "7-Gang sequenziell", color: "#e9e8e1" }),
            ],
          },
        ],
      },
      {
        name: "GT-Rennwagen",
        category: "motorsport",
        generations: [
          {
            name: "356 bis Carrera RSR",
            years: [1960, 1974],
            shape: "classic911",
            variants: [
              v("356 B Carrera GTL Abarth", [1960, 1961], 21, 2_300_000, 0.06, 135, 1.6, 12_800, { ...race(), shape: "roadster", transmission: "4-Gang Schaltgetriebe", color: "#b7babe" }),
              v("911 R", [1967, 1967], 19, 2_500_000, 0.065, 210, 2.0, 23_000, { ...race("Leichtbau"), color: "#e9e8e1" }),
              v("911 Carrera RSR 2.8", [1973, 1973], 55, 2_600_000, 0.07, 300, 2.8, 25_000, { ...race("Leichtbau"), color: "#e9e8e1" }),
              v("911 Carrera RSR 3.0", [1974, 1974], 42, 2_200_000, 0.066, 330, 3.0, 33_200, { ...race("Leichtbau"), color: "#e9e8e1" }),
            ],
          },
          {
            name: "934 bis 964 RSR",
            years: [1976, 1993],
            shape: "classic911",
            variants: [
              v("934", [1976, 1976], 31, 2_000_000, 0.07, 485, 3.0, 55_200, { ...race("Turbo"), transmission: "4-Gang Schaltgetriebe", color: "#efc11a" }),
              v("935", [1977, 1979], 37, 3_200_000, 0.072, 590, 2.85, 153_000, { ...race("Turbo"), transmission: "4-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("924 Carrera GTR", [1981, 1981], 17, 650_000, 0.06, 375, 2.0, 56_000, { ...race("Turbo"), shape: "gt", drive: "Frontmotor, Transaxle (RWD)", color: "#e9e8e1" }),
              v("964 Carrera RSR 3.8", [1993, 1993], 51, 1_400_000, 0.075, 325, 3.8, 138_000, { ...race("Leichtbau"), color: "#efc11a" }),
            ],
          },
          {
            name: "996 bis 992",
            years: [2004, null],
            shape: "modern911",
            variants: [
              v("911 GT3 RSR (996)", [2004, 2005], 41, 650_000, 0.05, 445, 3.6, 330_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 RSR (997)", [2007, 2012], 60, 600_000, 0.045, 465, 4.0, 400_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 R (997)", [2010, 2012], 60, 380_000, 0.04, 500, 4.0, 300_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 R (991)", [2016, 2018], 120, 380_000, 0.02, 500, 4.0, 429_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("935 (2018)", [2019, 2019], 77, 1_700_000, 0.08, 700, 3.8, 702_000, { ...race("Turbo"), ...PDK, color: "#e9e8e1" }),
              v("911 GT2 RS Clubsport", [2019, 2019], 200, 650_000, 0.05, 700, 3.8, 405_000, { ...race("Turbo"), ...PDK, color: "#e9e8e1" }),
              v("911 GT3 R (992)", [2023, null], 100, 520_000, 0, 565, 4.2, 511_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
            ],
          },
        ],
      },
      {
        name: "Cup und Clubsport",
        category: "motorsport",
        generations: [
          {
            name: "Cup und Clubsport",
            years: [1986, null],
            shape: "modern911",
            variants: [
              v("944 Turbo Cup", [1986, 1988], 192, 90_000, 0.06, 220, 2.5, 38_000, { ...race("Turbo"), shape: "gt", drive: "Frontmotor, Transaxle (RWD)", color: "#e9e8e1" }),
              v("911 Carrera Cup (964)", [1990, 1994], 285, 290_000, 0.08, 260, 3.6, 65_000, { ...race(), shape: "classic911", color: "#e9e8e1" }),
              v("911 Cup 3.8 (993)", [1994, 1998], 186, 240_000, 0.07, 315, 3.8, 84_000, { ...race(), shape: "classic911", transmission: "6-Gang Schaltgetriebe", color: "#e9e8e1" }),
              v("911 GT3 Cup (996)", [1998, 2005], 873, 110_000, 0.05, 390, 3.6, 140_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 Cup (997)", [2005, 2013], 1485, 140_000, 0.04, 450, 3.8, 160_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 Cup (991)", [2013, 2019], 1500, 170_000, 0.02, 485, 4.0, 190_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("911 GT3 Cup (992)", [2021, null], 1000, 250_000, 0.01, 510, 4.0, 225_000, { ...race(), transmission: "6-Gang sequenziell", color: "#e9e8e1" }),
              v("Cayman GT4 Clubsport (981)", [2016, 2016], 421, 120_000, 0.03, 385, 3.8, 158_000, { ...race(), shape: "wedge", drive: "Mittelmotor, Heck (RWD)", transmission: "6-Gang PDK", gearbox: { Automatik: 1 }, color: "#e9e8e1" }),
              v("718 Cayman GT4 Clubsport", [2019, 2021], 500, 140_000, 0.02, 425, 3.8, 157_000, { ...race(), shape: "wedge", drive: "Mittelmotor, Heck (RWD)", transmission: "6-Gang PDK", gearbox: { Automatik: 1 }, color: "#e9e8e1" }),
              v("718 Cayman GT4 RS Clubsport", [2022, null], 300, 230_000, 0.01, 500, 4.0, 268_000, { ...race(), shape: "wedge", drive: "Mittelmotor, Heck (RWD)", ...PDK, color: "#e9e8e1" }),
            ],
          },
        ],
      },
    ],
  },
];
