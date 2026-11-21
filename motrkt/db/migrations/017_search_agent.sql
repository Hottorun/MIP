-- The search agent (server/searchAgent.ts, server/searchJobs.ts, server/searchApi.ts): once a day Claude reads the
-- dealer pages the reviewers entered (search_sources), the cars found there are kept as search_listings, and each
-- customer's search order (search_orders) is matched against them (search_matches, with a short market analysis on
-- the order itself). search_runs logs every call with its token use, so the cost stays visible on the admin page.

-- Dealer stock pages and single listings to watch, entered by the reviewers at /suchquellen.
create table search_sources (
  id text primary key,
  url text not null,
  host text not null,                -- the address's host without "www.": the agent may only fetch pages there
  name text not null default '',     -- the dealer's name: entered by the reviewer, else as read from the page
  note text not null default '',     -- a hint for the agent, e.g. "nur Porsche" or "Bestand über mehrere Seiten"
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  due_at timestamptz default now(),  -- queued for a scan from then on; null: nothing to do until the next daily run
  scan_started_at timestamptz,       -- a run has claimed the source (stale after 15 minutes)
  scanned_at timestamptz,            -- end of the last scan, successful or not
  scan_ok boolean,
  scan_error text,
  scan_note text                     -- what the agent said about the page ("Bestand wird per JavaScript geladen")
);
create unique index search_sources_url on search_sources (lower(url));

-- Cars for sale as read from a source. A car missing from a complete scan is marked gone, not deleted, so a
-- customer's match can still say that it was sold.
create table search_listings (
  id text primary key,
  source_id text not null references search_sources (id) on delete cascade,
  key text not null,                 -- the listing's address, or address plus a hash of its data where several share one page
  url text not null,
  title text not null,
  make text,
  model text,
  year smallint,
  km integer,
  price integer,                     -- in `currency`; null where the page states none ("Preis auf Anfrage")
  currency text,
  price_prev integer,                -- the asking price before the last change
  price_changed_at timestamptz,
  location text,
  gearbox text,
  body text,
  color text,
  image text,
  details text not null default '',  -- condition, history and equipment in a few sentences, as stated on the page
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  gone_at timestamptz,
  unique (source_id, key)
);
create index search_listings_active on search_listings (source_id) where gone_at is null;

-- What a customer is looking for, in their own words plus a few hard limits. The newest analysis sits on the order.
create table search_orders (
  id text primary key,
  user_id text not null,
  title text not null,
  query text not null,
  variant_id text,                   -- optional: the catalogue variant, for the market value as context
  variant_title text,
  price_max integer,                 -- EUR
  year_from smallint,
  year_to smallint,
  km_max integer,
  lang text not null default 'de',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  due_at timestamptz default now(),  -- queued for an analysis from then on (new or changed order, a source was read)
  run_started_at timestamptz,        -- a run has claimed the order (stale after 15 minutes)
  last_run_at timestamptz,
  last_input_hash text,              -- order and candidates of the last analysis: unchanged input is not analysed again
  last_error text,
  summary text,
  summary_at timestamptz
);
create index search_orders_user on search_orders (user_id);

create table search_matches (
  order_id text not null references search_orders (id) on delete cascade,
  listing_id text not null references search_listings (id) on delete cascade,
  score smallint not null,           -- 0–100: how well the car fits the order
  reason text not null,
  concerns text not null default '',
  current boolean not null default true,  -- still part of the newest analysis
  matched_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (order_id, listing_id)
);

create table search_runs (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('source', 'order')),
  ref_id text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
  ok boolean not null,
  error text,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  fetches integer not null default 0,
  found integer not null default 0   -- listings read (source) or matches kept (order)
);
create index search_runs_started on search_runs (started_at desc);

-- Search orders beyond those a plan includes (lite none, premium three: server/searchPayments.ts) are a subscription
-- of their own, one price per order and month. One row per paid invoice, like premium_payments: the newest row of a
-- subscription says how many orders it pays for and until when. Stored is what the entitlement needs, never an
-- address or card; those stay with Stripe.
create table search_payments (
  id text primary key,               -- Stripe invoice (in_…)
  user_id text not null,             -- users.id; 'deleted:…' once the account is gone (server/auth.ts)
  subscription text not null,        -- Stripe Subscription (sub_…)
  customer text,                     -- Stripe Customer (cus_…)
  quantity integer not null,         -- search orders the subscription pays for
  amount numeric(12, 2) not null,    -- as charged, in `currency`
  currency text not null,
  payment_intent text,               -- Stripe PaymentIntent (pi_…): a refund names it
  paid_at timestamptz not null default now(),
  covers_until timestamptz not null, -- end of the period this invoice paid for
  refunded_at timestamptz            -- refunded in full: its orders no longer count
);
create index search_payments_user on search_payments (user_id);
create index search_payments_subscription on search_payments (subscription);
create index search_payments_intent on search_payments (payment_intent) where payment_intent is not null;

-- closes Supabase's Data API for these tables (010_row_level_security.sql); the app connects as their owner
alter table search_sources enable row level security;
alter table search_listings enable row level security;
alter table search_orders enable row level security;
alter table search_matches enable row level security;
alter table search_runs enable row level security;
alter table search_payments enable row level security;
