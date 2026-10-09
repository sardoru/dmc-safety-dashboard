-- ════════════════════════════════════════════════════════════════════════════
-- Test: migration 0008 — Invite a list's brakes (the paced invitation queue).
--
-- Plain local Postgres (15+), a fresh scratch database — never Supabase:
--   dropdb --if-exists dmc_0008_test; createdb dmc_0008_test && psql -X -q -v ON_ERROR_STOP=1 -d dmc_0008_test -f supabase/tests/0008_invite_queue_brakes.test.sql
--
-- It stands in for Supabase (auth.uid(), roles, storage, the Realtime publication), applies 0001–0007,
-- queues invitations, applies 0008, and runs the exact statements /api/cron/invites and
-- /api/admin/invite-queue send through PostgREST: the one-run-per-quarter-hour check-and-set, the
-- one-row claim, the "still being sent, not cancelled" stamp right before an email, cancel, and the
-- recovery of stuck rows. Then it checks the grants and applies 0008 again.
-- Each check prints "PASS …" (query results are hidden); the first failure stops psql with a non-zero exit.
-- ════════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = notice;

-- Refuse anything but an empty scratch database: this file creates roles and writes test data.
do $$
begin
  if exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'realtime', 'test'))
     or exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                 where n.nspname = 'public' and c.relname = 'invite_queue') then
    raise exception 'Run this on a fresh scratch database (createdb dmc_0008_test), never on Supabase.';
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
create function test.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FAIL %', p_label;
  end if;
  raise notice 'PASS %', p_label;
