import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { handleRequest } from "./app.ts";

/** Local production server: `npm run build`, then `npm start`. On Vercel, api/server.ts serves the same handler. */
const PORT = Number(process.env.PORT ?? 4173);

if (!existsSync(process.env.MIP_DIST ?? join(process.cwd(), "dist"))) {
  console.error("dist/ fehlt – bitte zuerst `npm run build` ausführen.");
  process.exit(1);
}

// A rejected request handler must not take the whole server down (Node exits on unhandled rejections by default).
process.on("unhandledRejection", (err) => console.error("unhandled", err));

createServer((req, res) =>
  handleRequest(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.statusCode = 500;
    res.end();
  }),
).listen(PORT, () => {
  console.log(`Cartag läuft auf http://localhost:${PORT}`);
});
