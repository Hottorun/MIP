import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleApi } from "./server/api.ts";
import { authGate, enableDemoAccount } from "./server/auth.ts";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "mip-api",
      configureServer(server) {
        if ((process.env.MIP_DEMO_ACCOUNT ?? process.env.MOTRKT_DEMO_ACCOUNT) !== "0") enableDemoAccount();
        // sign-in first: without a session nothing of the app is served
        server.middlewares.use((req, res, next) => {
          authGate(req, res)
            .then((handled) => {
              if (handled) return;
              if (!req.url?.startsWith("/api/")) return next();
              return handleApi(req, res);
            })
            .catch(next);
        });
      },
    },
    {
      // Brotli and gzip copies of every built script, style and SVG (file.br, file.gz) for server/app.ts: the main
      // script is several MB with the market data in it, and a Vercel function may not answer with more than 4.5 MB.
      name: "mip-precompress",
      apply: "build",
      writeBundle(options, bundle) {
        for (const name of Object.keys(bundle)) {
          if (!/\.(js|css|svg|html)$/.test(name)) continue;
          const file = join(options.dir ?? "dist", name);
          const data = readFileSync(file);
          if (data.length < 1024) continue;
          writeFileSync(file + ".br", brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
          writeFileSync(file + ".gz", gzipSync(data, { level: 9 }));
        }
      },
    },
  ],
});
