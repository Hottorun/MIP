import type { IncomingMessage, ServerResponse } from "node:http";
import { currentUser } from "./auth.ts";
import { overLimit } from "./limits.ts";
import { isLotPage } from "../src/lib/lotPages.ts";

/**
 * GET /api/losfotos?url=<lot page> → { photos: string[] }
 *
 * Photos of the exact car of an auction result, read from the lot page at the auction house when someone opens the
 * result in the app (the image files stay at the house; the app links them and names the source). Only lot pages of
 * the houses in our data, only where the house's robots.txt allows it; one request per lot, cached. An empty list
 * means the app shows the link to the lot page instead.
 */

const UA = "MIP-Marktdaten/1.0 (Marktbeobachtung klassischer Porsche)";
const MAX_PHOTOS = 12;
const MAX_BYTES = 3_000_000;
const DAY = 86_400_000;



const results = new Map<string, { at: number; photos: string[] }>();
const robots = new Map<string, { at: number; disallow: RegExp[]; allow: RegExp[] }>();

async function fetchText(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const text = await r.text();
    return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
  } catch {
    return null;
  }
}

/** robots.txt rule → RegExp ("*" any characters, "$" end). */
const rule = (path: string) => new RegExp("^" + path.replace(/[.+?^{}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$|\$$/, "$"));

/** Rules of the group for "*" (or our name), per robots.txt; a missing or unreadable file allows everything. */
async function robotsFor(origin: string) {
  const hit = robots.get(origin);
  if (hit && Date.now() - hit.at < DAY) return hit;
  const text = (await fetchText(`${origin}/robots.txt`)) ?? "";
  const disallow: RegExp[] = [];
  const allow: RegExp[] = [];
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      agents.push(value.toLowerCase());
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    inRules = true;
    if (!agents.some((a) => a === "*" || a.startsWith("mip-marktdaten"))) continue;
    if (!value) continue;
    (key === "allow" ? allow : disallow).push(rule(value));
  }
  const entry = { at: Date.now(), disallow, allow };
  robots.set(origin, entry);
  return entry;
}

