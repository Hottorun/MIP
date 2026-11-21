import { db } from "./db.ts";

/**
 * Per-user request limits for the paid or scarce upstream services (Claude, mobile.de) and uploads
 * (db/migrations/006_rate_limits.sql). Every account can register freely, so without a cap one throwaway account
 * could burn the API budget.
 */
export const LIMITS = {
  copilot: { max: 60, minutes: 60 }, // Co-Pilot answers per user and hour
  contract: { max: 10, minutes: 24 * 60 }, // contract uploads per user and day (the AI check runs on each)
  mobilede: { max: 600, minutes: 60 }, // mobile.de searches per user and hour (one app start needs a few dozen)
  fehler: { max: 30, minutes: 60 }, // browser error reports per user and hour
  checkout: { max: 20, minutes: 60 }, // Stripe Checkout pages opened or confirmed per user and hour (server/payments.ts)
  suchauftrag: { max: 20, minutes: 24 * 60 }, // search orders created, changed or run again per user and day (Claude analyses each)
  losfotos: { max: 300, minutes: 60 }, // lot pages read for photos per user and hour (cached lots do not count)
} as const;

/** Counts one request for `key`; true when the limit for this window is already used up (the request is not counted then). */
export async function overLimit(kind: keyof typeof LIMITS, userId: string): Promise<boolean> {
  const { max, minutes } = LIMITS[kind];
  const key = `${kind}:${userId}`;
  try {
    const [{ n }] = await db()<{ n: number }[]>`
      select count(*)::int as n from rate_events where key = ${key} and at > now() - interval '1 minute' * ${minutes}`;
    if (n >= max) return true;
    await db()`insert into rate_events (key) values (${key})`;
    if (Math.random() < 0.02) await db()`delete from rate_events where at < now() - interval '1 day'`;
    return false;
  } catch (err) {
    // e.g. migration 006 not applied yet: the feature keeps working, the missing limit is logged every time
    console.error("rate limit unavailable (npm run db:migrate?)", err);
    return false;
  }
}
