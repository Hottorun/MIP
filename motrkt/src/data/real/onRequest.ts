import { variantById } from "../db";
import type { Body, Listing } from "../types";

/**
 * Dealer listings without a stated price ("Preis auf Anfrage"), hand-recorded from the dealer's own site. They appear
 * only on the buy page, flagged `onRequest`; with no price they never enter the market value or the
 * comparison with the fair value. Photos are the dealer's own, main photo first.
 */
type Row = { id: string; dealer: string; variant: string; date: string; title: string; year: number; km: number; body: Body; url: string; img: string[] };

const KARERO = "https://www.karero.de/wp-content/uploads/";
const JANZEN = "https://janzen-klassik.de/wp-content/uploads/2025/04/";
const MILE = 1.609344;

const ROWS: Row[] = [
  {
    id: "A-karero-1",
    dealer: "Karero",
    variant: "porsche-911-f-modell-2-0",
    date: "2026-11-19",
    title: "Porsche 911 Coupé (1967)",
    year: 1967,
    km: Math.round(18998 * MILE),
    body: "Coupé",
    url: "https://www.karero.de/?portfolio=porsche-911-sd-coupe-1967",
    img: [KARERO + "Karero_14_01.jpg", KARERO + "Karero_14_02-1.jpg", KARERO + "Karero_14_05-1.jpg", KARERO + "Karero_14_03-1.jpg", KARERO + "Karero_14_06-1.jpg", KARERO + "Karero_14_04-1.jpg", KARERO + "Karero_14_07-1.jpg", KARERO + "Karero_14_08-1.jpg"],
  },
  {
    id: "A-karero-2",
    dealer: "Karero",
    variant: "porsche-911-f-modell-s-2-4",
    date: "2026-11-19",
    title: "Porsche 911 S Coupé (1973)",
    year: 1973,
    km: 16298,
    body: "Coupé",
    url: "https://www.karero.de/?portfolio=porsche-911-s-sd-coupe-1973",
    img: [KARERO + "CSW5440.jpg", KARERO + "CSW5510.jpg", KARERO + "CSW5451.jpg", KARERO + "CSW5416.jpg", KARERO + "CSW5446.jpg", KARERO + "CSW5491.jpg", KARERO + "CSW5431.jpg", KARERO + "CSW5535.jpg"],
  },
  {
    id: "A-karero-3",
    dealer: "Karero",
    variant: "porsche-930-turbo-3-0",
    date: "2026-11-19",
    title: "Porsche 930 3.0 Turbo (1975)",
    year: 1975,
    km: 115200,
    body: "Coupé",
    url: "https://www.karero.de/?portfolio=porsche-930-3-0l-turbo-1975",
    img: [KARERO + "CSW5114.jpg", KARERO + "CSW5119.jpg", KARERO + "CSW5254.jpg", KARERO + "CSW5280-1.jpg", KARERO + "CSW5304-1.jpg", KARERO + "CSW5299-1.jpg", KARERO + "CSW5224.jpg", KARERO + "CSW5230.jpg"],
  },
  {
    id: "A-karero-4",
    dealer: "Karero",
    variant: "porsche-911-964-carrera-2",
    date: "2026-11-19",
    title: "Porsche 964 Targa (1994)",
    year: 1994,
    km: 97824,
    body: "Targa",
    url: "https://www.karero.de/?portfolio=porsche-964-targa-1994",
    img: [KARERO + "CSW4989.jpg", KARERO + "CSW4992.jpg", KARERO + "CSW4998.jpg", KARERO + "CSW4995.jpg", KARERO + "CSW5058.jpg", KARERO + "CSW5016.jpg", KARERO + "CSW5004.jpg", KARERO + "CSW5001.jpg"],
  },
  {
    id: "A-janzen-1",
    dealer: "Janzen Klassik",
    variant: "porsche-911-f-modell-s-2-0",
    date: "2026-11-19",
    title: "Porsche 911 S Faltscheiben-Targa (1967)",
    year: 1967,
    km: 87654,
    body: "Targa",
    url: "https://janzen-klassik.de/fahrzeuge/1967-porsche-911s-targa/",
    img: [JANZEN + "1-1967-Porsche-911S-Faltscheiben-Targa-Janzen-Klassik-Leichlingen-2.jpg", ...[2, 3, 4, 5, 6, 7, 8].map((n) => `${JANZEN}${n}.jpg`)],
  },
];

let cache: Listing[] | undefined;
export function onRequestListings(): Listing[] {
  cache ??= ROWS.flatMap((r): Listing[] => {
    const v = variantById.get(r.variant);
    if (!v) return [];
    return [
      {
        id: r.id,
        variantId: v.id,
        title: r.title,
        year: r.year,
        mileage: r.km,
        price: 0,
        onRequest: true,
        country: "DE",
        city: "–",
        seller: r.dealer,
        sellerType: "Händler",
        condition: "2",
        conditionUnknown: true,
        color: "–",
        colorHex: v.color,
        body: r.body,
        gearbox: null,
        vin: "–",
        listedAt: Date.parse(r.date),
        matchingNumbers: null,
        serviceHistory: null,
        description: "",
        source: r.dealer,
        url: r.url,
        images: r.img,
      },
    ];
  });
  return cache;
}