async function allowed(url: URL) {
  const r = await robotsFor(url.origin);
  const path = url.pathname + url.search;
  const longest = (rs: RegExp[]) => Math.max(-1, ...rs.filter((x) => x.test(path)).map((x) => x.source.length));
  const d = longest(r.disallow);
  return d < 0 || longest(r.allow) >= d;
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\\\//g, "/");

function metaImage(html: string): string | null {
  const m =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i.exec(html);
  return m ? decode(m[1]) : null;
}

const imageUrls = (html: string) => [...new Set([...html.matchAll(/https?:(?:\\?\/){2}[^"'\s<>()\\]+?\.(?:jpe?g|webp)(?:\?[^"'\s<>()\\]*)?/gi)].map((m) => decode(m[0])))];

/** Photos of the car on a lot page: the house's gallery where we know its form, else the page's share image. */
export function extractPhotos(pageUrl: string, html: string): string[] {
  const host = new URL(pageUrl).hostname;
  let photos: string[] = [];
  if (host === "bringatrailer.com") {
    const m = /data-gallery-items=(["'])(.*?)\1/s.exec(html);
    if (m) {
      try {
        const items = JSON.parse(decode(m[2])) as { large?: { url?: string } }[];
        photos = items.map((i) => i.large?.url ?? "").filter(Boolean);
      } catch {
        /* share image below */
      }
    }
  } else if (host === "www.mecum.com") {
    const id = /\/lots\/(?:[A-Z]{2}\d{2}-)?(\d+)(?:\/|$)/.exec(pageUrl)?.[1];
    const seen = new Set<string>();
    for (const u of imageUrls(html)) {
      // older sales: .../auctions/fl15/fl0115-209939/..., newer ones: .../auctions/CA26/1176394/...
      if (!u.includes("res.cloudinary.com/mecum/image/upload/") || !id || !(u.includes(`-${id}/`) || u.includes(`/${id}/`))) continue;
      const file = u.split("?")[0].split("/").pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      // one size for all: the page mixes cropped previews and the full-size originals
      photos.push(u.split("?")[0].replace(/\/image\/upload\/(?:[a-z]_[^/]*\/)?/, "/image/upload/c_limit,f_auto,q_80,w_1600/"));
    }
  }
  const share = metaImage(html);
  if (!photos.length && share && !/logo/i.test(share)) {
    // further photos of the same lot: same folder (and, at Artcurial, the same lot number in the file name)
    const dir = share.split("?")[0].replace(/[^/]+$/, "");
    const stem = host === "www.artcurial.com" ? (share.split("?")[0].split("/").pop() ?? "").split("_")[0] : "";
    photos = [share, ...imageUrls(html).filter((u) => u !== share && u.startsWith(dir) && (!stem || u.includes(`/${stem}_`)))];
  }
  if (!photos.length && host === "www.osenat.com") photos = imageUrls(html).filter((u) => u.includes("cdn.drouot.com/d/lot/"));
  // Artcurial: the same photos also come as blurred placeholders; Aguttes: each photo in a large and a small size
  if (host === "www.artcurial.com") photos = photos.map((p) => `${p.split("?")[0]}?w=1024&force_webp=false`);
  if (host === "www.aguttes.com" && photos.some((p) => /_lg\.[a-z]+$/i.test(p))) photos = photos.filter((p) => /_lg\.[a-z]+$/i.test(p));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of photos) {
    if (!/^https:\/\//.test(p) || /logo|placeholder|avatar|icon/i.test(p)) continue;
    const key = p.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= MAX_PHOTOS) break;
  }
  return out;
}

/**
 * Iconic Auctioneers answers automated page requests with a bot check, which we do not work around. Its lot photos lie
 * in a public file store under the lot's catalogue number, which the lot link carries ("…-rec17716-3-nec-1126" →
 * REC17716-3). Newer lots: "REC17716-3/REC17716-3_2.jpg.webp", cover photo 2; older ones: "rec02041-1/rec02041-1_1.jpg",
 * cover photo 1. Which form a lot uses and which photos exist is checked with HEAD requests.
 */
const ICONIC_STORE = "https://am-s3-bucket-assets.s3.eu-west-2.amazonaws.com/silverstone/prod/lot_images/large/";

async function iconicPhotos(pageUrl: string): Promise<string[] | null> {
  if (!pageUrl.startsWith("https://www.iconicauctioneers.com/")) return null;
  const m = /[-/](recc?)(\d+)-(\d+)/i.exec(pageUrl);
  if (!m) return null;
  const id = `${m[2]}-${m[3]}`;
  for (const ref of [`${m[1].toUpperCase()}${id}`, `${m[1].toLowerCase()}${id}`]) {
    for (const ext of [".jpg.webp", ".jpg"]) {
      const order = ext === ".jpg.webp" ? [2, 1] : [1, 2];
      const all = [...order, ...Array.from({ length: 14 }, (_, i) => i + 3)].map((n) => `${ICONIC_STORE}${ref}/${ref}_${n}${ext}`);
      if (!(await existing(all.slice(0, 2))).length) continue;
      return existing(all);
    }
  }
  return [];
}

/** The photo addresses that answer (HEAD request each, in parallel). */
async function existing(urls: string[]): Promise<string[]> {
  const ok = await Promise.all(
    urls.map((u) =>
      fetch(u, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8_000) })
        .then((r) => r.ok && (r.headers.get("content-type") ?? "").startsWith("image/"))
        .catch(() => false),
    ),
  );
  return urls.filter((_, i) => ok[i]).slice(0, MAX_PHOTOS);
}

function send(res: ServerResponse, status: number, body: unknown, cache = false) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache ? "private, max-age=86400" : "no-store");
  res.end(JSON.stringify(body));
}

export async function handleLotPhotos(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (req.method !== "GET") return send(res, 405, { error: "method" });
  const target = url.searchParams.get("url") ?? "";
  if (!isLotPage(target)) return send(res, 200, { photos: [] }, true);
  const user = await currentUser(req);
  if (!user) return send(res, 401, { error: "not signed in" });

  const hit = results.get(target);
  // lots without photos are looked at again after a day (a page may have been blocked or changed meanwhile)
  if (hit && Date.now() - hit.at < (hit.photos.length ? 7 : 1) * DAY) return send(res, 200, { photos: hit.photos }, true);
  if (await overLimit("losfotos", user.id)) return send(res, 429, { error: "too_many" });

  let photos: string[] = [];
  const iconic = await iconicPhotos(target);
  if (iconic) photos = iconic;
  else if (await allowed(new URL(target))) {
    const html = await fetchText(target);
    // a page that did not answer (timeout, block) is not remembered: the next look tries again
    if (html === null) return send(res, 200, { photos: [] });
    photos = extractPhotos(target, html);
  }
  if (results.size > 5_000) results.delete(results.keys().next().value!);
  results.set(target, { at: Date.now(), photos });
  return send(res, 200, { photos }, photos.length > 0);
}
