import porsche911 from "./porsche-911.json";
import porscheOther from "./porsche-other.json";
import launch from "./launch.json";
import official from "./official.json";

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
  /** Taken at the car's presentation (world premiere, motor show debut or press launch). */
  premiere?: boolean;
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

/**
 * Market tab only: official manufacturer photos (Porsche Newsroom), keyed by variant id.
 * Loaded from the manufacturers' servers, not stored in the repo. The other tabs keep using `images`.
 */
export const launchPhotos = launch as unknown as Record<string, Photo[]>;

/** Official manufacturer page for a car (press kit, world-premiere release or model page). */
export type OfficialLink = {
  url: string;
  /** premiere: release about the presentation itself; model: manufacturer model page; history: article/press kit on the car's history. */
  kind: "premiere" | "model" | "history";
  /** Where and when the car was first shown, when known. */
  event?: string;
  title?: string;
};

/** Market tab only: link to the manufacturer's own photos of each car, keyed by variant id. */
export const officialLinks = official as unknown as Record<string, OfficialLink>;

export const realData: Record<string, RealEntry> = {
  ...(porsche911 as unknown as Record<string, RealEntry>),
  ...(porscheOther as unknown as Record<string, RealEntry>),
};