end $$;
-- True when the statement is refused for lack of a privilege.
create function test.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;
-- How many rows a statement touched (the server's PostgREST calls return the rows they changed).
create function test.rows(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant all on all functions in schema test to public;

-- ── migrations 0001–0007, a list queued, then 0008 ───────────────────────────

set client_min_messages = warning;  -- quiet the migrations' "does not exist, skipping"
\ir ../migrations/0001_init.sql
\ir ../migrations/0002_incidents_bolos.sql
\ir ../migrations/0003_write_guards.sql
\ir ../migrations/0004_membership_and_public_map.sql
\ir ../migrations/0005_display_links.sql
\ir ../migrations/0006_invite_queue.sql
\ir ../migrations/0007_community_report_privacy.sql
set client_min_messages = notice;

-- Rows queued before 0008 (a list already waiting when it's applied).
insert into public.invite_queue (email, label)
select format('shop%s@downtown.test', lpad(i::text, 2, '0')), 'Safety Meeting · Oct 8' from generate_series(1, 8) i;

set client_min_messages = warning;
\ir ../migrations/0008_invite_queue_brakes.sql
set client_min_messages = notice;

select test.check(
  (select count(*) from public.invite_queue where emailing_at is null and status = 'queued') = 8
  and (select last_slot = '-infinity'::timestamptz and pause_reason is null and last_run_at is null and last_run is null
         from public.invite_queue_settings),
  'B1 0008 adds emailing_at (empty on the waiting rows) and the settings columns (last_slot starts at -infinity)');

-- ── one run per quarter hour (the cron's check-and-set) ──────────────────────

set role service_role;
select test.check(
  test.rows($$update public.invite_queue_settings set last_slot = '2026-10-09T18:00:00Z' where id = true and last_slot < '2026-10-09T18:00:00Z'$$) = 1,
  'B2 the first run of the 18:00 slot takes it');
select test.check(
  test.rows($$update public.invite_queue_settings set last_slot = '2026-10-09T18:00:00Z' where id = true and last_slot < '2026-10-09T18:00:00Z'$$) = 0,
  'B3 a duplicate delivery in the same slot gets nothing (no second run)');
select test.check(
  test.rows($$update public.invite_queue_settings set last_slot = '2026-10-09T18:15:00Z' where id = true and last_slot < '2026-10-09T18:15:00Z'$$) = 1
  and test.rows($$update public.invite_queue_settings set last_slot = '2026-10-09T18:00:00Z' where id = true and last_slot < '2026-10-09T18:00:00Z'$$) = 0,
  'B4 the next quarter hour runs; a late delivery of an earlier slot doesn''t');

-- ── claim one row, check it right before the email ───────────────────────────

create temporary table claimed as select * from public.claim_queued_invites(1);
select test.check(
  (select count(*) from claimed) = 1
  and (select email = 'shop01@downtown.test' and emailing_at is null from claimed)
  and (select status from public.invite_queue where email = 'shop01@downtown.test') = 'sending',
  'B5 claim_queued_invites(1) takes exactly one row — the oldest — and returns emailing_at (empty)');

select test.check(
  test.rows($$update public.invite_queue set emailing_at = now() where email = 'shop01@downtown.test' and status = 'sending' and emailing_at is null$$) = 1
  and test.rows($$update public.invite_queue set emailing_at = now() where email = 'shop01@downtown.test' and status = 'sending' and emailing_at is null$$) = 0,
  'B6 right before the email: the stamp lands once (still being sent, not yet stamped)');

-- An administrator cancels the rest: queued rows, and claimed rows whose email hasn't started.
select public.claim_queued_invites(1);  -- shop02: claimed, its email not started
select test.check(
  test.rows($$update public.invite_queue set status = 'cancelled' where status = 'queued'$$) = 6
  and test.rows($$update public.invite_queue set status = 'cancelled' where status = 'sending' and emailing_at is null$$) = 1,
  'B7 cancel takes the 6 waiting rows and the claimed one whose email hasn''t started');
select test.check(
  (select status from public.invite_queue where email = 'shop01@downtown.test') = 'sending',
  'B8 …but not the one whose email has started (it finishes)');
select test.check(
  test.rows($$update public.invite_queue set emailing_at = now() where email = 'shop02@downtown.test' and status = 'sending' and emailing_at is null$$) = 0,
  'B9 the run''s check right before shop02''s email finds it cancelled: nothing is emailed');
select test.check(
  test.rows($$update public.invite_queue set status = 'queued', claimed_at = null where email = 'shop02@downtown.test' and status = 'sending'$$) = 0,
  'B10 a rate limit on the cancelled row can''t put it back in the queue (the update needs it still sending)');

-- ── stuck rows (their run died) ──────────────────────────────────────────────

insert into public.invite_queue (email, status, claimed_at, emailing_at, attempts) values
  ('stuck.early@downtown.test',   'sending', now() - interval '45 minutes', null,                              1),
  ('stuck.tried@downtown.test',   'sending', now() - interval '45 minutes', null,                              3),
  ('stuck.emailing@downtown.test','sending', now() - interval '45 minutes', now() - interval '45 minutes',      1),
  ('fresh.claim@downtown.test',   'sending', now() - interval '5 minutes',  null,                              1);
-- The recovery, as /api/cron/invites sends it.
select test.check(
  test.rows($$update public.invite_queue set status = 'queued', claimed_at = null
               where status = 'sending' and claimed_at < now() - interval '30 minutes' and emailing_at is null and attempts < 3$$) = 1
  and test.rows($$update public.invite_queue set status = 'failed', outcome = 'Gave up after 3 tries'
               where status = 'sending' and claimed_at < now() - interval '30 minutes' and emailing_at is null and attempts >= 3$$) = 1
  and test.rows($$update public.invite_queue set status = 'failed', outcome = 'May have gone out — check before inviting again'
               where status = 'sending' and claimed_at < now() - interval '30 minutes' and emailing_at is not null$$) = 1,
  'B11 recovery: not started → queued again; out of tries → failed; started emailing → failed "may have gone out"');
select test.check(
  (select status from public.invite_queue where email = 'stuck.emailing@downtown.test') = 'failed'
  and (select status from public.invite_queue where email = 'fresh.claim@downtown.test') = 'sending'
  and not exists (select 1 from public.invite_queue where email = 'stuck.emailing@downtown.test' and status = 'queued'),
  'B12 a row whose email started is never queued again; a fresh claim is left alone');
reset role;

-- ── grants: browsers still can't see or touch any of it ──────────────────────

set role anon;
select test.check(test.refused('select emailing_at from public.invite_queue')
  and test.refused('select last_slot, pause_reason from public.invite_queue_settings')
  and test.refused('select * from public.claim_queued_invites(1)'),
  'B13 anon: refused on the queue, its settings (new columns too) and the claim');
reset role;
set role authenticated;
select test.check(test.refused('select emailing_at from public.invite_queue')
  and test.refused($$update public.invite_queue_settings set paused = false, pause_reason = null$$)
  and test.refused('select * from public.claim_queued_invites(1)'),
  'B14 authenticated: refused too — only the server pauses, resumes or claims');
reset role;

-- ── 0008 again (and 0006): nothing changes ───────────────────────────────────

create temporary table before_rerun as
  select id, status, emailing_at, attempts from public.invite_queue;
set client_min_messages = warning;
\ir ../migrations/0006_invite_queue.sql
\ir ../migrations/0008_invite_queue_brakes.sql
set client_min_messages = notice;
select test.check(
  not exists (
    select 1 from before_rerun b join public.invite_queue q using (id)
     where q.status is distinct from b.status or q.emailing_at is distinct from b.emailing_at or q.attempts is distinct from b.attempts)
  and (select last_slot from public.invite_queue_settings) = '2026-10-09T18:15:00Z'
  and (select count(*) from public.claim_queued_invites(0)) = 0,
  'B15 applying 0006 and 0008 again keeps every row, the slot and the claim function as they were');

\echo
\echo 'All 0008 checks passed.'
