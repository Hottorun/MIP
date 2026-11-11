-- Market data: auction results, asking prices, tracked listings and the market model, loaded by `npm run db:import`
-- from the files the daily update writes (src/data/real). Every import replaces the current snapshot in one
-- transaction; data_imports records each run.

create table data_imports (
  id bigint generated always as identity primary key,
  as_of date not null,
  imported_at timestamptz not null default now(),
  counts jsonb not null
);

-- Auction results (sales.csv). price_eur includes the buyer's premium; null when the lot did not sell.
create table sales (
  lot_id text primary key,
  variant_id text not null,
  title text not null,
  sale_date date not null,
  channel text not null,
  house text not null,
  sold boolean not null,
  price_eur integer,
  estimate_low integer,
  estimate_high integer,
  condition text,
  km integer,
  buyer_country text,
  origin_country text,
  delivery_country text,
  color text,
  body text,
  gearbox text,
  chassis text,
  url text,
  price_original bigint,
  currency text,
  location text
);
create index sales_variant_date on sales (variant_id, sale_date desc);
create index sales_date on sales (sale_date desc);
create index sales_chassis on sales (chassis) where chassis is not null;

-- Asking prices of cars for sale in Europe (asks.json), one row per listing as last seen.
create table asks (
  id text primary key,
  variant_id text not null,
  seen_on date not null,
  price_eur integer not null,
  price integer not null,
  currency text not null,
  km integer,
  year smallint not null,
  title text not null,
  body text,
  seller_type text not null,
  seller_name text,
  country text not null,
  url text not null,
  source text not null,
  -- why the listing does not enter the market value; null if it does
  excluded text,
  note text
);
create index asks_variant on asks (variant_id);

-- Every listing followed over time (listing-history.json), keyed by URL.
create table listing_history (
  url text primary key,
  source text not null,
  variant_id text,
  currency text not null,
  first_seen date not null,
  last_seen date not null,
  status text not null check (status in ('active', 'gone')),
  gone_on date,
  -- [[day, price], ...] at the first sighting and at each change of at least 1 %
  prices jsonb not null
);
create index listing_history_variant on listing_history (variant_id);

-- Market model (market-model.json): one row per variant with records, plus the model-wide figures. value is null
-- below the minimum number of records (market_meta.minN); lo/hi and series are null where they cannot be measured.
create table variant_values (
  variant_id text primary key,
  value integer,
  lo integer,
  hi integer,
  n integer not null,
  n12 integer,
  n24 integer,
  first_sale date,
  last_sale date,
  index_group text not null,
  family text not null,
  own_series boolean,
  -- monthly values on market_meta.grid
  series integer[],
  -- channel counts, shares and levels, houses, gearbox and body effects, excluded prices
  detail jsonb not null
);

create table market_meta (
  key text primary key,
  value jsonb not null
);
