import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";
import { authGate, enableDemoAccount } from "./auth.ts";

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
  ".woff2": "font/woff2",
};

// the demo account's password is public (README): only on request in production
if ((process.env.MIP_DEMO_ACCOUNT ?? process.env.MOTRKT_DEMO_ACCOUNT) === "1") enableDemoAccount();

// Browser protections for everything served here: no framing (clickjacking), no MIME sniffing, no referrer leaks of
// listing URLs, and the content-security policy for the app: scripts only from here, styles also inline (Recharts,
// Tailwind) and from Google Fonts, listing photos from any https host, fetches only to this origin.
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function securityHeaders(res: ServerResponse) {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  securityHeaders(res);
  try {
    if (await authGate(req, res)) return; // sign-in page, auth API, or no session
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
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST + sep) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html"); // SPA fallback
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  // "private": everything here is behind the sign-in, so no shared cache (Vercel's CDN, proxies) may keep a copy
  res.setHeader("Cache-Control", file.includes(`${DIST}/assets/`) ? "private, max-age=31536000, immutable" : "private, no-cache");
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
