-- Per-user app state (server/userState.ts): watchlist, portfolio, price alerts, saved listings and read notifications
-- as one JSON document, so they follow the account across browsers and devices. The browser keeps a copy in
-- localStorage as a cache; the server copy wins on load. The chat history stays in the browser only.
create table user_state (
  user_id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
