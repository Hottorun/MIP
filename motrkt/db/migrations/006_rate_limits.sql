-- Request counters per user (server/limits.ts): Co-Pilot calls, contract uploads and mobile.de searches per hour or
-- day. In the database, not in memory, because on Vercel many function instances answer side by side. Rows older
-- than a day are swept on each count.
create table rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index rate_events_key_at on rate_events (key, at);
