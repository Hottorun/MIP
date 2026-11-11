import postgres from "postgres";

/** Postgres connection from DATABASE_URL (shell environment or .env), e.g. postgres://localhost:5432/mip. */
export function connect() {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* no .env file – rely on the environment */
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt (in .env oder der Umgebung setzen, z. B. postgres://localhost:5432/mip).");
    process.exit(1);
  }
  return postgres(url, { onnotice: () => {} });
}
