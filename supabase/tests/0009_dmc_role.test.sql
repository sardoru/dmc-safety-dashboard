-- ════════════════════════════════════════════════════════════════════════════
-- Test: migration 0009 — the DMC role has exactly a Public Safety officer's access.
--
-- Plain local Postgres (15+), a fresh scratch database — never Supabase:
--   dropdb --if-exists dmc_0009_test; createdb dmc_0009_test && psql -X -q -v ON_ERROR_STOP=1 -d dmc_0009_test -f supabase/tests/0009_dmc_role.test.sql
--
-- It stands in for Supabase (auth.uid(), roles, storage, the Realtime publication), applies 0001–0008,
-- applies 0009, signs people up the way invitations do (an administrator, a Public Safety officer, a
-- DMC member, member businesses), files reports, notes and lookouts, then compares what DMC and the
-- officer read — every table in public, and the report photos. It checks DMC's officer work (filing,
-- triage, internal notes, lookouts), what DMC still can't do (administration, roles), how DMC ranks,
-- and 0009 run again. Each check prints "PASS …" (query results are hidden); the first failure stops
-- psql with a non-zero exit.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = notice;

-- Refuse anything but an empty scratch database: this file creates roles and users and writes test data.
do $$
begin
  if exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'realtime', 'test'))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'profiles') then
    raise exception 'Run this on a fresh scratch database (createdb dmc_0009_test), never on Supabase.';
  end if;
end $$;

-- ── Supabase stand-ins ───────────────────────────────────────────────────────

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin; end if;
end $$;

create schema auth;
create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
-- As on Supabase, signed-in users reach storage.objects through its policies.
grant select, insert, update, delete on storage.objects to authenticated;

set client_min_messages = error;  -- a plain cluster warns that wal_level isn't logical
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
set client_min_messages = notice;

-- Supabase's default privileges: new public tables and functions are granted to
-- anon/authenticated/service_role (RLS and explicit revokes decide the rest).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- ── test helpers ─────────────────────────────────────────────────────────────

create schema test;
grant usage on schema test to public;

-- Act as a signed-in user (RLS applies); test.done() is the migration runner again (no user).
create function test.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function test.done() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'none', false);
end $$;
create function test.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL %', p_label;
  end if;
  raise notice 'PASS %', p_label;
