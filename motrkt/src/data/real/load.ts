import { setDataset, type Dataset } from "./dataset";

/**
 * Loads the market data files before the app starts. index.html carries a <meta name="mip-data"> with the manifest
 * (file name -> URL, hashed in production, see vite.config.ts), so the files stay cached in the browser until the
 * data changes.
 *
 * The model and the sales exist twice: in full for premium accounts, and as lite copies without value histories and
 * sale prices (scripts/data/lite.ts) for everyone else. The server refuses the full files to a lite account
 * (server/auth.ts), so which pair to load is asked first; the listing files are the same for all and load meanwhile.
 */
export type Manifest = { model: string; asks: string; history: string; sales: string; lite?: { model: string; sales: string }; asOf?: string };

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

async function hasPremium(): Promise<boolean> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    return r.ok ? Boolean((await r.json()).premium) : false;
  } catch {
    return false;
  }
}

export async function loadDataset(manifest = readManifest()): Promise<Dataset> {
  const shared = Promise.all([get(manifest.asks, "json"), get(manifest.history, "json")]);
  const pair = (p: { model: string; sales: string }) => Promise.all([get(p.model, "json"), get(p.sales, "text")]);
  const lite = manifest.lite;
  const [model, salesCsv] = !lite
    ? await pair(manifest)
    : (await hasPremium())
      ? await pair(manifest).catch(() => pair(lite)) // premium ran out between the two requests
      : await pair(lite);
  const [asks, history] = await shared;
  const d: Dataset = { model, asks, history, salesCsv: salesCsv as string };
  setDataset(d);
  return d;
}
