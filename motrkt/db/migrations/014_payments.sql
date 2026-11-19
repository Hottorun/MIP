-- Paid premium (server/payments.ts): one row per payment that was granted, keyed by the Stripe Checkout Session so
-- the same payment never counts twice, whether the return from Checkout or the webhook reports it first. Kept is what
-- the grant needs: the account, the months, the amount as charged and Stripe's ids. No name, address or card data;
-- those stay with Stripe. users.premium_until holds the result, together with the months from approved purchase
-- contracts (server/premium.ts).
create table premium_payments (
  id text primary key,                    -- Stripe Checkout Session (cs_…)
  user_id text not null,                  -- users.id; 'deleted:…' once the account is gone (server/auth.ts)
  months integer not null,
  amount numeric(12, 2) not null,         -- as charged, in `currency`
  currency text not null,
  payment_intent text,                    -- Stripe PaymentIntent (pi_…): a refund names it
  paid_at timestamptz not null default now(),
  refunded_at timestamptz                 -- refunded in full: the months no longer count
);
create index premium_payments_user on premium_payments (user_id);
create index premium_payments_intent on premium_payments (payment_intent) where payment_intent is not null;

alter table premium_payments enable row level security;
