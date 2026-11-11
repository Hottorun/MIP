import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { handleApi } from "./api.ts";
import { authGate, enableDemoAccount } from "./auth.ts";

/**
 * The production request handler: sign-in gate, APIs and the built app from dist/. Used by the local server
 * (server/prod.ts) and on Vercel by the function api/server.ts, which receives every request.
 */

// Run from the project root (npm start, and Vercel functions run in the root of the project files).
const DIST = process.env.MIP_DIST ?? join(process.cwd(), "dist");

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

export async function handleRequest(req: IncomingMessage, res: ServerResponse) {
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
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html"); // SPA fallback
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  // "private": everything here is behind the sign-in, so no shared cache (Vercel's CDN, proxies) may keep a copy
  res.setHeader("Cache-Control", file.includes(`${DIST}/assets/`) ? "private, max-age=31536000, immutable" : "private, no-cache");
  createReadStream(file).pipe(res);
}
