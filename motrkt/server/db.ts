import postgres from "postgres";

/**
 * Shared Postgres client from DATABASE_URL (or POSTGRES_URL, as some Vercel Marketplace databases name it), opened on
 * first use. Prepared statements are off so the pooled connection strings of Neon and Supabase work.
 */
let sql: postgres.Sql | null = null;

export function db() {
  if (sql) return sql;
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env file – rely on the environment */
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL fehlt (Postgres für Konten und Sitzungen, siehe README).");
  sql = postgres(url, { max: 5, idle_timeout: 20, prepare: false, onnotice: () => {} });
  return sql;
}
