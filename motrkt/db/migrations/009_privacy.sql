-- Data protection (server/userCars.ts, server/contractVault.ts, DATENSCHUTZ.md).

-- Proof of consent (Art. 7 (1) GDPR): when the user agreed and to which wording (CONSENT_VERSION), and whether they
-- allowed the AI pre-check by Anthropic. Reports from before this migration agreed to a text that included the AI
-- check, so they keep it; new reports allow it only if the user ticks the box.
alter table user_cars add column consent_at timestamptz;
alter table user_cars add column consent_version text;
alter table user_cars add column ai_consent boolean not null default false;
update user_cars set consent_at = created_at, consent_version = '2026-11-16', ai_consent = true;

-- Withdrawn reports used to keep their row (chassis number, price, notes). Withdrawing now deletes the report, and so
-- does this for the ones withdrawn earlier.
delete from user_cars where status = 'withdrawn';

-- Who opened or decided which contract, and when: every reviewer access leaves a line here (kept for a year).
create table contract_access (
  car_id text not null,
  reviewer text not null,
  action text not null,             -- 'view' | 'ai_check' | 'approve' | 'reject'
  at timestamptz not null default now()
);
create index contract_access_car on contract_access (car_id, at);
create index contract_access_at on contract_access (at);

-- A post its author removed no longer keeps its text (right to erasure); the empty row stays for the thread's order.
update forum_posts set body = '' where hidden_at is not null and hidden_by = username;

-- Failed sign-ins are now counted under a hash of name and address instead of the plain values; the old rows expire
-- within a day anyway and would no longer match.
delete from auth_failures;
