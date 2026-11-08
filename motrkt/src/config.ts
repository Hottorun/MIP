/**
 * Brands the app currently shows. The full catalog, research data, photos and sales CSV stay in the repo;
 * add brand ids here (porsche, ferrari, lamborghini, mercedes, bmw, astonmartin, jaguar) or set to "all" to bring them back.
 */
export const ENABLED_BRANDS: readonly string[] | "all" = ["porsche"] as readonly string[] | "all";

export const isBrandEnabled = (brandId: string) => ENABLED_BRANDS === "all" || ENABLED_BRANDS.includes(brandId);
