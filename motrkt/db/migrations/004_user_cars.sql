-- Cars users bought or sold themselves (server/userCars.ts). The user enters the car's data and uploads the purchase
-- contract; Claude reads the contract and compares it with the entries (ai_check), a reviewer (MIP_ADMINS) approves or
-- rejects. The contract is deleted on either decision (contract = null, contract_deleted_at set): afterwards only the
-- checked car data and who approved it on which day remain. Approved rows enter the market model on the next daily
-- run (scripts/db/export-user-cars.ts) and give the user free premium access (users.premium_until).

alter table users add column premium_until timestamptz;

create table user_cars (
  id text primary key,
  user_id text not null,
  created_at timestamptz not null default now(),
  -- awaiting_contract -> pending -> approved | rejected; withdrawn by the user before a decision
  status text not null default 'awaiting_contract',
  role text not null,               -- 'kauf' (the user bought the car) or 'verkauf' (sold it)
  variant_id text not null,
  title text not null,              -- the car as the user names it, e.g. "911 Carrera 3.2 Coupé"
  build_year smallint not null,
  vin text not null,
  km integer not null,
  price numeric(14, 2) not null,    -- agreed price as in the contract
  currency text not null,
  sale_date date not null,
  country text not null,            -- where the car changed hands (ISO code)
  counterparty text not null,       -- the other side: 'privat', 'haendler' or 'auktion'
  body text,
  gearbox text,
  steering text,                    -- 'links' or 'rechts'
  color_ext text,
  color_int text,
  condition text,                   -- grade 1 to 5 (classic car scale)
  matching_numbers boolean,
  accident_free boolean,
  notes text,
  contract bytea,
  contract_type text,
  contract_name text,
  contract_size integer,
  contract_deleted_at timestamptz,
  ai_check jsonb,
  ai_checked_at timestamptz,
  reviewer text,
  reviewed_at timestamptz,
  review_note text
);
create index user_cars_user on user_cars (user_id, created_at desc);
create index user_cars_status on user_cars (status, created_at);
