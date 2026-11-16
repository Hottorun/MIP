import { setDataset, type Dataset } from "./dataset";

/**
 * Loads the market data files before the app starts. index.html carries a <meta name="mip-data"> with the manifest
 * (file name -> URL, hashed in production, see vite.config.ts), so the four files load in parallel with the scripts
 * and stay cached in the browser until the data changes.
 */
export type Manifest = { model: string; asks: string; history: string; sales: string; asOf?: string };

export function readManifest(): Manifest {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="mip-data"]');
  if (!meta?.content) throw new Error("mip-data manifest fehlt in index.html");
  return JSON.parse(meta.content) as Manifest;
}

async function get(url: string, as: "json" | "text") {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return as === "json" ? r.json() : r.text();
}

export async function loadDataset(manifest = readManifest()): Promise<Dataset> {
  const [model, asks, history, salesCsv] = await Promise.all([get(manifest.model, "json"), get(manifest.asks, "json"), get(manifest.history, "json"), get(manifest.sales, "text")]);
  const d: Dataset = { model, asks, history, salesCsv: salesCsv as string };
  setDataset(d);
  return d;
}
