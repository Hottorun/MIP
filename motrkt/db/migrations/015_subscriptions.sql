-- Premium as a subscription (server/payments.ts): where the Stripe price is a recurring one, every paid invoice is a
-- row of premium_payments, keyed by the invoice (in_…) instead of the Checkout Session. Such a row covers a period
-- rather than adding months: premium runs until covers_until (plus a few days of grace, server/premium.ts), and the
-- next paid invoice moves that on. customer is what the account's "manage subscription" page at Stripe needs.
alter table premium_payments
  add column if not exists customer text,            -- Stripe Customer (cus_…)
  add column if not exists subscription text,        -- Stripe Subscription (sub_…); null: a one-time payment
  add column if not exists covers_until timestamptz; -- end of the period this invoice paid for; null: a one-time payment
create index if not exists premium_payments_customer on premium_payments (customer) where customer is not null;
