-- ════════════════════════════════════════════════════════════════════════════
-- DMC Safety Dashboard — initial schema
-- Roles: business (signs up), officer (admin-invited), admin (super-admin)
-- Run with `supabase db push` or paste into the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  role         text not null default 'business' check (role in ('business','officer','admin')),
  display_name text,
  created_at   timestamptz not null default now()
);

create table if not exists public.businesses (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null unique references public.profiles (id) on delete cascade,
  name         text not null,
  address      text not null,
  type         text not null default 'other',
  contact_name text,
  phone        text,
  email        text,
  lat          double precision not null,
  lng          double precision not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.officer_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text not null default 'officer' check (role in ('officer','admin')),
  status      text not null default 'pending' check (status in ('pending','claimed','revoked')),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz
);

-- Only one outstanding (pending) invite per email.
create unique index if not exists officer_invites_pending_email_idx
  on public.officer_invites (lower(email)) where status = 'pending';

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references public.profiles (id) on delete set null,
  source          text not null check (source in ('officer','business')),
  kind            text not null check (kind in ('voice','quick','incident')),
  incident_type   text not null,
  description     text not null default '',
  transcript      text,
  business_id     uuid references public.businesses (id) on delete set null,
  business_name   text,
  address         text,
  lat             double precision not null,
  lng             double precision not null,
  status          text not null default 'active' check (status in ('active','acknowledged','resolved')),
  acknowledged_by uuid[] not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_status_idx on public.reports (status);

create table if not exists public.passkeys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  credential_id text not null unique,
  public_key    text not null,
  counter       bigint not null default 0,
  transports    text[],
  device_label  text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists passkeys_user_idx on public.passkeys (user_id);

-- Short-lived WebAuthn challenges (server-only; no client policies).
create table if not exists public.webauthn_challenges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade,
  email      text,
  challenge  text not null,
  type       text not null check (type in ('registration','authentication')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

-- ── Helper functions (SECURITY DEFINER to avoid RLS recursion on profiles) ───

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('officer','admin'), false);
$$;

-- ── New-user bootstrap: create profile + claim any pending officer invite ────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text := 'business';
  v_invite public.officer_invites%rowtype;
begin
  select * into v_invite
    from public.officer_invites
   where lower(email) = lower(new.email) and status = 'pending'
   order by created_at desc
   limit 1;

  if found then
    v_role := v_invite.role;
    update public.officer_invites
       set status = 'claimed', claimed_at = now()
     where id = v_invite.id;
  end if;

  insert into public.profiles (id, email, role, display_name)
  values (
    new.id,
    new.email,
    v_role,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email,''), '@', 1)
    )
  )
  on conflict (id) do nothing;

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Prevent non-admins from escalating their own role via profile updates.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end; $$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Keep businesses.updated_at fresh.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_businesses_updated_at on public.businesses;
create trigger trg_businesses_updated_at
  before update on public.businesses
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.profiles            enable row level security;
alter table public.businesses          enable row level security;
alter table public.officer_invites     enable row level security;
alter table public.reports             enable row level security;
alter table public.passkeys            enable row level security;
alter table public.webauthn_challenges enable row level security;

-- profiles: read own (or any if staff); update own; admins update any.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_officer());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- businesses: all authenticated can read (dashboard map); owner manages own.
drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
  for select to authenticated using (true);

drop policy if exists businesses_insert_own on public.businesses;
create policy businesses_insert_own on public.businesses
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists businesses_update_own on public.businesses;
create policy businesses_update_own on public.businesses
  for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

drop policy if exists businesses_delete_own on public.businesses;
create policy businesses_delete_own on public.businesses
  for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

-- officer_invites: admin only (trigger reads it via SECURITY DEFINER).
drop policy if exists officer_invites_admin on public.officer_invites;
create policy officer_invites_admin on public.officer_invites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reports: all authenticated read; authenticated create as themselves;
-- staff (or reporter) update/delete.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated using (true);

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() or reporter_id is null);

drop policy if exists reports_update on public.reports;
create policy reports_update on public.reports
  for update to authenticated
  using (public.is_officer() or reporter_id = auth.uid())
  with check (public.is_officer() or reporter_id = auth.uid());

drop policy if exists reports_delete on public.reports;
create policy reports_delete on public.reports
  for delete to authenticated
  using (public.is_officer() or reporter_id = auth.uid());

-- passkeys: owner manages own (server uses service role for auth flows).
drop policy if exists passkeys_owner on public.passkeys;
create policy passkeys_owner on public.passkeys
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- webauthn_challenges: no client policies → only service role may touch it.

-- ── Grants (RLS still governs row visibility) ────────────────────────────────

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ── Realtime: stream new/updated reports to the dashboard ────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end $$;

-- ── Seed the first super-admin (change the email as needed) ───────────────────
-- The matching person becomes 'admin' automatically on their first magic-link login.

insert into public.officer_invites (email, role, status)
values ('sardoru@gmail.com', 'admin', 'pending')
on conflict do nothing;
