import porsche911 from "./porsche-911.json";
import porscheOtherFerrari from "./porsche-other-ferrari.json";
import lamboMercedesBmwUk from "./lambo-mercedes-bmw-uk.json";

/** Researched, sourced facts per variant: launch color, verified specs and freely licensed photos (Wikimedia Commons). */

export type LaunchColor = { name: string; hex: string; source?: string; confidence?: "high" | "medium" | "low"; note?: string };

export type Photo = {
  file: string;
  title?: string;
  page?: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  exact?: boolean;
  launchColor?: boolean;
  caption?: string;
};

export type RealSpecs = {
  production?: number;
  hp?: number;
  liters?: number;
  years?: [number, number | null];
  newPrice?: { amount?: number; currency?: string; eur?: number; year?: number };
  sources?: string[];
};

export type RealEntry = { launchColor?: LaunchColor; specs?: RealSpecs; images?: Photo[]; note?: string };

export const realData: Record<string, RealEntry> = {
  ...(porsche911 as unknown as Record<string, RealEntry>),
  ...(porscheOtherFerrari as unknown as Record<string, RealEntry>),
  ...(lamboMercedesBmwUk as unknown as Record<string, RealEntry>),
};
