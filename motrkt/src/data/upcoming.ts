import { t } from "../i18n";

/**
 * Brands announced in the model list as "coming soon". Teaser only: no catalog, no market data, no pages of their own.
 * When a brand goes live it moves into the catalog (src/data/catalog.ts) and src/config.ts, and leaves this list.
 */
export type UpcomingBrand = {
  id: string;
  name: string;
  readonly origin: string;
  readonly intro: string;
  /** A few classics the brand stands for, as plain text in the teaser. */
  icons: string[];
};

export const UPCOMING_BRANDS: UpcomingBrand[] = [
  {
    id: "ferrari",
    name: "Ferrari",
    get origin() { return t("Maranello, Italien", "Maranello, Italy"); },
    get intro() {
      return t(
        "Die Zwölfzylinder der Fünfziger, die Mittelmotor-Berlinetten der Siebziger und Achtziger, die limitierten Supersportwagen bis heute.",
        "The V12s of the fifties, the mid-engined berlinettas of the seventies and eighties, the limited supercars up to today.",
      );
    },
    icons: ["250 GT", "Dino 246", "308 GTB", "Testarossa", "F40"],
  },
  {
    id: "bmw",
    name: "BMW",
    get origin() { return t("München, Deutschland", "Munich, Germany"); },
    get intro() {
      return t(
        "Von den Sportlimousinen der Neuen Klasse über die Coupés der Siebziger bis zu den M-Modellen.",
        "From the sports saloons of the Neue Klasse through the coupés of the seventies to the M cars.",
      );
    },
    icons: ["2002 turbo", "3.0 CSL", "M1", "M3 (E30)", "Z8"],
  },
  {
    id: "mercedes",
    name: "Mercedes-Benz",
    get origin() { return t("Stuttgart, Deutschland", "Stuttgart, Germany"); },
    get intro() {
      return t(
        "Die SL-Generationen vom Flügeltürer an, dazu die Sportlimousinen und Homologationsmodelle.",
        "The SL generations from the Gullwing on, plus the sports saloons and homologation specials.",
      );
    },
    icons: ["300 SL", "230 SL Pagode", "190 E 2.5-16 Evo II", "SL (R129)", "SLR McLaren"],
  },
];

export const upcomingBrandById = new Map(UPCOMING_BRANDS.map((b) => [b.id, b]));
