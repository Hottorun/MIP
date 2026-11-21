import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleApi } from "./server/api.ts";
import { authGate, enableDemoAccount, mayRead } from "./server/auth.ts";
import { handleNoticePages } from "./server/notices.ts";

/**
 * The market data files (src/data/real) are not bundled into the script: the app fetches them at start
 * (src/data/real/load.ts) from the manifest in <meta name="mip-data">. In development they are served as they are
 * (no cache); the build copies them to dist/data/<name>-<hash>.<ext> with brotli/gzip twins, so browsers keep them
 * until the data changes, and code changes do not make anyone download the data again.
 */
const REAL = fileURLToPath(new URL("./src/data/real/", import.meta.url));
const DATA_FILES = { model: "market-model.json", asks: "asks.json", history: "listing-history.json", sales: "sales.csv" } as const;

/**
 * The lite copies of the model and the sales (scripts/data/lite.ts): what an account without premium loads instead
 * of the full files, which the server refuses it (server/auth.ts, PREMIUM_DATA). Built into a cache folder, again
 * whenever the data or the script is newer.
 */
const LITE_DIR = fileURLToPath(new URL("./node_modules/.cache/mip-lite/", import.meta.url));
const LITE_FILES = { model: "market-model.lite.json", sales: "sales.lite.csv" } as const;
const LITE_SCRIPT = fileURLToPath(new URL("./scripts/data/lite.ts", import.meta.url));
function ensureLite(force = false) {
  const made = Object.values(LITE_FILES).map((f) => (existsSync(LITE_DIR + f) ? statSync(LITE_DIR + f).mtimeMs : 0));
  const sources = [REAL + DATA_FILES.model, REAL + DATA_FILES.sales, LITE_SCRIPT].map((f) => statSync(f).mtimeMs);
  if (!force && Math.min(...made) > Math.max(...sources)) return;
  execFileSync(fileURLToPath(new URL("./node_modules/.bin/tsx", import.meta.url)), [LITE_SCRIPT, LITE_DIR], { stdio: "inherit" });
}

function compress(file: string, data: Buffer) {
  writeFileSync(file + ".br", brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
  writeFileSync(file + ".gz", gzipSync(data, { level: 9 }));
}

function dataPlugin(): Plugin {
  let build = false;
  const hashed = new Map<string, { out: string; data: Buffer }>();
  const manifest = () => {
    const url = (key: string, dir: string, name: string) => {
      if (!build) return `/data/${name}`;
      let h = hashed.get(key);
      if (!h) {
        const data = readFileSync(dir + name);
        const hash = createHash("sha256").update(data).digest("hex").slice(0, 12);
        h = { out: name.replace(/(\.[a-z]+)$/, `-${hash}$1`), data };
        hashed.set(key, h);
      }
      return `/data/${h.out}`;
    };
    const m: Record<string, string | Record<string, string>> = {};
    for (const [key, name] of Object.entries(DATA_FILES)) m[key] = url(key, REAL, name);
    ensureLite();
    m.lite = Object.fromEntries(Object.entries(LITE_FILES).map(([key, name]) => [key, url(`lite:${key}`, LITE_DIR, name)]));
    try {
      m.asOf = String(JSON.parse(readFileSync(REAL + DATA_FILES.model, "utf8")).asOf ?? "");
    } catch {
      /* no as-of */
    }
    return m;
  };
  return {
    name: "mip-data",
    configResolved(c) {
      build = c.command === "build";
      if (build) ensureLite(true); // a build never ships lite copies made from older data or code
    },
    transformIndexHtml(_html, ctx) {
      const tags = [{ tag: "meta", attrs: { name: "mip-data", content: JSON.stringify(manifest()) }, injectTo: "head" as const }];
      // the app's code (src/bootstrap.tsx and what it imports) is loaded only after the data: fetch it alongside
      const bundle = ctx.bundle ?? {};
      const entry = Object.values(bundle).find((c) => c.type === "chunk" && c.name === "bootstrap");
      if (entry && entry.type === "chunk") {
        for (const file of [entry.fileName, ...entry.imports]) tags.push({ tag: "link", attrs: { rel: "modulepreload", crossorigin: "", href: `/${file}` } as never, injectTo: "head" as const });
      }
      return tags;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/data\/([a-z.-]+\.(json|csv))(\?.*)?$/.exec(req.url ?? "");
        const lite = m ? Object.values<string>(LITE_FILES).includes(m[1]) : false;
        if (!m || (!lite && !Object.values<string>(DATA_FILES).includes(m[1]))) return next();
        // as in production (server/app.ts): the full model and sales only for premium accounts
        mayRead(req, `/data/${m[1]}`)
          .then((ok) => {
            if (!ok) {
              res.statusCode = 403;
              return res.end();
            }
            if (lite) ensureLite();
            res.setHeader("Content-Type", m[2] === "json" ? "application/json" : "text/csv; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache");
            res.end(readFileSync((lite ? LITE_DIR : REAL) + m[1]));
          })
          .catch(next);
      });
    },
    writeBundle(options) {
      const dir = join(options.dir ?? "dist", "data");
      mkdirSync(dir, { recursive: true });
      manifest();
      for (const { out, data } of hashed.values()) {
        const file = join(dir, out);
        writeFileSync(file, data);
        compress(file, data);
      }
    },
  };
}

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"], environment: "node", setupFiles: ["src/test/setup.ts"] },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "mip-api",
      configureServer(server) {
        // the demo account reviews car reports here only (its password is public), see server/auth.ts
        if ((process.env.MIP_DEMO_ACCOUNT ?? process.env.MOTRKT_DEMO_ACCOUNT) !== "0") enableDemoAccount({ admin: true });
        // the same gate as in production: sign-in page and auth API; guests go on to the app with the lite data
        server.middlewares.use((req, res, next) => {
          // first the pages for everyone (terms, withdrawal, cancellation), as in server/app.ts
          handleNoticePages(req, res)
            .then((done) => done || authGate(req, res))
            .then((handled) => {
              if (handled) return;
              if (!req.url?.startsWith("/api/")) return next();
              return handleApi(req, res);
            })
            .catch(next);
        });
      },
    },
    dataPlugin(), // after mip-api: in development the premium files are checked as in production (mayRead)
    {
      // Brotli and gzip copies of every built script, style and SVG (file.br, file.gz) for server/app.ts: a Vercel
      // function may not answer with more than 4.5 MB, and the copies spare the function the compression.
      name: "mip-precompress",
      apply: "build",
      writeBundle(options, bundle) {
        for (const name of Object.keys(bundle)) {
          if (!/\.(js|css|svg|html)$/.test(name)) continue;
          const file = join(options.dir ?? "dist", name);
          const data = readFileSync(file);
          if (data.length < 1024) continue;
          compress(file, data);
        }
      },
    },
  ],
});