end $$;
-- True when the statement is refused for lack of a privilege or by RLS.
create function test.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;
-- True when the statement breaks a check constraint.
create function test.violates(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when check_violation then
  return true;
end $$;
-- True when the statement raises any error.
create function test.fails(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;
-- How many rows a statement touched.
create function test.rows(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
create table test.ids (name text primary key, id uuid not null);
create function test.id(p_name text) returns uuid language sql stable as $$
  select id from test.ids where name = p_name
$$;
-- Every row a query returns, as one comparable string; '(refused)' without the privilege.
create function test.rows_text(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute format('select coalesce(string_agg(q::text, %L order by q::text), %L) from (%s) q', E'\n', '', p_sql) into v;
  return v;
exception when insufficient_privilege then
  return '(refused)';
end $$;
-- …as a signed-in user reads them.
create function test.seen_by(p_user uuid, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform test.act_as(p_user);
  v := test.rows_text(p_sql);
  perform test.done();
  return v;
end $$;
-- The tables in public where two signed-in users read different rows.
create function test.differences(p_a uuid, p_b uuid) returns text[] language plpgsql as $$
declare
  t   record;
  out text[] := '{}';
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    if test.seen_by(p_a, format('select * from public.%I', t.tablename))
       is distinct from test.seen_by(p_b, format('select * from public.%I', t.tablename)) then
      out := out || t.tablename::text;
    end if;
  end loop;
  return out;
end $$;
grant all on all functions in schema test to public;
grant select on all tables in schema test to public;

-- ── migrations 0001–0008, then 0009 ──────────────────────────────────────────

set client_min_messages = warning;  -- quiet the migrations' "does not exist, skipping"
\ir ../migrations/0001_init.sql
\ir ../migrations/0002_incidents_bolos.sql
\ir ../migrations/0003_write_guards.sql
\ir ../migrations/0004_membership_and_public_map.sql
\ir ../migrations/0005_display_links.sql
\ir ../migrations/0006_invite_queue.sql
\ir ../migrations/0007_community_report_privacy.sql
\ir ../migrations/0008_invite_queue_brakes.sql
set client_min_messages = notice;

select test.check(
  test.violates($$insert into public.officer_invites (email, role) values ('early@dmc.test', 'dmc')$$),
  'R0 before 0009, an invitation can''t carry the DMC role');

set client_min_messages = warning;
\ir ../migrations/0009_dmc_role.sql
set client_min_messages = notice;

-- ── people, signed up the way invitations do it ──────────────────────────────
--   admin    the seeded super-admin (0001's invite)
--   officer  a Public Safety officer, invited by an administrator
--   dmc      a DMC member, invited by an administrator
--   b1, b2   member businesses with storefronts
--   b3       a member with no storefront

insert into public.officer_invites (email, role) values
  ('hayes@dt.test', 'officer'),
  ('dmc.member@dmc.test', 'dmc');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'sardoru@gmail.com', '{}'),
  ('00000000-0000-0000-0000-0000000000f1', 'hayes@dt.test', '{"display_name":"Officer Hayes"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'dmc.member@dmc.test', '{"display_name":"DMC Member"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'maria@ortegas.test', '{"display_name":"Maria Ortega"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'sam@riverbluff.test', '{"display_name":"Sam Lee"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'jamie@mail.test', '{}');
insert into test.ids values
  ('admin',   '00000000-0000-0000-0000-0000000000a1'),
  ('officer', '00000000-0000-0000-0000-0000000000f1'),
  ('dmc',     '00000000-0000-0000-0000-0000000000d1'),
  ('b1',      '00000000-0000-0000-0000-0000000000b1'),
  ('b2',      '00000000-0000-0000-0000-0000000000b2'),
  ('b3',      '00000000-0000-0000-0000-0000000000b3');

select test.check(
  (select role from public.profiles where id = test.id('dmc')) = 'dmc'
  and (select joined_via from public.profiles where id = test.id('dmc')) = 'invite'
  and (select status from public.officer_invites where email = 'dmc.member@dmc.test') = 'claimed'
  and (select role from public.profiles where id = test.id('officer')) = 'officer'
  and (select role from public.profiles where id = test.id('admin')) = 'admin',
  'D1 signing up claims the DMC invitation: the account is DMC, joined by invitation');

select test.act_as(test.id('dmc'));
select test.check(public.is_officer() and not public.is_admin(), 'D2 is_officer() is true for DMC and is_admin() false, as for an officer');
select test.done();
select test.check(
  public.role_rank('dmc') = public.role_rank('officer')
  and public.role_rank('dmc') > public.role_rank('business')
  and public.role_rank('dmc') < public.role_rank('admin'),
  'D3 DMC ranks with officers: above a member business, below an administrator');
select test.check(
  test.violates($$update public.profiles set role = 'superuser' where id = '00000000-0000-0000-0000-0000000000b1'$$)
  and test.violates($$insert into public.officer_invites (email, role) values ('x@dmc.test', 'superuser')$$),
  'D4 any other role is still refused');

-- ── storefronts, reports, a photo, notes and lookouts ───────────────────────

select test.act_as(test.id('b1'));
insert into public.businesses (owner_id, name, address, type, contact_name, phone, email, lat, lng)
values (test.id('b1'), 'Ortega''s Corner Market', '254 S Main St, Memphis, TN 38103', 'retail', 'Maria Ortega',
        '901-555-0101', 'maria@ortegas.test', 35.1381, -90.0544);
-- A voice report shared with the community, private fields filled, with a photo.
insert into public.reports (reporter_id, source, kind, incident_type, title, description, transcript, address, lat, lng,
                            priority, visibility, contact_ok, contact_phone, photos)
values (test.id('b1'), 'business', 'voice', 'Suspicious Person', 'Man trying car door handles on S Main St',
        'A man in a gray hoodie is trying car door handles.', 'PRIVATE-TRANSCRIPT', '254 S Main St, Memphis, TN 38103',
        35.1381, -90.0544, 2, 'community', true, 'PRIVATE-PHONE-B1',
        array['00000000-0000-0000-0000-0000000000b1/PRIVATE-PHOTO.jpg']);
-- An officers-only report.
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, contact_phone)
values (test.id('b1'), 'business', 'form', 'Theft / Shoplifting', 'Two prints taken from the front display',
        'PRIVATE-OFFICERS-ONLY', 35.139, -90.054, 'officers', 'PRIVATE-PHONE-B1');
select test.done();

select test.act_as(test.id('b2'));
insert into public.businesses (owner_id, name, address, type, contact_name, phone, email, lat, lng)
values (test.id('b2'), 'Riverbluff Coffee Co.', '115 S Main St, Memphis, TN 38103', 'restaurant', 'Sam Lee',
        '901-555-0102', 'sam@riverbluff.test', 35.1412, -90.0521);
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, contact_phone)
values (test.id('b2'), 'business', 'form', 'Trespassing', 'Person sleeping in the doorway', 'Asked to move on, refused.',
        35.1412, -90.0521, 'community', 'PRIVATE-PHONE-B2');
select test.done();

insert into storage.objects (bucket_id, name) values ('report-media', '00000000-0000-0000-0000-0000000000b1/PRIVATE-PHOTO.jpg');
insert into test.ids select 'r_b1_community', id from public.reports where title like 'Man trying car door%';
insert into test.ids select 'r_b2_community', id from public.reports where title like 'Person sleeping%';

-- The officer: a report of their own, an internal note, a lookout and an expired one.
select test.act_as(test.id('officer'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility)
values (test.id('officer'), 'officer', 'incident', 'Assault', 'Fight outside the club', 'Two men fighting.',
        35.1395, -90.0525, 'community');
insert into public.report_updates (report_id, author_name, author_role, kind, body, internal)
values (test.id('r_b1_community'), 'Officer Hayes', 'officer', 'note', 'PRIVATE-INTERNAL-NOTE', true);
insert into public.bolos (kind, title, summary, created_by, created_by_name)
values ('person', 'Repeat car prowler', 'Gray hoodie, works S Main at night.', test.id('officer'), 'Officer Hayes');
insert into public.bolos (kind, title, summary, status, created_by, created_by_name)
values ('vehicle', 'Silver sedan, no plates', 'Seen near the garage.', 'expired', test.id('officer'), 'Officer Hayes');
select test.done();

-- Administration: an access code (audited) and a request to join.
select test.act_as(test.id('admin'));
select public.create_access_code('Officers · night shift', 'officer', 5);
select test.done();
insert into public.waitlist (email, name, organization) values ('wanda@shop.test', 'Wanda W.', 'Gayoso Grocer');

-- ── reading: DMC reads exactly what an officer reads ─────────────────────────

select test.check(
  d = '{}',
  'P1 every table in public: DMC reads exactly what an officer reads'
    || case when d = '{}' then '' else ' — differs: ' || array_to_string(d, ', ') end)
  from (select test.differences(test.id('dmc'), test.id('officer')) as d) x;
select test.check(
  test.seen_by(test.id('dmc'), 'select * from public.reports') = test.rows_text('select * from public.reports')
  and test.seen_by(test.id('dmc'), 'select * from public.reports') like '%PRIVATE-PHONE-B1%'
  and test.seen_by(test.id('dmc'), 'select * from public.reports') like '%PRIVATE-OFFICERS-ONLY%'
  and test.seen_by(test.id('b2'), 'select * from public.reports') not like '%PRIVATE-PHONE-B1%',
  'P2 …every report, officers-only ones and private fields included (another member doesn''t)');
select test.check(
  test.seen_by(test.id('dmc'), 'select * from public.report_updates') like '%PRIVATE-INTERNAL-NOTE%'
  and test.seen_by(test.id('b1'), 'select * from public.report_updates') not like '%PRIVATE-INTERNAL-NOTE%',
  'P3 …internal notes (the reporter doesn''t see them)');
select test.check(
  test.seen_by(test.id('dmc'), 'select name from public.businesses') = test.rows_text('select name from public.businesses')
  and test.seen_by(test.id('b2'), 'select name from public.businesses')
      = test.rows_text($$select name from public.businesses where name = 'Riverbluff Coffee Co.'$$),
  'P4 …the business directory (a member reads only its own storefront)');
select test.check(
  test.seen_by(test.id('dmc'), 'select title from public.bolos') like '%Silver sedan%'
  and test.seen_by(test.id('b2'), 'select title from public.bolos') not like '%Silver sedan%',
  'P5 …expired lookouts too (members see the active ones)');
select test.check(
  test.seen_by(test.id('dmc'), 'select name from storage.objects') = test.seen_by(test.id('officer'), 'select name from storage.objects')
  and test.seen_by(test.id('dmc'), 'select name from storage.objects') like '%PRIVATE-PHOTO.jpg%'
  and test.seen_by(test.id('b2'), 'select name from storage.objects') = '',
  'P6 …and report photos, as an officer does (another member sees none)');
select test.check(
  test.seen_by(test.id('dmc'), 'select * from public.officer_invites') = ''
  and test.seen_by(test.id('dmc'), 'select * from public.audit_log') = ''
  and test.seen_by(test.id('dmc'), 'select * from public.access_codes') = ''
  and test.seen_by(test.id('dmc'), 'select * from public.waitlist') = ''
  and test.seen_by(test.id('admin'), 'select * from public.officer_invites') not in ('', '(refused)')
  and test.seen_by(test.id('admin'), 'select * from public.audit_log') not in ('', '(refused)')
  and test.seen_by(test.id('admin'), 'select * from public.access_codes') not in ('', '(refused)')
  and test.seen_by(test.id('admin'), 'select * from public.waitlist') not in ('', '(refused)'),
  'P7 …but not what only administrators read: invitations, the activity log, access codes, requests to join');

-- ── officer work: DMC files, triages, notes and publishes like an officer ────

select test.act_as(test.id('dmc'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, status, priority)
values (test.id('dmc'), 'officer', 'incident', 'Vandalism', 'Tagging on the Main St Mall planters', 'Fresh paint.',
        35.1420, -90.0520, 'officers', 'acknowledged', 3);
select test.done();
select test.check(
  (select source = 'officer' and status = 'acknowledged' and reporter_id = test.id('dmc')
     from public.reports where title like 'Tagging on the Main St Mall%'),
  'W1 DMC files a report the way an officer does (a Public Safety report, its status kept)');

select test.act_as(test.id('dmc'));
select test.check(
  test.rows($$update public.reports set status = 'responding', priority = 1,
                assigned_to = '00000000-0000-0000-0000-0000000000d1', assigned_name = 'DMC Member'
              where title like 'Person sleeping%'$$) = 1,
  'W2 DMC triages a member''s report…');
select test.done();
select test.check(
  (select status = 'responding' and priority = 1 and assigned_to = test.id('dmc')
     from public.reports where id = test.id('r_b2_community')),
  'W2 …and the change sticks (a member''s own edit would be undone)');

select test.act_as(test.id('dmc'));
insert into public.report_updates (report_id, author_name, author_role, kind, body, internal)
values (test.id('r_b2_community'), 'DMC Member', 'dmc', 'note', 'DMC-INTERNAL-NOTE', true);
select test.done();
select test.check(
  (select internal and author_id = test.id('dmc') and author_role = 'dmc' from public.report_updates where body = 'DMC-INTERNAL-NOTE'),
  'W3 DMC keeps a note internal, as officers do (the author is stamped)');

select test.act_as(test.id('dmc'));
select test.check(
  test.rows($$insert into public.bolos (kind, title, summary, created_by, created_by_name)
              values ('person', 'Man with a red backpack', 'Two thefts on S Main.', '00000000-0000-0000-0000-0000000000d1', 'DMC Member')$$) = 1,
  'W4 DMC publishes a lookout…');
select test.done();
select test.act_as(test.id('b2'));
select test.check(
  test.refused($$insert into public.bolos (kind, title, summary) values ('person', 'Not allowed', 'x')$$),
  'W4 …which a member business can''t');
select test.done();

-- ── administration stays with administrators ─────────────────────────────────

select test.act_as(test.id('dmc'));
update public.profiles set role = 'admin' where id = test.id('dmc');
select test.check(
  test.rows($$update public.profiles set role = 'business' where id = '00000000-0000-0000-0000-0000000000f1'$$) = 0
  and test.rows($$update public.app_settings set signup_mode = 'invite'$$) = 0
  and test.rows($$delete from public.report_updates$$) = 0
  and test.fails($$select public.create_access_code('DMC code', 'business', 5)$$),
  'A1 DMC can''t change anyone''s role or the settings, delete notes or make access codes');
select test.done();
select test.check(
  (select role from public.profiles where id = test.id('dmc')) = 'dmc'
  and (select role from public.profiles where id = test.id('officer')) = 'officer'
  and (select signup_mode from public.app_settings) = 'open'
  and exists (select 1 from public.report_updates where body = 'PRIVATE-INTERNAL-NOTE'),
  'A2 …nothing changed, and DMC can''t make itself an administrator');

-- ── ranking: an officer code never moves DMC; an administrator can ───────────

-- Redeemed in statements of their own: a check in the same statement would read the profiles as they were.
select public.redeem_access_code((select code from public.access_codes where label = 'Officers · night shift'), 'dmc.member@dmc.test');
select public.redeem_access_code((select code from public.access_codes where label = 'Officers · night shift'), 'jamie@mail.test');
select test.check(
  (select outcome from public.access_code_redemptions where email = 'dmc.member@dmc.test') = 'existing'
  and (select role from public.profiles where id = test.id('dmc')) = 'dmc',
  'M1 an officer access code leaves a DMC account as it is (same rank, never moved sideways)');
select test.check(
  (select outcome from public.access_code_redemptions where email = 'jamie@mail.test') = 'upgraded'
  and (select role from public.profiles where id = test.id('b3')) = 'officer',
  'M2 …while it still raises a member to officer');
select test.act_as(test.id('admin'));
update public.profiles set role = 'dmc' where id = test.id('b3');
select test.done();
select test.check(
  (select role from public.profiles where id = test.id('b3')) = 'dmc'
  and exists (select 1 from public.audit_log where action = 'member.role_changed' and target = 'jamie@mail.test'
                and meta ->> 'from' = 'officer' and meta ->> 'to' = 'dmc'),
  'M3 an administrator can make an account DMC, and the change is in the activity log');

-- ── 0009 again ───────────────────────────────────────────────────────────────

set client_min_messages = warning;
\ir ../migrations/0009_dmc_role.sql
set client_min_messages = notice;
select test.check(
  (select count(*) from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_role_check') = 1
  and (select count(*) from pg_constraint where conrelid = 'public.officer_invites'::regclass and conname = 'officer_invites_role_check') = 1
  and (select role from public.profiles where id = test.id('dmc')) = 'dmc'
  and test.differences(test.id('dmc'), test.id('officer')) = '{}',
  'I1 running 0009 again changes nothing');

-- A leftover role check that leaves out DMC stops 0009: claiming a DMC invitation would fail on it.
alter table public.profiles add constraint profiles_role_legacy check (role in ('business', 'officer', 'admin')) not valid;
\echo 'Expected next: 0009 stopping on a leftover role check (one ERROR line).'
\set ON_ERROR_STOP 0
\ir ../migrations/0009_dmc_role.sql
\set ON_ERROR_STOP 1
select test.check(
  :'LAST_ERROR_MESSAGE' like 'A role check on profiles or officer_invites leaves out dmc%',
  'I2 …and it stops on a leftover role check that leaves out DMC');
alter table public.profiles drop constraint profiles_role_legacy;

\echo
\echo 'All 0009 checks passed.'
