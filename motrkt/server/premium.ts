import type postgres from "postgres";

/**
 * How long premium runs (users.premium_until). Two things grant it: an approved purchase contract
 * (server/userCars.ts) and a payment (server/payments.ts). Each grant adds its months to what is still running.
 */

/** Months of premium for one approved purchase contract, and for one payment unless the Stripe price says otherwise. */
export const PREMIUM_MONTHS = 12;

export type Grant = { at: Date; months: number };

/** Until when premium runs for these grants (a bare date is an approval): each adds its months to what is still running. */
export function premiumFrom(grants: (Date | Grant)[]): Date | null {
  return grants
    .map((g) => (g instanceof Date ? { at: g, months: PREMIUM_MONTHS } : g))
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .reduce<Date | null>((until, g) => {
      const next = new Date(until && until > g.at ? until : g.at);
      next.setUTCMonth(next.getUTCMonth() + g.months);
      return next;
    }, null);
}

/**
 * Sets premium_until again from what the account still has: its approved contracts and its payments that were not
 * refunded. For the moment a grant goes away (a submission removed from the account, a refund). Runs in the caller's
 * transaction, which should hold the lock on the user's row.
 */
export async function recomputePremium(tx: postgres.TransactionSql, userId: string) {
  const approved = await tx<{ at: Date }[]>`select coalesce(reviewed_at, created_at) as at from user_cars where user_id = ${userId} and status = 'approved'`;
  let paid: Grant[] = [];
  try {
    // in a savepoint: without the table (migration 014 not applied yet) nobody has paid, and the transaction goes on
    paid = await tx.savepoint((sp) => sp<Grant[]>`select paid_at as at, months from premium_payments where user_id = ${userId} and refunded_at is null`);
  } catch (err) {
    if ((err as { code?: string }).code !== "42P01") throw err; // anything but "undefined table" is a real error
  }
  await tx`update users set premium_until = ${premiumFrom([...approved.map((r) => r.at), ...paid])} where id = ${userId}`;
}
