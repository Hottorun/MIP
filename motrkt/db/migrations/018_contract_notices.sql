-- Withdrawals and cancellations declared on the site without signing in (server/notices.ts, /widerruf and
-- /kuendigen): what was declared, by whom and when it arrived, so that the declaration can be proven and acted on
-- (the refund after a withdrawal, the end of a subscription). Kept as business correspondence for as long as
-- commercial and tax law require; the row stays when the account is deleted (DATENSCHUTZ.md).
create table contract_notices (
  id text primary key,
  kind text not null check (kind in ('widerruf', 'kuendigung')),
  email text not null,                       -- where the confirmation went
  name text,
  username text,
  contract text not null,                    -- 'abo', 'einmal', 'kaufvertrag' (server/legalPages.ts CONTRACTS)
  details jsonb not null default '{}',       -- kind of cancellation, reason, wished end, order date, language
  user_id text,                              -- the account with this address, if there is one
  outcome text,                              -- what happened by itself (renewal stopped at Stripe, or what is left to do)
  received_at timestamptz not null default now()
);
create index contract_notices_received on contract_notices (received_at);
create index contract_notices_user on contract_notices (user_id) where user_id is not null;

alter table contract_notices enable row level security;
