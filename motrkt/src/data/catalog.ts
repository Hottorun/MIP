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
  ferrari: [
    { name: "Rosso Corsa", hex: "#c0121f" },
    { name: "Giallo Modena", hex: "#f2c00e" },
    { name: "Nero Daytona", hex: "#131417" },
    { name: "Argento Nürburgring", hex: "#a8abaf" },
    { name: "Blu Tour de France", hex: "#1c2f5e" },
    { name: "Rosso Barchetta", hex: "#7c1520" },
    { name: "Bianco Avus", hex: "#ebeae6" },
  ],
  lamborghini: [
    { name: "Verde Ithaca", hex: "#7fb52b" },
    { name: "Giallo Fly", hex: "#f4d018" },
    { name: "Arancio Borealis", hex: "#ee7a12" },
    { name: "Bianco Polo", hex: "#eeeeea" },
    { name: "Rosso Siviglia", hex: "#a0151c" },
    { name: "Nero Pegaso", hex: "#121316" },
    { name: "Blu Le Mans", hex: "#203c8c" },
  ],
  mercedes: [
    { name: "Silbergrau metallic", hex: "#9da1a7" },
    { name: "Blauschwarz", hex: "#1b2433" },
    { name: "Almandinrot", hex: "#6c1a22" },
    { name: "Arktikweiß", hex: "#ebeae6" },
    { name: "Brillantsilber", hex: "#c2c5c9" },
    { name: "Fantasiablau", hex: "#2c3f63" },
  ],
  bmw: [
    { name: "Alpinweiß", hex: "#eeede8" },
    { name: "Henna-Rot", hex: "#a41a1f" },
    { name: "Diamantschwarz", hex: "#1a1b20" },
    { name: "Laguna-Seca-Blau", hex: "#2c6ac3" },
    { name: "Macaoblau", hex: "#25336b" },
    { name: "Silbergrau", hex: "#a6a9ad" },
  ],
  astonmartin: [
    { name: "Silver Birch", hex: "#b6b8b3" },
    { name: "Dubonnet Rosso", hex: "#5d1420" },
    { name: "British Racing Green", hex: "#1f4733" },
    { name: "Midnight Blue", hex: "#1a2440" },
  ],
  jaguar: [
    { name: "Opalescent Dark Blue", hex: "#21314f" },
    { name: "Carmen Red", hex: "#a01b1f" },
    { name: "Old English White", hex: "#ebe4d2" },
    { name: "British Racing Green", hex: "#1f4733" },
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
                options: [
                  "Schaltgetriebe (Serie)|std",
                  "Sportsitze (Serie)|std",
                  "Leichtbau-Ausstattung (RS-spezifisch)|std",
                  "Clubsport-Paket (selten)|0.16",
                  "Farbsonderwunsch (z. B. Rubinstern, Speedgelb)|0.07",
                  "Touring-Ausstattung (Komfortsitze, el. Fensterheber)|-0.03",
                ],
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
  {
    id: "ferrari",
    name: "Ferrari",
    country: "IT",
    color: "#e0b43a",
    featured: true,
    models: [
      {
        name: "F40",
        featured: true,
        generations: [
          {
            name: "F40",
            years: [1987, 1992],
            shape: "wedge",
            variants: [
              v("F40", [1987, 1992], 1315, 2_650_000, 0.118, 478, 2.9, 227_000, {
                tags: ["Turbo", "Leichtbau"],
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
      {
        name: "Testarossa",
        featured: true,
        generations: [
          {
            name: "Testarossa",
            years: [1984, 1996],
            shape: "wedge",
            variants: [
              v("Testarossa", [1984, 1991], 7177, 146_000, 0.068, 390, 4.9, 115_000, { color: "#c0121f" }),
              v("512 TR", [1991, 1994], 2261, 186_000, 0.072, 428, 4.9, 140_000, { color: "#131417" }),
              v("F512 M", [1994, 1996], 501, 412_000, 0.089, 440, 4.9, 165_000, { color: "#f2c00e" }),
            ],
          },
        ],
      },
      {
        name: "288 GTO",
        featured: true,
        generations: [
          {
            name: "288 GTO",
            years: [1984, 1987],
            shape: "wedge",
            variants: [
              v("288 GTO", [1984, 1987], 272, 3_900_000, 0.081, 400, 2.9, 165_000, {
                tags: ["Turbo"],
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
      {
        name: "F355",
        featured: true,
        generations: [
          {
            name: "F355",
            years: [1994, 1999],
            shape: "wedge",
            variants: [
              v("F355 Berlinetta", [1994, 1999], 4871, 141_000, 0.074, 380, 3.5, 115_000, {
                gearbox: { Manual: 0.85, Automatik: 0.15 },
                transmission: "6-Gang Schaltgetriebe / F1",
                color: "#f2c00e",
              }),
              v("F355 Spider", [1995, 1999], 3717, 126_000, 0.066, 380, 3.5, 125_000, {
                body: { Cabriolet: 1 },
                gearbox: { Manual: 0.8, Automatik: 0.2 },
                transmission: "6-Gang Schaltgetriebe / F1",
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
      {
        name: "550",
        featured: true,
        generations: [
          {
            name: "550",
            years: [1996, 2002],
            shape: "gt",
            variants: [
              v("550 Maranello", [1996, 2002], 3083, 166_000, 0.072, 485, 5.5, 175_000, {
                transmission: "6-Gang Schaltgetriebe",
                color: "#1c2f5e",
              }),
              v("550 Barchetta Pininfarina", [2000, 2001], 448, 522_000, 0.081, 485, 5.5, 230_000, {
                body: { Roadster: 1 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#a8abaf",
              }),
            ],
          },
        ],
      },
      {
        name: "308",
        generations: [
          {
            name: "308",
            years: [1975, 1985],
            shape: "wedge",
            variants: [
              v("308 GTB Vetroresina", [1975, 1977], 712, 166_000, 0.061, 255, 2.9, 30_000, { color: "#c0121f" }),
              v("308 GTS Quattrovalvole", [1982, 1985], 3042, 98_000, 0.055, 240, 2.9, 45_000, {
                body: { Targa: 1 },
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
      {
        name: "360",
        generations: [
          {
            name: "360",
            years: [1999, 2005],
            shape: "wedge",
            variants: [
              v("360 Modena", [1999, 2005], 8800, 82_000, 0.042, 400, 3.6, 135_000, {
                gearbox: { Manual: 0.3, Automatik: 0.7 },
                transmission: "6-Gang Schaltgetriebe / F1",
                color: "#a8abaf",
              }),
              v("360 Challenge Stradale", [2003, 2004], 1288, 296_000, 0.087, 425, 3.6, 172_000, {
                tags: ["Leichtbau"],
                gearbox: { Automatik: 1 },
                transmission: "6-Gang F1",
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
      {
        name: "Enzo",
        generations: [
          {
            name: "Enzo",
            years: [2002, 2004],
            shape: "hyper",
            variants: [
              v("Enzo", [2002, 2004], 400, 4_300_000, 0.101, 660, 6.0, 660_000, {
                gearbox: { Automatik: 1 },
                transmission: "6-Gang F1",
                color: "#c0121f",
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "lamborghini",
    name: "Lamborghini",
    country: "IT",
    color: "#c9a447",
    featured: true,
    models: [
      {
        name: "Miura",
        featured: true,
        generations: [
          {
            name: "Miura",
            years: [1966, 1973],
            shape: "wedge",
            variants: [
              v("P400", [1966, 1969], 275, 1_450_000, 0.058, 350, 3.9, 40_000, { color: "#ee7a12" }),
              v("P400 S", [1968, 1971], 338, 1_760_000, 0.064, 370, 3.9, 42_000, { color: "#7fb52b" }),
              v("P400 SV", [1971, 1973], 150, 2_850_000, 0.079, 385, 3.9, 45_000, { color: "#f4d018" }),
            ],
          },
        ],
      },
      {
        name: "Countach",
        featured: true,
        generations: [
          {
            name: "Countach",
            years: [1974, 1990],
            shape: "wedge",
            variants: [
              v("LP400 Periscopio", [1974, 1977], 157, 1_460_000, 0.088, 375, 3.9, 50_000, { color: "#7fb52b" }),
              v("LP5000 Quattrovalvole", [1985, 1988], 610, 562_000, 0.074, 455, 5.2, 110_000, { color: "#c0121f" }),
              v("25th Anniversary", [1988, 1990], 658, 466_000, 0.069, 455, 5.2, 125_000, { color: "#eeeeea" }),
            ],
          },
        ],
      },
      {
        name: "Diablo",
        featured: true,
        generations: [
          {
            name: "Diablo",
            years: [1990, 2001],
            shape: "wedge",
            variants: [
              v("Diablo VT", [1993, 1998], 1000, 281_000, 0.066, 492, 5.7, 190_000, { ...AWD, color: "#a0151c" }),
              v("Diablo SV", [1995, 1999], 186, 362_000, 0.081, 510, 5.7, 180_000, { color: "#f4d018" }),
              v("Diablo GT", [1999, 2000], 80, 1_150_000, 0.102, 575, 6.0, 300_000, { tags: ["Leichtbau"], color: "#ee7a12" }),
            ],
          },
        ],
      },
      {
        name: "Murciélago",
        featured: true,
        generations: [
          {
            name: "Murciélago",
            years: [2001, 2010],
            shape: "wedge",
            variants: [
              v("LP640 Coupé", [2006, 2010], 1400, 286_000, 0.048, 640, 6.5, 250_000, {
                ...AWD,
                gearbox: { Manual: 0.08, Automatik: 0.92 },
                transmission: "6-Gang e-gear / Schaltgetriebe",
                color: "#121316",
              }),
              v("LP670-4 SuperVeloce", [2009, 2010], 186, 640_000, 0.084, 670, 6.5, 380_000, {
                ...AWD,
                gearbox: { Automatik: 1 },
                transmission: "6-Gang e-gear",
                color: "#ee7a12",
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "mercedes",
    name: "Mercedes-Benz",
    country: "DE",
    color: "#b9bec6",
    featured: true,
    models: [
      {
        name: "SL",
        featured: true,
        generations: [
          {
            name: "W198",
            years: [1954, 1963],
            shape: "gt",
            variants: [
              v("300 SL Flügeltürer", [1954, 1957], 1400, 1_460_000, 0.041, 215, 3.0, 14_800, {
                transmission: "4-Gang Schaltgetriebe",
                color: "#9da1a7",
              }),
              v("300 SL Roadster", [1957, 1963], 1858, 1_250_000, 0.038, 215, 3.0, 16_000, {
                body: { Roadster: 1 },
                transmission: "4-Gang Schaltgetriebe",
                color: "#ebeae6",
              }),
            ],
          },
          {
            name: "R129",
            years: [1989, 2001],
            shape: "roadster",
            variants: [
              v("SL 500", [1989, 2001], 79827, 32_000, 0.052, 326, 5.0, 75_000, {
                body: { Cabriolet: 1 },
                gearbox: { Automatik: 1 },
                transmission: "4-/5-Stufen Automatik",
                color: "#1b2433",
              }),
              v("SL 73 AMG", [1999, 2001], 85, 455_000, 0.086, 525, 7.3, 140_000, {
                body: { Cabriolet: 1 },
                gearbox: { Automatik: 1 },
                transmission: "5-Stufen Automatik",
                color: "#c2c5c9",
              }),
            ],
          },
        ],
      },
      {
        name: "190 E",
        featured: true,
        generations: [
          {
            name: "W201",
            years: [1984, 1993],
            shape: "sedan",
            variants: [
              v("2.3-16", [1984, 1988], 19487, 42_000, 0.085, 185, 2.3, 28_000, {
                body: { Limousine: 1 },
                gearbox: { Manual: 0.9, Automatik: 0.1 },
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#1b2433",
              }),
              v("2.5-16 Evolution", [1989, 1989], 502, 166_000, 0.105, 204, 2.5, 42_000, {
                body: { Limousine: 1 },
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#1b2433",
              }),
              v("2.5-16 Evolution II", [1990, 1990], 502, 286_000, 0.121, 235, 2.5, 59_000, {
                body: { Limousine: 1 },
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#1b2433",
              }),
            ],
          },
        ],
      },
      {
        name: "SLS AMG",
        featured: true,
        generations: [
          {
            name: "C197",
            years: [2010, 2014],
            shape: "gt",
            variants: [
              v("SLS AMG Coupé", [2010, 2014], 7100, 212_000, 0.049, 571, 6.2, 177_000, {
                ...PDK,
                transmission: "7-Gang AMG Speedshift DCT",
                color: "#c2c5c9",
              }),
              v("SLS AMG Black Series", [2013, 2014], 350, 522_000, 0.073, 631, 6.2, 250_000, {
                tags: ["Leichtbau"],
                gearbox: { Automatik: 1 },
                transmission: "7-Gang AMG Speedshift DCT",
                color: "#ebeae6",
              }),
            ],
          },
        ],
      },
      {
        name: "CLK GTR",
        generations: [
          {
            name: "CLK GTR",
            years: [1998, 1999],
            shape: "hyper",
            variants: [
              v("CLK GTR Straßenversion", [1998, 1999], 20, 9_400_000, 0.089, 612, 6.9, 1_500_000, {
                tags: ["Leichtbau"],
                transmission: "6-Gang sequentiell",
                color: "#c2c5c9",
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "bmw",
    name: "BMW",
    country: "DE",
    color: "#5f8fd6",
    featured: true,
    models: [
      {
        name: "M1",
        featured: true,
        generations: [
          {
            name: "E26",
            years: [1978, 1981],
            shape: "wedge",
            variants: [
              v("M1", [1978, 1981], 453, 642_000, 0.061, 277, 3.5, 51_000, {
                transmission: "5-Gang Schaltgetriebe (ZF)",
                color: "#eeede8",
              }),
            ],
          },
        ],
      },
      {
        name: "M3",
        featured: true,
        generations: [
          {
            name: "E30",
            years: [1986, 1991],
            shape: "sedan",
            variants: [
              v("M3", [1986, 1991], 16202, 82_000, 0.074, 215, 2.3, 29_000, {
                body: { Coupé: 0.95, Cabriolet: 0.05 },
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#a41a1f",
              }),
              v("M3 Evolution II", [1988, 1988], 501, 141_000, 0.082, 220, 2.3, 34_000, {
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#eeede8",
              }),
              v("M3 Sport Evolution", [1990, 1990], 600, 236_000, 0.089, 238, 2.5, 41_000, {
                transmission: "5-Gang Schaltgetriebe (Dogleg)",
                color: "#a41a1f",
              }),
            ],
          },
          {
            name: "E46",
            years: [2000, 2006],
            shape: "sedan",
            variants: [
              v("M3 Coupé", [2000, 2006], 56133, 38_000, 0.067, 343, 3.2, 58_000, {
                body: { Coupé: 0.7, Cabriolet: 0.3 },
                gearbox: { Manual: 0.6, Automatik: 0.4 },
                transmission: "6-Gang Schaltgetriebe / SMG II",
                color: "#2c6ac3",
              }),
              v("M3 CSL", [2003, 2004], 1383, 146_000, 0.084, 360, 3.2, 81_000, {
                tags: ["Leichtbau"],
                gearbox: { Automatik: 1 },
                transmission: "6-Gang SMG II",
                color: "#a6a9ad",
              }),
            ],
          },
        ],
      },
      {
        name: "Z8",
        featured: true,
        generations: [
          {
            name: "E52",
            years: [2000, 2003],
            shape: "roadster",
            variants: [
              v("Z8", [2000, 2003], 5703, 236_000, 0.062, 400, 5.0, 120_000, {
                body: { Roadster: 1 },
                transmission: "6-Gang Schaltgetriebe",
                color: "#a6a9ad",
              }),
            ],
          },
        ],
      },
      {
        name: "3.0 CSL",
        generations: [
          {
            name: "E9",
            years: [1971, 1975],
            shape: "gt",
            variants: [
              v("3.0 CSL", [1971, 1975], 1265, 246_000, 0.058, 206, 3.2, 15_000, {
                tags: ["Leichtbau"],
                transmission: "4-Gang Schaltgetriebe",
                color: "#eeede8",
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "astonmartin",
    name: "Aston Martin",
    country: "GB",
    color: "#7fae8f",
    featured: false,
    models: [
      {
        name: "DB5",
        featured: true,
        generations: [
          {
            name: "DB5",
            years: [1963, 1965],
            shape: "gt",
            variants: [
              v("DB5 Saloon", [1963, 1965], 898, 852_000, 0.046, 282, 4.0, 5_000, {
                transmission: "5-Gang Schaltgetriebe (ZF)",
                color: "#b6b8b3",
              }),
            ],
          },
        ],
      },
      {
        name: "V8 Vantage",
        featured: true,
        generations: [
          {
            name: "V8 Vantage",
            years: [1977, 1989],
            shape: "gt",
            variants: [
              v("V8 Vantage", [1977, 1989], 534, 231_000, 0.062, 380, 5.3, 45_000, {
                gearbox: { Manual: 0.7, Automatik: 0.3 },
                color: "#1f4733",
              }),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "jaguar",
    name: "Jaguar",
    country: "GB",
    color: "#a8b4c4",
    featured: false,
    models: [
      {
        name: "E-Type",
        featured: true,
        generations: [
          {
            name: "Series 1",
            years: [1961, 1968],
            shape: "roadster",
            variants: [
              v("3.8 Roadster", [1961, 1964], 7828, 186_000, 0.031, 265, 3.8, 3_000, {
                body: { Roadster: 1 },
                transmission: "4-Gang Schaltgetriebe (Moss)",
                color: "#21314f",
              }),
              v("4.2 Coupé", [1964, 1968], 7770, 131_000, 0.028, 265, 4.2, 3_200, {
                transmission: "4-Gang Schaltgetriebe",
                color: "#a01b1f",
              }),
            ],
          },
        ],
      },
      {
        name: "XJ220",
        featured: true,
        generations: [
          {
            name: "XJ220",
            years: [1992, 1994],
            shape: "hyper",
            variants: [
              v("XJ220", [1992, 1994], 275, 622_000, 0.102, 549, 3.5, 470_000, {
                tags: ["Turbo"],
                transmission: "5-Gang Schaltgetriebe",
                color: "#a6a9ad",
              }),
            ],
          },
        ],
      },
    ],
  },
];
