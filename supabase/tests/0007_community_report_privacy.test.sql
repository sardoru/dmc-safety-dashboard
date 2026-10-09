-- ════════════════════════════════════════════════════════════════════════════
-- Test: migration 0007 — private report fields stay private.
--
-- Plain local Postgres (15+), a fresh scratch database — never Supabase:
--   dropdb --if-exists dmc_0007_test; createdb dmc_0007_test && psql -X -q -v ON_ERROR_STOP=1 -d dmc_0007_test -f supabase/tests/0007_community_report_privacy.test.sql
--
-- It stands in for Supabase (auth.uid(), roles, storage, the Realtime
-- publication), applies 0001–0006, files reports as real members would, applies
-- 0007, checks who can read what, checks the triggers, then applies 0007 again.
-- Each check prints "PASS …" (query results are hidden); the first failure
-- stops psql with a non-zero exit.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = notice;

-- Refuse anything but an empty scratch database: this file creates roles and
-- users and writes test data.
do $$
begin
  if exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'realtime', 'test'))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'reports') then
    raise exception 'Run this on a fresh scratch database (createdb dmc_0007_test), never on Supabase.';
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

-- Act as a signed-in user (RLS applies) or a visitor; test.done() is the
-- migration runner again (no user, so auth.uid() is null).
create function test.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function test.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  perform set_config('role', 'anon', false);
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
create table test.ids (name text primary key, id uuid not null);
create function test.id(p_name text) returns uuid language sql stable as $$
  select id from test.ids where name = p_name
$$;
create table test.snap (label text primary key, fingerprint text, xmins text);
grant all on all functions in schema test to public;
grant select on all tables in schema test to public;

-- ── migrations 0001–0006 ─────────────────────────────────────────────────────

set client_min_messages = warning;  -- quiet the migrations' "does not exist, skipping"
\ir ../migrations/0001_init.sql
\ir ../migrations/0002_incidents_bolos.sql
\ir ../migrations/0003_write_guards.sql
\ir ../migrations/0004_membership_and_public_map.sql
\ir ../migrations/0005_display_links.sql
\ir ../migrations/0006_invite_queue.sql
set client_min_messages = notice;

-- ── people ───────────────────────────────────────────────────────────────────
--   admin   the seeded super-admin (0001's invite)
--   officer a Public Safety officer
--   b1      Ortega's Corner Market (storefront)
--   b2      Riverbluff Coffee Co. (storefront)
--   b3      a member with no storefront yet (files under their own name)

insert into public.officer_invites (email, role, status) values ('hayes@dt.test', 'officer', 'pending');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'sardoru@gmail.com', '{}'),
  ('00000000-0000-0000-0000-0000000000f1', 'hayes@dt.test',     '{"display_name":"Officer Hayes"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'maria@ortegas.test', '{"display_name":"Maria Ortega"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'sam@riverbluff.test', '{"display_name":"Sam Lee"}'),
  ('00000000-0000-0000-0000-0000000000b3', 'jamie.private@mail.test', '{}');
insert into test.ids values
  ('admin',   '00000000-0000-0000-0000-0000000000a1'),
  ('officer', '00000000-0000-0000-0000-0000000000f1'),
  ('b1',      '00000000-0000-0000-0000-0000000000b1'),
  ('b2',      '00000000-0000-0000-0000-0000000000b2'),
  ('b3',      '00000000-0000-0000-0000-0000000000b3');

select test.act_as(test.id('b1'));
insert into public.businesses (owner_id, name, address, type, contact_name, phone, email, lat, lng)
values (test.id('b1'), 'Ortega''s Corner Market', '254 S Main St, Memphis, TN 38103', 'retail', 'Maria Ortega',
        '901-555-0101', 'maria@ortegas.test', 35.1381, -90.0544);
select test.done();
select test.act_as(test.id('b2'));
insert into public.businesses (owner_id, name, address, type, contact_name, phone, email, lat, lng)
values (test.id('b2'), 'Riverbluff Coffee Co.', '115 S Main St, Memphis, TN 38103', 'restaurant', 'Sam Lee',
        '901-555-0102', 'sam@riverbluff.test', 35.1412, -90.0521);
select test.done();

-- ── reports filed before 0007, the way the app files them ───────────────────

-- b1: a voice report shared with the community, with every private field filled.
select test.act_as(test.id('b1'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, transcript, business_name,
                            address, location_note, lat, lng, priority, happening_now, subjects, vehicles, photos,
                            visibility, contact_ok, contact_phone, ai_summary)
values (test.id('b1'), 'business', 'voice', 'Suspicious Person', 'Man trying car door handles on S Main St',
        'A man in a gray hoodie is trying car door handles, heading north toward Beale St.',
        'PRIVATE-TRANSCRIPT caller: my cell is 901-555-0199', 'whatever the client sent',
        '254 S Main St, Memphis, TN 38103', 'Lot behind the market', 35.1381, -90.0544, 2, true,
        '[{"id":"s1","sex":"Male","ageRange":"30s","clothingTop":"Gray hoodie","direction":"North on Main",
           "phone":"PRIVATE-SUBJECT-PHONE","distinguishing":{"nested":"PRIVATE-NESTED"}}]',
        '[{"id":"v1","color":"Silver","make":"Nissan","model":"Altima","plate":"ABC 123","ownerName":"PRIVATE-OWNER"}]',
        array['00000000-0000-0000-0000-0000000000b1/PRIVATE-PHOTO.jpg'],
        'community', true, 'PRIVATE-PHONE-901-555-0101', 'PRIVATE-SUMMARY');
