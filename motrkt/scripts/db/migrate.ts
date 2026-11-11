import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { connect } from "./client.ts";

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
