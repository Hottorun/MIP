import postgres from "postgres";

/**
 * Checks a database URL without printing the password: `DATABASE_URL="$(pbpaste)" npx tsx scripts/db/check.ts`
 * (e.g. the value copied from Vercel's environment variables). Prints user, host and port, then whether it connects.
 */
const url = process.env.DATABASE_URL ?? "";
let u: URL;
try {
  u = new URL(url);
} catch {
  console.log("Keine gültige URL (leer, oder Sonderzeichen im Passwort, die kodiert sein müssen).");
  process.exit(1);
}
console.log("Benutzer:", decodeURIComponent(u.username), "| Host:", u.hostname, "| Port:", u.port || "(keiner)", "| Datenbank:", u.pathname.slice(1));
const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} });
try {
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from sales`;
  console.log(`OK: Verbindung klappt (${n} Verkäufe in der Datenbank)`);
} catch (e) {
  console.log("Fehler:", (e as Error).message);
  process.exitCode = 1;
}
await sql.end({ timeout: 1 });
