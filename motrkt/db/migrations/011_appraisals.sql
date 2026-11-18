-- Appraisals (Wertgutachten) next to purchase contracts, and uploaded documents that live for a day at most
-- (server/userCars.ts, DATENSCHUTZ.md).

-- A report now rests on a purchase contract or on an appraisal of a car the user owns. An appraisal has no buyer,
-- seller or counterparty; `price` is the appraised value, `sale_date` the day of the appraisal.
alter table user_cars add column kind text not null default 'kaufvertrag';   -- 'kaufvertrag' | 'gutachten'
alter table user_cars add column appraiser text;                             -- gutachten: who wrote it (Classic Data, TÜV, DEKRA …)
alter table user_cars add column value_basis text;                           -- gutachten: 'marktwert' | 'wiederbeschaffungswert' | 'wiederherstellungswert'
alter table user_cars alter column role drop not null;
alter table user_cars alter column counterparty drop not null;

-- When the document was uploaded: it is deleted a day later at the latest, decided or not (RETENTION.documentHours).
alter table user_cars add column contract_at timestamptz;
update user_cars set contract_at = created_at where contract is not null;
create index user_cars_contract_at on user_cars (contract_at) where contract is not null;

-- The deletion must not depend on someone visiting the site. Where pg_cron is available (Supabase), the database
-- itself removes documents every 15 minutes once they are 23 hours old, an hour before the promised day is over; the
-- sweep in server/userCars.ts does the same on requests and is all there is elsewhere (local development).
-- Changing the period: change it here in a new migration and in RETENTION together.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'mip-documents-expire',
      '*/15 * * * *',
      format(
        'update %I.user_cars set status = case when status = ''pending'' then ''expired'' else status end, '
        'contract = null, contract_name = null, contract_deleted_at = now() '
        'where contract is not null and coalesce(contract_at, created_at) < now() - interval ''23 hours''',
        current_schema()
      )
    );
  else
    raise notice 'pg_cron is not available: documents are removed by the sweep in server/userCars.ts only';
  end if;
exception when others then
  raise notice 'pg_cron could not be set up (%): documents are removed by the sweep in server/userCars.ts only', sqlerrm;
end $$;
