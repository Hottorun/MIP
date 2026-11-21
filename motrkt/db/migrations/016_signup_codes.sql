-- Sign-up in two steps (server/auth.ts): the form's entries wait here until the 6-digit code from the mail to the
-- given address is entered; only then is the account created, with that address already confirmed. Like passwords
-- and session tokens, neither the password nor the code is stored, only the scrypt hash of the one and the SHA-256 of
-- the other. A row lives 15 minutes and allows 5 wrong codes; a new code for the same sign-up replaces the old one.
create table signup_codes (
  id text primary key,              -- handed to the browser, which sends it back with the code
  username text not null,
  email text not null,
  salt text not null,
  hash text not null,               -- scrypt hash of the chosen password, moved to users as it is
  lang text not null default 'de',
  code_hash text not null,          -- SHA-256 of id + code
  attempts int not null default 0,  -- wrong codes so far
  sends int not null default 1,     -- codes sent for this sign-up (at most 5)
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index signup_codes_expires on signup_codes (expires_at);
create index signup_codes_email on signup_codes (lower(email));
create index signup_codes_username on signup_codes (lower(username));

alter table signup_codes enable row level security;
