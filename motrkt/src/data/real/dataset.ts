/**
 * The market data the daily update writes (src/data/real: market model, asking prices, listing history, sales CSV).
 * Not part of the script bundle: main.tsx fetches the files (hashed copies under /data/, see vite.config.ts) before
 * the app's modules load, and the modules in this folder read them from here at import time.
 */
export type Dataset = { model: unknown; asks: unknown; history: unknown; salesCsv: string };

let current: Dataset | null = null;

export function setDataset(d: Dataset) {
  current = d;
}

export function dataset(): Dataset {
  if (!current) throw new Error("Marktdaten sind noch nicht geladen (setDataset fehlt vor dem Import der Datenmodule).");
  return current;
}
