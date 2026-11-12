-- Highest bid of an unsold auction lot (Bring a Trailer), EUR. Shown in the app only, never part of the market value.
alter table sales add column if not exists high_bid_eur integer;
