import type postgres from "postgres";

/**
 * How long premium runs (users.premium_until). Two things grant it: an approved purchase contract
 * (server/userCars.ts) and a payment (server/payments.ts). A contract and a one-time payment add their months to what
 * is still running; a subscription covers the periods its invoices paid for.
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

/** Days a subscription keeps premium past the period it paid for: the next invoice is charged about an hour into the
 * new period, and a card that fails once is tried again by Stripe. */
export const SUBSCRIPTION_GRACE_DAYS = 3;

/** Until when the period a subscription invoice paid for keeps premium. */
export function coveredUntil(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + SUBSCRIPTION_GRACE_DAYS * 86_400_000);
}

/**
 * Until when premium runs: the grants add their months (premiumFrom), a subscription covers its paid periods. The two
 * do not add up; the later date counts.
 */
export function premiumUntil(grants: (Date | Grant)[], periods: Date[]): Date | null {
  const added = premiumFrom(grants);
  const covered = periods.length ? coveredUntil(new Date(Math.max(...periods.map((d) => d.getTime())))) : null;
  return added && covered ? (added > covered ? added : covered) : (added ?? covered);
}

/**
 * Sets premium_until again from what the account still has: its approved contracts and its payments that were not
 * refunded. For the moment a grant goes away (a submission removed from the account, a refund). Runs in the caller's
 * transaction, which should hold the lock on the user's row.
 */
export async function recomputePremium(tx: postgres.TransactionSql, userId: string) {
  const approved = await tx<{ at: Date }[]>`select coalesce(reviewed_at, created_at) as at from user_cars where user_id = ${userId} and status = 'approved'`;
  let paid: (Grant & { covers_until: Date | null })[] = [];
  try {
    // in a savepoint: without the table or its newer columns (migrations 014, 015 not applied yet) nobody has paid,
    // and the transaction goes on
    paid = await tx.savepoint((sp) => sp<typeof paid>`select paid_at as at, months, covers_until from premium_payments where user_id = ${userId} and refunded_at is null`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42P01" && code !== "42703") throw err; // anything but "undefined table/column" is a real error
  }
  const once = paid.filter((p) => !p.covers_until).map((p) => ({ at: p.at, months: p.months }));
  const periods = paid.flatMap((p) => (p.covers_until ? [p.covers_until] : []));
  await tx`update users set premium_until = ${premiumUntil([...approved.map((r) => r.at), ...once], periods)} where id = ${userId}`;
}
