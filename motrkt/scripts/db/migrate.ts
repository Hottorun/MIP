import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect } from "./client.ts";

/**
 * `npm run db:migrate` works on the database in .env (locally: localhost). `npm run db:migrate:prod` (--prod) works on
 * the production database instead: its address comes only from .env.production.local (never committed), and the
 * script names the server it is about to change before it starts.
 */
if (process.argv.includes("--prod")) {
  const FILE = ".env.production.local";
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  try {
    process.loadEnvFile(FILE);
  } catch {
    console.error(`${FILE} fehlt. Anlegen (motrkt/${FILE}) mit einer Zeile: DATABASE_URL=<Adresse der Produktionsdatenbank aus Vercel/Supabase>`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    /* checked below */
  }
  if (!host || host === "localhost" || host === "127.0.0.1") {
    console.error(`In ${FILE} steht keine Produktionsadresse (DATABASE_URL leer, ungültig oder localhost).`);
    process.exit(1);
  }
  console.log(`Produktionsdatenbank: ${host}`);
} else {
  console.log("Lokale Datenbank aus .env (für die Produktion: npm run db:migrate:prod)");
}

/** Applies the SQL files in db/migrations that have not run yet, in name order, each in its own transaction. */
const DIR = fileURLToPath(new URL("../../db/migrations/", import.meta.url));
const sql = connect();

await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
const done = new Set((await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name));
const pending = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql") && !done.has(f))
  .sort();

for (const name of pending) {
  await sql.begin(async (tx) => {
    await tx.unsafe(readFileSync(DIR + name, "utf8"));
    await tx`insert into schema_migrations (name) values (${name})`;
  });
  console.log("applied", name);
}
console.log(pending.length ? `${pending.length} migration(s) applied` : "schema up to date");
await sql.end();
