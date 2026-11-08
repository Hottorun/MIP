import type { Brand, CarShape, VariantSeed } from "./types";

type GenerationDef = { name: string; years: [number, number | null]; shape: CarShape; variants: VariantSeed[] };
type ModelDef = { name: string; featured?: boolean; generations: GenerationDef[] };
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
        featured: true,
        generations: [
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
              v("Turbo", [1990, 1994], 5097, 236_000, 0.079, 320, 3.3, 100_500, {
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
            name: "996",
            years: [1997, 2005],
            shape: "modern911",
            variants: [
              v("Carrera", [1997, 2005], 56733, 36_000, 0.041, 300, 3.4, 77_000, {
                body: { Coupé: 0.62, Cabriolet: 0.34, Targa: 0.04 },
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / 5-Stufen Tiptronic S",
                color: "#b7babe",
              }),
              v("Turbo", [2000, 2005], 20499, 79_000, 0.065, 420, 3.6, 120_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                color: "#151619",
              }),
              v("GT3", [1999, 2005], 4181, 146_000, 0.083, 381, 3.6, 102_000, { tags: ["Leichtbau"], color: "#e9e8e1" }),
              v("GT3 RS", [2003, 2004], 682, 276_000, 0.097, 381, 3.6, 120_000, { tags: ["Leichtbau"], color: "#e9e8e1" }),
              v("GT2", [2001, 2005], 1287, 241_000, 0.089, 462, 3.6, 185_000, {
                tags: ["Turbo", "Leichtbau"],
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
            ],
          },
          {
            name: "997",
            years: [2004, 2012],
            shape: "modern911",
            variants: [
              v("Carrera S", [2004, 2012], 41059, 62_000, 0.045, 355, 3.8, 90_000, {
                body: { Coupé: 0.65, Cabriolet: 0.3, Targa: 0.05 },
                gearbox: { Manual: 0.55, Automatik: 0.45 },
                transmission: "6-Gang Schaltgetriebe / Tiptronic S / PDK",
                color: "#1f6fd0",
              }),
              v("Turbo", [2006, 2012], 22000, 97_000, 0.052, 480, 3.6, 136_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                gearbox: { Manual: 0.4, Automatik: 0.6 },
                color: "#151619",
              }),
              v("GT3", [2006, 2012], 4600, 192_000, 0.099, 435, 3.8, 108_000, { tags: ["Leichtbau"], color: "#e9e8e1" }),
              v("GT3 RS", [2006, 2011], 3000, 286_000, 0.104, 450, 3.8, 136_000, { tags: ["Leichtbau"], color: "#ee7a12" }),
              v("GT3 RS 4.0", [2011, 2011], 600, 545_000, 0.118, 500, 4.0, 179_000, { tags: ["Leichtbau"], color: "#e9e8e1" }),
              v("GT2 RS", [2010, 2011], 500, 495_000, 0.102, 620, 3.6, 237_000, {
                tags: ["Turbo", "Leichtbau"],
                color: "#151619",
              }),
              v("GT2", [2007, 2009], 1242, 285_000, 0.071, 530, 3.6, 189_000, {
                tags: ["Turbo", "Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#b7babe",
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
            ],
          },
          {
            name: "991",
            years: [2011, 2019],
            shape: "modern911",
            variants: [
              v("Carrera S", [2011, 2019], 60000, 82_000, 0.038, 420, 3.0, 108_000, {
                body: { Coupé: 0.6, Cabriolet: 0.32, Targa: 0.08 },
                gearbox: { Manual: 0.25, Automatik: 0.75 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#b7babe",
              }),
              v("GT3", [2013, 2019], 5900, 158_000, 0.064, 500, 4.0, 140_000, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.35, Automatik: 0.65 },
                color: "#3aa83a",
              }),
              v("GT3 RS", [2015, 2019], 6400, 206_000, 0.058, 520, 4.0, 196_000, { tags: ["Leichtbau"], ...PDK, color: "#ee7a12" }),
              v("R", [2016, 2016], 991, 341_000, 0.071, 500, 4.0, 190_000, { tags: ["Leichtbau"], color: "#e9e8e1" }),
              v("Turbo S", [2013, 2019], 26000, 134_000, 0.031, 580, 3.8, 196_000, {
                drive: "Allrad (AWD)",
                tags: ["Turbo", "Allrad"],
                ...PDK,
                color: "#151619",
              }),
              v("GT2 RS", [2017, 2019], 1000, 395_000, 0.061, 700, 3.8, 285_000, {
                tags: ["Turbo", "Leichtbau"],
                ...PDK,
                color: "#b7babe",
              }),
              v("50 Jahre Edition", [2013, 2014], 1963, 152_000, 0.058, 430, 3.8, 124_000, {
                gearbox: { Manual: 0.5, Automatik: 0.5 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#3b5a52",
              }),
              v("Carrera T", [2017, 2019], 5000, 108_000, 0.041, 370, 3.0, 107_000, {
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "7-Gang Schaltgetriebe / 7-Gang PDK",
                color: "#7d7f7a",
              }),
              v("Speedster", [2019, 2019], 1948, 335_000, 0.069, 510, 4.0, 269_000, {
                body: { Roadster: 1 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#e9e8e1",
              }),
            ],
          },
          {
            name: "992",
            years: [2019, null],
            shape: "modern911",
            variants: [
              v("Carrera S", [2019, null], 52000, 132_000, 0.015, 450, 3.0, 125_000, {
                body: { Coupé: 0.65, Cabriolet: 0.3, Targa: 0.05 },
                gearbox: { Manual: 0.12, Automatik: 0.88 },
                transmission: "7-Gang Schaltgetriebe / 8-Gang PDK",
                color: "#cfccc2",
              }),
              v("GT3", [2021, null], 9000, 206_000, 0.028, 510, 4.0, 167_000, {
                tags: ["Leichtbau"],
                gearbox: { Manual: 0.3, Automatik: 0.7 },
                color: "#5fc9a9",
              }),
              v("GT3 RS", [2022, null], 7500, 334_000, 0.046, 525, 4.0, 229_000, { tags: ["Leichtbau"], ...PDK, color: "#3aa83a" }),
              v("S/T", [2023, 2024], 1963, 468_000, 0.085, 525, 4.0, 292_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang Schaltgetriebe",
                color: "#5fc9a9",
              }),
              v("Sport Classic", [2022, 2023], 1250, 334_000, 0.062, 550, 3.7, 272_000, {
                tags: ["Turbo"],
                transmission: "7-Gang Schaltgetriebe",
                color: "#7d7f7a",
              }),
              v("Dakar", [2022, 2024], 2500, 264_000, 0.041, 480, 3.0, 223_000, { ...AWD, ...PDK, color: "#cfccc2" }),
              v("Carrera GTS", [2021, 2024], 15000, 148_000, 0.032, 480, 3.0, 148_000, {
                gearbox: { Manual: 0.2, Automatik: 0.8 },
                transmission: "7-Gang Schaltgetriebe / 8-Gang PDK",
                color: "#151619",
              }),
              v("Turbo S", [2020, 2024], 10000, 215_000, 0.028, 650, 3.7, 216_000, { ...AWD, tags: ["Turbo", "Allrad"], gearbox: { Automatik: 1 }, transmission: "8-Gang PDK", color: "#b7babe" }),
            ],
          },
        ],
      },
      {
        name: "356",
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
        name: "959",
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
    ],
  },
];
