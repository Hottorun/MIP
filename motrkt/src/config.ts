/**
 * Brands the app shows (catalog ids: porsche, ferrari); "all" shows every brand in the catalog.
 */
export const ENABLED_BRANDS: readonly string[] | "all" = ["porsche", "ferrari"] as readonly string[] | "all";

export const isBrandEnabled = (brandId: string) => ENABLED_BRANDS === "all" || ENABLED_BRANDS.includes(brandId);
