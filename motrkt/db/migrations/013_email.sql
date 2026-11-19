-- Email address per account (server/auth.ts, server/mail.ts): required for new accounts, asked once from accounts that
-- existed before. Used only for the account itself (confirming the address, resetting the password), never for
-- advertising. The shared demo account (server/demo-account.json) has none.

alter table users add column email text;
alter table users add column email_verified_at timestamptz;
create unique index users_email_lower on users (lower(email)) where email is not null;

-- Links sent by email: confirm an address ('verify', 48 hours) or set a new password ('reset', 1 hour). Like the
-- sessions, only the SHA-256 of the token is stored; a used link is deleted.
create table email_tokens (
  token_hash text primary key,
  user_id text not null,
  kind text not null,               -- 'verify' | 'reset'
  email text not null,              -- the address the link went to (a changed address counts only once confirmed)
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index email_tokens_user on email_tokens (user_id);
create index email_tokens_expires on email_tokens (expires_at);

alter table email_tokens enable row level security;
