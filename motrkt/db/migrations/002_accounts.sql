-- Accounts (server/auth.ts): username and scrypt hash per user, never the password; sessions store only the SHA-256
-- of the token. The shared demo account lives in server/demo-account.json and is never written here, so its sessions
-- reference a user id without a row (no foreign key).

create table users (
  id text primary key,
  username text not null,
  salt text not null,
  hash text not null,
  created_at timestamptz not null default now()
);
create unique index users_username_lower on users (lower(username));

create table sessions (
  token_hash text primary key,
  user_id text not null,
  expires_at timestamptz not null
);
create index sessions_user on sessions (user_id);
create index sessions_expires on sessions (expires_at);

-- Failed sign-ins and sign-ups per name or address, for the brute-force brake (8 within 15 minutes)
create table auth_failures (
  key text not null,
  at timestamptz not null default now()
);
create index auth_failures_key_at on auth_failures (key, at);
