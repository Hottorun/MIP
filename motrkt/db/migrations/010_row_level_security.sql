-- Supabase publishes every table of the public schema through its Data API (PostgREST) unless row level security is
-- on: with the project's "anon" key, which Supabase treats as public, anyone could then read users, sessions and car
-- reports. This app never uses that API; it talks to Postgres directly as the role that owns the tables, and an owner
-- is not subject to row level security. So: switch it on everywhere, with no policy, which closes the Data API and
-- changes nothing for the app.
--
-- Only tables owned by the role running this migration are touched (for any other table the app might not be the
-- owner and would lock itself out). New tables in later migrations need the same line:
--   alter table <name> enable row level security;
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = current_schema() and c.relkind = 'r' and pg_get_userbyid(c.relowner) = current_user
  loop
    execute format('alter table %I enable row level security', t.relname);
  end loop;
end $$;
