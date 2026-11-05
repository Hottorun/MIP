import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApi } from "./api.ts";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

if (!existsSync(DIST)) {
  console.error("dist/ fehlt – bitte zuerst `npm run build` ausführen.");
  process.exit(1);
}

createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
    return;
  }
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  let file = normalize(join(DIST, path));
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html"); // SPA fallback
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  if (file.includes(`${DIST}/assets/`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  createReadStream(file).pipe(res);
}).listen(PORT, () => {
  console.log(`MOTRKT läuft auf http://localhost:${PORT}`);
});
