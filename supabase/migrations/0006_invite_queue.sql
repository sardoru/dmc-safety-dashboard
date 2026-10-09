-- 0006 — Paced invitations: "Invite a list" (Admin → Team).
--
-- An administrator pastes a list of addresses (a meeting's sign-in sheet, say); each becomes a row in
-- invite_queue. A Vercel cron (/api/cron/invites, every 15 minutes) claims the oldest few — 5 by
-- default — and invites each one exactly as Admin → Team → Invite someone does: the email written for
-- the role, never lowering anyone, an audit entry. The emails trickle out, and the team can watch,
-- pause, or cancel the rest.
--
-- Both tables have RLS on and NO policies, and anon/authenticated have no grants: browsers can't read
-- or write them — only the server can (/api/admin/invite-queue and the cron, with the service role).
-- claim_queued_invites() hands each queued row to exactly one sender (FOR UPDATE SKIP LOCKED); only
-- the service role may call it.
--
-- Additive and idempotent: safe to run more than once.

-- ── the queue ────────────────────────────────────────────────────────────────

create table if not exists public.invite_queue (
  id          uuid primary key default gen_random_uuid(),
  -- Paste order: older rows (and, within one paste, earlier lines) go out first.
  seq         bigint generated always as identity,
  email       text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  role        text not null default 'business' check (role in ('business', 'officer', 'admin')),
  name        text check (char_length(name) <= 120),
  label       text check (char_length(label) <= 80),
  status      text not null default 'queued'
              check (status in ('queued', 'sending', 'sent', 'skipped', 'failed', 'cancelled')),
  outcome     text check (char_length(outcome) <= 500),
  queued_by   uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  attempts    integer not null default 0 check (attempts >= 0)
);

-- An address waits in the queue once: no second row while one is queued or being sent. Sent, skipped,
-- failed and cancelled rows don't count, so an address can be queued again later.
create unique index if not exists invite_queue_live_email_idx
  on public.invite_queue (lower(email)) where status in ('queued', 'sending');

-- The next batch: the oldest queued rows.
create index if not exists invite_queue_next_idx on public.invite_queue (seq) where status = 'queued';
-- Counts by status, the latest results, rows stuck while sending.
create index if not exists invite_queue_status_idx on public.invite_queue (status, claimed_at desc);

alter table public.invite_queue enable row level security;
revoke all on public.invite_queue from anon, authenticated;
do $$
declare s text := pg_get_serial_sequence('public.invite_queue', 'seq');
begin
  if s is not null then
    execute format('revoke all on sequence %s from anon, authenticated', s);
  end if;
end $$;

-- ── the queue's settings (one row) ───────────────────────────────────────────
-- Paused: the cron sends nothing until an administrator resumes. per_run: how many each run claims.

create table if not exists public.invite_queue_settings (
  id          boolean primary key default true check (id),
  paused      boolean not null default false,
  per_run     integer not null default 5 check (per_run between 1 and 10),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.invite_queue_settings (id) values (true) on conflict (id) do nothing;

alter table public.invite_queue_settings enable row level security;
revoke all on public.invite_queue_settings from anon, authenticated;

-- ── claim: the oldest N queued rows, each to exactly one sender ──────────────
-- Locks the rows it picks and skips rows another run has locked, then marks them `sending` (with the
-- time and one more attempt) in the same statement — two runs at once never get the same row.

create or replace function public.claim_queued_invites(n integer)
returns setof public.invite_queue
language sql volatile security definer set search_path = public as $$
  with picked as materialized (
    select id
      from public.invite_queue
     where status = 'queued'
     order by seq
     limit greatest(least(coalesce(n, 0), 25), 0)
       for update skip locked
  )
  update public.invite_queue q
     set status = 'sending', claimed_at = now(), attempts = q.attempts + 1
    from picked
   where q.id = picked.id
  returning q.*;
$$;
revoke all on function public.claim_queued_invites(integer) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.claim_queued_invites(integer) to service_role;
  end if;
end $$;
