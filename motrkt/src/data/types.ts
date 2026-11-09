export type Body = "Coupé" | "Cabriolet" | "Targa" | "Roadster" | "Limousine";
export type Gearbox = "Manual" | "Automatik";
export type CarShape = "classic911" | "modern911" | "wedge" | "gt" | "sedan" | "hyper" | "roadster";

export type Brand = {
  id: string;
  name: string;
  country: string;
  color: string; // emblem accent
  featured: boolean; // shown in the sidebar without expanding "Weitere Marken"
};

export type VariantSeed = {
  name: string;
  years: [number, number | null];
  production: number;
  value: number; // catalog estimate (EUR); replaced by the measured market value where the market model has one
  cagr: number; // 5y CAGR, e.g. 0.108
  vol?: number; // annualised volatility; derived from rarity/price when omitted
  hp: number;
  liters: number;
  newPrice: number; // list price at launch, EUR-equivalent
  tags?: string[]; // e.g. "Leichtbau", "Turbo", "Allrad"
  body?: Partial<Record<Body, number>>; // share of production
  gearbox?: Partial<Record<Gearbox, number>>;
  drive?: string;
  transmission?: string;
  color?: string; // signature paint for the illustrations
  shape?: CarShape; // illustration shape when it differs from the generation (718: Boxster roadster next to Cayman coupé)
};

export type Variant = Required<Omit<VariantSeed, "vol" | "tags">> & {
  /** true: `value` is measured from at least MIN_RECORDS auction results / asking prices; false: too few records, no value is shown. */
  measured: boolean;
  id: string;
  brandId: string;
  modelId: string;
  generationId: string;
  vol: number;
  tags: string[];
  options: VariantOption[];
  shape: CarShape;
  /** first-delivery market split (percent, sums to ~100) */
  markets: { country: string; share: number }[];
  weaknesses: string[];
  /** Paint the car was first presented in (press launch / world premiere), when researched. */
  launchColor?: import("./real").LaunchColor;
  /** Freely licensed photos with attribution (Wikimedia Commons); empty → illustrated fallback. */
  photos: import("./real").Photo[];
  /** Market tab gallery: official manufacturer photos (presentation first); empty → illustration. */
  marketPhotos: import("./real").Photo[];
  /** Market tab: manufacturer page with the official photos (Porsche Newsroom). */
  officialLink?: import("./real").OfficialLink;
  /** Sources for verified specs. */
  specSources: string[];
  /** Year of the list price in newPrice (start of production unless a dated price list says otherwise). */
  newPriceYear: number;
};

export type VariantOption = {
  name: string;
  standard: boolean;
  impact: number /* value impact, e.g. 0.04 */;
  /** Name of an option this one only came with (picked together, e.g. 991 GT3 Touring → manual gearbox). */
  requires?: string;
  /** Impact measured from this many auction results (otherwise an estimate). */
  measured?: number;
  /** Options of the same group exclude each other (e.g. body styles). */
  group?: string;
};

export type Generation = {
  id: string;
  modelId: string;
  name: string; // "964"
  years: [number, number | null];
  shape: CarShape;
  variantIds: string[];
};

export type Model = {
  id: string;
  brandId: string;
  name: string; // "911"
  generationIds: string[];
  featured: boolean;
  category: ModelCategory;
};

/** Model families for menus and the model list: rear-engined sports cars, mid-engined sports cars, supercars, race cars. */
export type ModelCategory = "heck" | "mittel" | "super" | "motorsport";

export type PricePoint = { t: number; /* ms timestamp, weekly */ value: number; volume: number };

export type SaleSource = "Auktion" | "Händler" | "Privat";
export type Condition = "1" | "1-" | "2+" | "2" | "2-" | "3";

export type Sale = {
  id: string; // lot / transaction id, e.g. "RMS-25-0412"
  variantId: string;
  date: number;
  source: SaleSource;
  house: string; // auction house or dealer
  price: number | null; // null = not sold (auction)
  estimateLow: number | null;
  estimateHigh: number | null;
  condition: Condition;
  mileage: number;
  buyerCountry: string; // ISO-2
  originCountry: string; // country of manufacture/first registration
  deliveryCountry: string; // first delivery market
  body: Body;
  gearbox: Gearbox;
  color: string;
  vin: string;
  trend: number; // price vs. market value at that date, e.g. 0.059
  url?: string; // source link for imported real records
  conditionUnknown?: boolean; // imported record without a stated condition (normalised as "2")
};

export type Listing = {
  id: string;
  variantId: string;
  title: string;
  year: number;
  mileage: number;
  price: number;
  country: string;
  city: string;
  seller: string;
  sellerType: "Händler" | "Privat" | "Auktion";
  condition: Condition;
  color: string;
  colorHex: string;
  body: Body;
  gearbox: Gearbox;
  vin: string;
  listedAt: number;
  matchingNumbers: boolean;
  serviceHistory: boolean;
  description: string;
  /** Set for live mobile.de ads; demo listings leave these undefined. */
  source?: "mobile.de";
  url?: string;
  images?: string[];
  conditionUnknown?: boolean;
  powerPs?: number;
  accidentDamaged?: boolean | null;
  previousOwners?: number | null;
};

export type AuctionEvent = {
  id: string;
  house: string;
  title: string;
  city: string;
  country: string;
  date: number;
  lots: { lotNo: number; variantId: string; estimateLow: number; estimateHigh: number; year: number; mileage: number; colorHex: string; color: string }[];
};

export type Holding = {
  id: string;
  variantId: string;
  purchasePrice: number;
  purchaseDate: number;
  mileage: number;
  condition: Condition;
  color: string;
  note: string;
};

export type PriceAlert = {
  id: string;
  variantId: string;
  direction: "above" | "below";
  threshold: number;
  createdAt: number;
};
