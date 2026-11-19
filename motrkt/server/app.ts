import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";
import { authGate, enableDemoAccount, mayRead } from "./auth.ts";

/**
 * The production request handler: sign-in gate, APIs and the built app from dist/. Used by the local server
 * (server/prod.ts) and on Vercel by the function api/server.ts, which receives every request.
 */

// The built app next to this file's folder: on Vercel the function's working directory is the repository root
// (/var/task), with the project under motrkt/, so a path from process.cwd() misses it. The cwd is the fallback.
const DIST =
  process.env.MIP_DIST ??
  [fileURLToPath(new URL("../dist", import.meta.url)), join(process.cwd(), "dist")].find((d) => existsSync(join(d, "index.html"))) ??
  join(process.cwd(), "dist");
if (!existsSync(join(DIST, "index.html"))) console.error(`dist/index.html fehlt (gesucht in ${DIST}, Modul ${import.meta.url})`);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".woff2": "font/woff2",
};

// the demo account's password is public (README): only on request in production
if ((process.env.MIP_DEMO_ACCOUNT ?? process.env.MOTRKT_DEMO_ACCOUNT) === "1") enableDemoAccount();

// Browser protections for everything served here: no framing (clickjacking), no MIME sniffing, no referrer leaks of
// listing URLs, and the content-security policy for the app: scripts and fonts only from here, styles also inline
// (Recharts, Tailwind), listing photos from any https host, fetches only to this origin. Nothing loads from Google.
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // "same-origin": the sites that listing photos and links lead to learn nothing about where the visitor came from
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  // over https the browser never falls back to an unencrypted connection (passwords, contracts)
  if (req.headers["x-forwarded-proto"] === "https") res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(req, res);
  try {
    if (await authGate(req, res)) return; // sign-in page, auth API, legal pages for guests
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    return res.end();
  }
  if (req.url?.startsWith("/api/")) {
    return handleApi(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  }
  res.setHeader("Content-Security-Policy", APP_CSP);
  let path: string;
  try {
    path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.statusCode = 400; // malformed percent-encoding such as "/%"
    return res.end();
  }
  // the full market data is for premium accounts; a lite account loads the lite copies (src/data/real/load.ts)
  try {
    if (!(await mayRead(req, path))) {
      res.statusCode = 403;
      res.setHeader("Cache-Control", "private, no-store");
      return res.end();
    }
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    return res.end();
  }
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html"); // SPA fallback
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  // "private": the full data differs per account (premium or not), so no shared cache (Vercel's CDN, proxies) may keep a copy
  // assets/ and data/ carry a content hash in the name (vite.config.ts), so they may be kept for a year
  res.setHeader(
    "Cache-Control",
    file.includes(`${DIST}/assets/`) || file.includes(`${DIST}/data/`)
      ? "private, max-age=31536000, immutable"
      : file.includes(`${DIST}/fonts/`)
        ? "public, max-age=2592000" // typefaces are public files, open without a session (server/auth.ts)
        : "private, no-cache",
  );
  // the compressed copy from the build (vite.config.ts): the main script is too large for a Vercel function uncompressed
  const accepts = String(req.headers["accept-encoding"] ?? "");
  const encoding = ["br", "gzip"].find((e) => accepts.includes(e) && existsSync(file + (e === "br" ? ".br" : ".gz")));
  if (encoding) {
    file += encoding === "br" ? ".br" : ".gz";
    res.setHeader("Content-Encoding", encoding);
    res.setHeader("Vary", "Accept-Encoding");
  }
  res.setHeader("Content-Length", statSync(file).size);
  createReadStream(file)
    .on("error", (err) => {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    })
    .pipe(res);
}