-- b1: an officers-only report.
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, contact_phone)
values (test.id('b1'), 'business', 'form', 'Theft / Shoplifting', 'Two prints taken from the front display',
        'PRIVATE-OFFICERS-ONLY', 35.139, -90.054, 'officers', 'PRIVATE-PHONE-901-555-0101');
select test.done();

-- b3 (no storefront): a quick alert shared with the community.
select test.act_as(test.id('b3'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, contact_phone)
values (test.id('b3'), 'business', 'quick', 'Vandalism', 'Window smashed at the bus shelter', 'Glass on the sidewalk.',
        35.1405, -90.0531, 'community', 'PRIVATE-PHONE-B3');
select test.done();

-- officer: a report of their own, shared with the community.
select test.act_as(test.id('officer'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, transcript, business_name, lat, lng, visibility)
values (test.id('officer'), 'officer', 'incident', 'Assault', 'Fight outside the club', 'Two men fighting, one left on foot.',
        'PRIVATE-OFFICER-TRANSCRIPT', 'Officer Hayes', 35.1395, -90.0525, 'community');
select test.done();

-- b2: a community report of its own.
select test.act_as(test.id('b2'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility, contact_phone, transcript)
values (test.id('b2'), 'business', 'form', 'Trespassing', 'Person sleeping in the doorway', 'Asked to move on, refused.',
        35.1412, -90.0521, 'community', 'PRIVATE-PHONE-901-555-0102', 'PRIVATE-B2-TRANSCRIPT');
select test.done();

insert into test.ids select 'r1_b1_community', id from public.reports where title like 'Man trying car door%';
insert into test.ids select 'r2_b1_officers',  id from public.reports where title like 'Two prints%';
insert into test.ids select 'r3_b3_community', id from public.reports where title like 'Window smashed%';
insert into test.ids select 'r4_officer',      id from public.reports where title like 'Fight outside%';
insert into test.ids select 'r5_b2_community', id from public.reports where title like 'Person sleeping%';

-- The officer takes r1; b2 marks it as seen.
select test.act_as(test.id('officer'));
update public.reports set assigned_to = test.id('officer'), assigned_name = 'Officer Hayes', status = 'acknowledged'
 where id = test.id('r1_b1_community');
select test.done();
select test.act_as(test.id('b2'));
select public.mark_report_seen(test.id('r1_b1_community'));
select test.done();

-- Before 0007 (the leak this migration closes): b2 reads b1's phone and transcript.
select test.act_as(test.id('b2'));
select test.check(
  (select contact_phone from public.reports where id = test.id('r1_b1_community')) = 'PRIVATE-PHONE-901-555-0101',
  'S0 before 0007, a business reads another business''s contact phone (the leak)');
select test.done();

-- ── apply 0007 ───────────────────────────────────────────────────────────────

set client_min_messages = warning;
\ir ../migrations/0007_community_report_privacy.sql
set client_min_messages = notice;

-- ── schema ───────────────────────────────────────────────────────────────────

select test.check(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'public' and table_name = 'community_reports')
  = array['id', 'created_at', 'updated_at', 'occurred_at', 'source', 'kind', 'incident_type', 'priority', 'status',
          'title', 'description', 'address', 'location_note', 'lat', 'lng', 'happening_now', 'weapons_seen', 'injuries',
          'visibility', 'subjects', 'vehicles', 'business_name', 'assigned_name', 'photo_count', 'seen_count'],
  'S1 community_reports has only the safe columns (no reporter_id, contact_*, transcript, photos, business_id, acknowledged_by, assigned_to, ai_summary, bolo_id)');

select test.check(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_reports'),
  'S2 community_reports is in the supabase_realtime publication');

select test.check(
  (select relrowsecurity from pg_class where oid = 'public.community_reports'::regclass)
  and (select array_agg(policyname::text || ':' || cmd order by policyname) from pg_policies
        where schemaname = 'public' and tablename = 'community_reports') = array['community_reports_select:SELECT']
  and not has_table_privilege('anon', 'public.community_reports', 'select')
  and has_table_privilege('authenticated', 'public.community_reports', 'select')
  and not has_table_privilege('authenticated', 'public.community_reports', 'insert')
  and not has_table_privilege('authenticated', 'public.community_reports', 'update')
  and not has_table_privilege('authenticated', 'public.community_reports', 'delete'),
  'S3 RLS on; one select policy; signed-in members may only select; visitors nothing');

select test.check(
  not has_function_privilege('authenticated', 'public.sync_community_report(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.sync_community_report(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.keep_fields(jsonb, text[])', 'execute')
  and has_function_privilege('authenticated', 'public.my_seen_report_ids()', 'execute')
  and not has_function_privilege('anon', 'public.my_seen_report_ids()', 'execute'),
  'S4 the sync helpers are not callable from the browser; my_seen_report_ids() is, for signed-in members only');

-- ── backfill ─────────────────────────────────────────────────────────────────

select test.check(
  (select array_agg(id order by id) from public.community_reports)
  = (select array_agg(id order by id) from test.ids where name in ('r1_b1_community', 'r3_b3_community', 'r4_officer', 'r5_b2_community')),
  'B1 backfill: one copy per community report, none for the officers-only one');

select test.check(
  (select c.title = 'Man trying car door handles on S Main St' and c.status = 'acknowledged' and c.priority = 2
          and c.kind = 'voice' and c.incident_type = 'Suspicious Person' and c.happening_now
          and c.address = '254 S Main St, Memphis, TN 38103' and c.location_note = 'Lot behind the market'
          and c.business_name = 'Ortega''s Corner Market' and c.assigned_name = 'Officer Hayes'
          and c.photo_count = 1 and c.seen_count = 1 and c.visibility = 'community'
          and c.description like 'A man in a gray hoodie%' and c.updated_at = r.updated_at and c.created_at = r.created_at
     from public.community_reports c join public.reports r on r.id = c.id
    where c.id = test.id('r1_b1_community')),
  'B2 the copy carries what members see: headline, status, place, flags, storefront, officer, photo and seen counts');

select test.check(
  (select subjects = '[{"id":"s1","sex":"Male","ageRange":"30s","clothingTop":"Gray hoodie","direction":"North on Main"}]'::jsonb
          and vehicles = '[{"id":"v1","color":"Silver","make":"Nissan","model":"Altima","plate":"ABC 123"}]'::jsonb
     from public.community_reports where id = test.id('r1_b1_community')),
  'B3 people and vehicles keep only the description fields (stray keys and nested values dropped)');

select test.check(
  (select business_name is null from public.community_reports where id = test.id('r3_b3_community'))
  and (select business_name is null from public.community_reports where id = test.id('r4_officer'))
  and (select business_name = 'jamie.private' from public.reports where id = test.id('r3_b3_community')),
  'B4 no storefront name → no name in the copy (never a member''s own name or email; never an officer''s)');

select test.check(
  not exists (select 1 from public.community_reports c, lateral to_jsonb(c) j
               where j::text ~ 'PRIVATE|901-555|maria@|jamie|00000000-0000-0000-0000-0000000000b1'),
  'B5 nothing private anywhere in the copies (phones, transcripts, photo paths, summary, ids, emails)');

-- ── who reads what ───────────────────────────────────────────────────────────

-- b2, another business.
select test.act_as(test.id('b2'));
select test.check(
  not exists (select 1 from public.reports where id = test.id('r1_b1_community')),
  'R1 a business can''t read another business''s community report through reports');
select test.check(
  (select count(*) from public.reports where contact_phone is not null or transcript is not null) = 1
  and (select count(*) from public.reports where contact_phone like '%0101%' or transcript like '%caller%') = 0,
  'R2 …so no other reporter''s contact_phone or transcript, only its own');
select test.check(
  (select title = 'Man trying car door handles on S Main St' and business_name = 'Ortega''s Corner Market' and seen_count = 1
     from public.community_reports where id = test.id('r1_b1_community')),
  'R3 it reads the safe copy of that report through community_reports');
select test.check(
  (select count(*) from public.community_reports) = 4,
  'R4 it sees every community report there, its own included');
select test.check(
  not exists (select 1 from public.reports where id = test.id('r2_b1_officers'))
  and not exists (select 1 from public.community_reports where id = test.id('r2_b1_officers')),
  'R5 another business''s officers-only report is invisible everywhere');
select test.check(
  (select contact_phone = 'PRIVATE-PHONE-901-555-0102' and transcript = 'PRIVATE-B2-TRANSCRIPT'
     from public.reports where id = test.id('r5_b2_community')),
  'R6 a reporter still reads every field of its own report');
select test.check(
  test.refused('insert into public.community_reports (id, created_at, updated_at, source, kind, incident_type, priority, status, lat, lng) '
               || 'values (gen_random_uuid(), now(), now(), ''business'', ''quick'', ''Other'', 3, ''active'', 0, 0)')
  and test.refused('update public.community_reports set title = ''hijacked''')
  and test.refused('delete from public.community_reports'),
  'R7 members can''t insert, update or delete community_reports');
select test.check(
  test.refused('select public.sync_community_report(' || quote_literal(test.id('r2_b1_officers')) || ')'),
  'R8 members can''t call the sync function');
select test.check(
  (select count(*) from public.businesses) = 1
  and (select name from public.businesses) = 'Riverbluff Coffee Co.',
  'R9 a business reads only its own storefront (no other member''s contact name, phone or email)');
select test.done();

-- b1, the reporter.
select test.act_as(test.id('b1'));
select test.check(
  (select contact_phone = 'PRIVATE-PHONE-901-555-0101' and transcript like 'PRIVATE-TRANSCRIPT%'
          and photos = array['00000000-0000-0000-0000-0000000000b1/PRIVATE-PHOTO.jpg'] and ai_summary = 'PRIVATE-SUMMARY'
     from public.reports where id = test.id('r1_b1_community'))
  and exists (select 1 from public.reports where id = test.id('r2_b1_officers')),
  'R10 the reporter keeps its own private fields and its officers-only report');
select test.check(
  (select count(*) from public.reports) = 2,
  'R11 …and sees no one else''s reports through reports');
select test.done();

-- The officer and the admin: everything.
select test.act_as(test.id('officer'));
select test.check(
  (select count(*) from public.reports) = 5
  and (select contact_phone from public.reports where id = test.id('r1_b1_community')) = 'PRIVATE-PHONE-901-555-0101'
  and (select transcript from public.reports where id = test.id('r5_b2_community')) = 'PRIVATE-B2-TRANSCRIPT'
  and (select count(*) from public.businesses) = 2,
  'R12 an officer still reads every report with every field, and the business directory');
select test.done();
select test.act_as(test.id('admin'));
select test.check(
  (select count(*) from public.reports) = 5
  and (select contact_phone from public.reports where id = test.id('r2_b1_officers')) = 'PRIVATE-PHONE-901-555-0101'
  and (select count(*) from public.businesses) = 2,
  'R13 an admin still reads everything');
select test.done();

-- A visitor: nothing but the public map.
select test.act_as_anon();
select test.check(
  test.refused('select 1 from public.community_reports'),
  'R14 visitors can''t read community_reports');
select test.check(
  (select count(*) from public.public_incidents(48)) = 4,
  'R15 the public map (public_incidents) still lists the 4 community reports');
select test.done();

-- The timeline: the reporter still reads officer notes on its own report.
select test.act_as(test.id('officer'));
insert into public.report_updates (report_id, kind, body, internal) values
  (test.id('r1_b1_community'), 'note', 'Officer on scene', false),
  (test.id('r1_b1_community'), 'note', 'PRIVATE-INTERNAL-NOTE', true);
select test.done();
select test.act_as(test.id('b1'));
select test.check(
  (select array_agg(body) from public.report_updates where report_id = test.id('r1_b1_community')) = array['Officer on scene'],
  'T1 the reporter reads public notes on its own report, not internal ones');
insert into public.report_updates (report_id, kind, body) values (test.id('r1_b1_community'), 'note', 'He came back');
select test.check(true, 'T2 …and can still add a note to it');
select test.done();
select test.act_as(test.id('b2'));
select test.check(
  not exists (select 1 from public.report_updates where report_id = test.id('r1_b1_community'))
  and test.refused('insert into public.report_updates (report_id, kind, body) values ('
                   || quote_literal(test.id('r1_b1_community')) || ', ''note'', ''x'')'),
  'T3 another business reads no notes on it and can''t add any');
select test.done();

-- ── the triggers keep the copy in sync ───────────────────────────────────────

-- A new community report from b2.
select test.act_as(test.id('b2'));
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility,
                            contact_phone, transcript, photos)
values (test.id('b2'), 'business', 'quick', 'Robbery', 'Phone snatched outside the cafe', 'He ran toward Peabody Pl.',
        35.1410, -90.0520, 'community', 'PRIVATE-PHONE-901-555-0102', 'PRIVATE-NEW-TRANSCRIPT',
        array['00000000-0000-0000-0000-0000000000b2/a.jpg', '00000000-0000-0000-0000-0000000000b2/b.jpg']);
select test.done();
insert into test.ids select 'r6_b2_new', id from public.reports where title like 'Phone snatched%';
select test.act_as(test.id('b1'));
select test.check(
  (select title = 'Phone snatched outside the cafe' and business_name = 'Riverbluff Coffee Co.' and status = 'active'
          and photo_count = 2 and seen_count = 0
     from public.community_reports where id = test.id('r6_b2_new')),
  'Y1 insert: a new community report has its copy at once');
select test.done();

-- A visible change (status, priority, officer) updates the copy.
select test.act_as(test.id('officer'));
update public.reports set status = 'responding', priority = 1, assigned_name = 'Officer Hayes'
 where id = test.id('r6_b2_new');
select test.done();
select test.check(
  (select c.status = 'responding' and c.priority = 1 and c.assigned_name = 'Officer Hayes' and c.updated_at = r.updated_at
     from public.community_reports c join public.reports r on r.id = c.id where c.id = test.id('r6_b2_new')),
  'Y2 update: status, priority and the officer follow');

-- A change to private fields only leaves the copy alone (no Realtime event).
insert into test.snap select 'y3', null, xmin::text from public.community_reports where id = test.id('r6_b2_new');
select test.act_as(test.id('officer'));
update public.reports set contact_phone = 'PRIVATE-CHANGED', transcript = 'PRIVATE-CHANGED', ai_summary = 'PRIVATE-CHANGED',
                          assigned_to = test.id('officer')
 where id = test.id('r6_b2_new');
select test.done();
select test.check(
  (select xmin::text from public.community_reports where id = test.id('r6_b2_new')) = (select xmins from test.snap where label = 'y3'),
  'Y3 update of private fields only: the copy isn''t rewritten');

-- Marking as seen: the count follows; only the marker learns it was them.
select test.act_as(test.id('b1'));
select public.mark_report_seen(test.id('r6_b2_new'));
select test.check(
  (select seen_count from public.community_reports where id = test.id('r6_b2_new')) = 1
  and test.id('r6_b2_new') = any(public.my_seen_report_ids()),
  'Y4 mark as seen: seen_count goes up; my_seen_report_ids() has it for the member who marked it');
select test.done();
select test.act_as(test.id('b3'));
select test.check(
  not (test.id('r6_b2_new') = any(public.my_seen_report_ids()))
  and public.my_seen_report_ids() = '{}',
  'Y5 …and not for anyone else');
select test.done();
select test.act_as(test.id('b2'));
select test.check(
  public.my_seen_report_ids() = array[test.id('r1_b1_community')],
  'Y6 a mark made before 0007 still counts (b2 saw r1)');
select public.mark_report_seen(test.id('r2_b1_officers'));
select test.done();
select test.check(
  (select acknowledged_by = '{}' from public.reports where id = test.id('r2_b1_officers')),
  'Y7 marking another business''s officers-only report does nothing');

-- Community → officers-only: the copy goes; the reporter keeps the report.
select test.act_as(test.id('officer'));
update public.reports set visibility = 'officers' where id = test.id('r6_b2_new');
select test.done();
select test.check(
  not exists (select 1 from public.community_reports where id = test.id('r6_b2_new')),
  'Y8 visibility community → officers: the copy is deleted');
select test.act_as(test.id('b2'));
select test.check(
  exists (select 1 from public.reports where id = test.id('r6_b2_new') and contact_phone = 'PRIVATE-CHANGED'),
  'Y9 …and the reporter still has its report');
select test.done();
select test.act_as(test.id('b1'));
select test.check(
  not exists (select 1 from public.reports where id = test.id('r6_b2_new'))
  and not exists (select 1 from public.community_reports where id = test.id('r6_b2_new')),
  'Y10 …and other members see nothing of it');
select test.done();

-- Officers-only → community: a copy appears.
select test.act_as(test.id('officer'));
update public.reports set visibility = 'community' where id = test.id('r2_b1_officers');
select test.done();
select test.check(
  (select title = 'Two prints taken from the front display' and business_name = 'Ortega''s Corner Market'
     from public.community_reports where id = test.id('r2_b1_officers')),
  'Y11 visibility officers → community: the copy appears');

-- Delete: the copy goes too.
select test.act_as(test.id('officer'));
delete from public.reports where id = test.id('r5_b2_community');
select test.done();
select test.check(
  not exists (select 1 from public.community_reports where id = test.id('r5_b2_community')),
  'Y12 delete: the copy is deleted');

-- A storefront deleted later: its name leaves the copies (business_id goes null).
select test.act_as(test.id('b1'));
delete from public.businesses where owner_id = test.id('b1');
select test.done();
select test.check(
  (select business_name is null from public.community_reports where id = test.id('r1_b1_community')),
  'Y13 a deleted storefront''s name leaves its copies');

-- ── 0007 again ───────────────────────────────────────────────────────────────

insert into test.snap
select 'before rerun',
       md5(string_agg(to_jsonb(c)::text, '|' order by c.id)),
       string_agg(c.id::text || ':' || c.xmin::text, ',' order by c.id)
  from public.community_reports c;

set client_min_messages = warning;
\ir ../migrations/0007_community_report_privacy.sql
set client_min_messages = notice;

select test.check(
  (select md5(string_agg(to_jsonb(c)::text, '|' order by c.id)) from public.community_reports c)
    = (select fingerprint from test.snap where label = 'before rerun')
  and (select string_agg(c.id::text || ':' || c.xmin::text, ',' order by c.id) from public.community_reports c)
    = (select xmins from test.snap where label = 'before rerun'),
  'I1 re-running 0007: same copies, none rewritten');
select test.check(
  (select count(*) from pg_trigger where tgrelid = 'public.reports'::regclass and tgname = 'trg_reports_sync_community') = 1
  and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_select') = 1
  and (select qual from pg_policies where schemaname = 'public' and tablename = 'reports' and policyname = 'reports_select')
      !~ 'community'
  and (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'community_reports') = 1
  and not has_function_privilege('authenticated', 'public.sync_community_report(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.community_reports', 'insert'),
  'I2 …one trigger, one reports_select (reporter or officer), one publication entry, grants unchanged');

-- A re-run also repairs drift: a stale copy goes, an edited one is restored.
insert into public.reports (reporter_id, source, kind, incident_type, title, description, lat, lng, visibility)
values (test.id('officer'), 'officer', 'incident', 'Other', 'PRIVATE-DRIFT', 'x', 35.14, -90.05, 'officers');
alter table public.reports disable trigger trg_reports_sync_community;
insert into public.community_reports (id, created_at, updated_at, source, kind, incident_type, priority, status, lat, lng)
select id, created_at, updated_at, source, kind, incident_type, priority, status, lat, lng
  from public.reports where title = 'PRIVATE-DRIFT';
update public.community_reports set title = 'edited by hand' where id = test.id('r1_b1_community');
alter table public.reports enable trigger trg_reports_sync_community;
set client_min_messages = warning;
\ir ../migrations/0007_community_report_privacy.sql
set client_min_messages = notice;
select test.check(
  not exists (select 1 from public.community_reports c join public.reports r on r.id = c.id where r.title = 'PRIVATE-DRIFT')
  and (select title from public.community_reports where id = test.id('r1_b1_community')) = 'Man trying car door handles on S Main St',
  'I3 …and repairs drift: the stale copy is removed, the edited copy restored');

select test.act_as(test.id('b2'));
select test.check(
  not exists (select 1 from public.reports where id = test.id('r1_b1_community'))
  and (select count(*) from public.businesses) = 1,
  'I4 after the re-run a business still can''t read another business''s report or storefront');
select test.done();

\echo
\echo 'All 0007 checks passed.'
