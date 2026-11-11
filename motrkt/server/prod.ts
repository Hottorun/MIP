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

createServer(handleRequest).listen(PORT, () => {
  console.log(`MIP läuft auf http://localhost:${PORT}`);
});
