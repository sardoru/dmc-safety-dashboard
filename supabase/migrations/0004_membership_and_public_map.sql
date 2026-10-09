-- ════════════════════════════════════════════════════════════════════════════
-- Core Downtown Memphis Safety Dashboard — 0004: membership + public map
--
--   • access codes: one shareable code worth N seats, optional expiry,
--     revocable, with a redemption list. Redeemed only through /api/join
--     (service role): a new address gets a pending invite that the sign-up
--     trigger claims; an existing account is raised to the code's role
--   • invites carry any role (business / officer / admin) and where they came
--     from (admin, code, waitlist); profiles remember how each member joined
--   • app settings: open or invite-only sign-up; the public map switch + delay
--   • waitlist: people asking to join while sign-up is invite-only
--   • audit log of admin actions
--   • hook_before_user_created(): enforces invite-only sign-up — wire it in
--     Supabase → Authentication → Hooks → "Before User Created"
--   • public_incidents(): the sanitized feed behind the public map
--
-- Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

-- ── helpers ──────────────────────────────────────────────────────────────────

create or replace function public.role_rank(r text)
returns integer language sql immutable as $$
  select case r when 'admin' then 3 when 'officer' then 2 when 'business' then 1 else 0 end;
$$;

-- XXXX-XXXX from an alphabet without look-alikes (no 0/O, 1/I). Entropy comes
-- from gen_random_uuid(); bytes 6 and 8 carry fixed version/variant bits.
create or replace function public.random_access_code()
returns text language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b   bytea := uuid_send(gen_random_uuid());
  idx int[] := array[0, 1, 2, 3, 4, 5, 10, 11];
  out text := '';
  i   int;
begin
  foreach i in array idx loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return substr(out, 1, 4) || '-' || substr(out, 5, 4);
end; $$;

-- ── audit log ────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_label text not null default 'System',
  action      text not null,
  target      text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select on public.audit_log
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_log from anon, authenticated;

-- Write an entry as the signed-in user (System when there is none). Only for
-- other definer functions and triggers — not callable from the browser.
create or replace function public.audit(p_action text, p_target text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  who text;
begin
  if uid is not null then
    select coalesce(nullif(btrim(display_name), ''), email) into who from public.profiles where id = uid;
  end if;
  insert into public.audit_log (actor_id, actor_label, action, target, meta)
  values (uid, coalesce(who, 'System'), p_action, p_target, coalesce(p_meta, '{}'::jsonb));
end; $$;
revoke all on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- ── access codes ─────────────────────────────────────────────────────────────

create table if not exists public.access_codes (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{4,30}[A-Z0-9]$'),
  label       text not null default '',
  role        text not null default 'business' check (role in ('business', 'officer')),
  max_uses    integer not null default 10 check (max_uses between 1 and 1000),
  uses        integer not null default 0 check (uses >= 0),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  revoked_by  uuid references public.profiles (id) on delete set null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint access_codes_seats check (uses <= max_uses)
);

create table if not exists public.access_code_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code_id     uuid not null references public.access_codes (id) on delete cascade,
  email       text not null,
  user_id     uuid references public.profiles (id) on delete set null,
  outcome     text not null check (outcome in ('invited', 'upgraded', 'existing')),
  created_at  timestamptz not null default now(),
  unique (code_id, email)
);
create index if not exists access_code_redemptions_code_idx on public.access_code_redemptions (code_id, created_at desc);

alter table public.access_codes            enable row level security;
alter table public.access_code_redemptions enable row level security;

-- Admins read; nobody writes from the browser — create/revoke go through the
-- functions below, redemption through /api/join with the service role.
drop policy if exists access_codes_admin_select on public.access_codes;
create policy access_codes_admin_select on public.access_codes
  for select to authenticated using (public.is_admin());
drop policy if exists access_code_redemptions_admin_select on public.access_code_redemptions;
create policy access_code_redemptions_admin_select on public.access_code_redemptions
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.access_codes, public.access_code_redemptions from anon, authenticated;

create or replace function public.create_access_code(
  p_label      text,
  p_role       text default 'business',
  p_max_uses   integer default 10,
  p_expires_at timestamptz default null,
  p_code       text default null
)
returns public.access_codes language plpgsql security definer set search_path = public as $$
declare
  c      public.access_codes;
  v_code text;
  tries  int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can create access codes' using errcode = '42501';
  end if;
  if p_role not in ('business', 'officer') then
    raise exception 'An access code grants the business or officer role' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'The expiry must be in the future' using errcode = '22023';
  end if;

  loop
    v_code := coalesce(upper(btrim(nullif(p_code, ''))), public.random_access_code());
    begin
      insert into public.access_codes (code, label, role, max_uses, expires_at, created_by)
      values (v_code, coalesce(btrim(p_label), ''), p_role, coalesce(p_max_uses, 10), p_expires_at, auth.uid())
      returning * into c;
      exit;
    exception when unique_violation then
      if p_code is not null and p_code <> '' then
        raise exception 'That code is already in use' using errcode = '23505';
      end if;
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;

  perform public.audit('code.created', c.code,
    jsonb_build_object('label', c.label, 'role', c.role, 'seats', c.max_uses, 'expires_at', c.expires_at));
  return c;
end; $$;
revoke all on function public.create_access_code(text, text, integer, timestamptz, text) from public, anon;
grant execute on function public.create_access_code(text, text, integer, timestamptz, text) to authenticated;

create or replace function public.revoke_access_code(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.access_codes;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can revoke access codes' using errcode = '42501';
  end if;
  update public.access_codes
     set revoked_at = now(), revoked_by = auth.uid()
   where id = p_id and revoked_at is null
  returning * into c;
  if c.id is not null then
    perform public.audit('code.revoked', c.code, jsonb_build_object('label', c.label, 'seats_used', c.uses));
  end if;
end; $$;
revoke all on function public.revoke_access_code(uuid) from public, anon;
grant execute on function public.revoke_access_code(uuid) to authenticated;

-- ── invites: any role, with a source ────────────────────────────────────────

alter table public.officer_invites drop constraint if exists officer_invites_role_check;
alter table public.officer_invites add constraint officer_invites_role_check
  check (role in ('business', 'officer', 'admin'));
alter table public.officer_invites add column if not exists source text not null default 'admin';
alter table public.officer_invites drop constraint if exists officer_invites_source_check;
alter table public.officer_invites add constraint officer_invites_source_check
  check (source in ('admin', 'code', 'waitlist'));
alter table public.officer_invites add column if not exists access_code_id uuid
  references public.access_codes (id) on delete set null;

-- ── profiles: how each member joined ─────────────────────────────────────────

alter table public.profiles add column if not exists joined_via text not null default 'open';
alter table public.profiles drop constraint if exists profiles_joined_via_check;
alter table public.profiles add constraint profiles_joined_via_check
  check (joined_via in ('open', 'invite', 'code', 'waitlist'));
alter table public.profiles add column if not exists access_code_id uuid
  references public.access_codes (id) on delete set null;

-- Redeem a code for an address (service role only — /api/join).
create or replace function public.redeem_access_code(p_code text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c       public.access_codes;
  e       text := lower(btrim(coalesce(p_email, '')));
  prof    record;
  inv     record;
  v_outcome text;
  v_prev    text;
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(e) > 254 then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  -- Lock the code row: concurrent redemptions queue here, so the last seat
  -- can't be sold twice.
  select * into c from public.access_codes where code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if c.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if c.expires_at is not null and c.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- The same address again on the same code: no new seat (re-send the link).
  select r.outcome into v_prev from public.access_code_redemptions r where r.code_id = c.id and r.email = e;
  if found then
    return jsonb_build_object('ok', true, 'repeat', true, 'role', c.role, 'outcome', v_prev,
                              'existing', exists (select 1 from public.profiles where lower(email) = e));
  end if;

  if c.uses >= c.max_uses then
    return jsonb_build_object('ok', false, 'error', 'full');
  end if;
  update public.access_codes set uses = uses + 1 where id = c.id;

  select id, role into prof from public.profiles where lower(email) = e;
  if prof.id is not null then
    -- An existing account: raise it to the code's role, never lower it.
    if public.role_rank(c.role) > public.role_rank(prof.role) then
      update public.profiles set role = c.role where id = prof.id;
      v_outcome := 'upgraded';
    else
      v_outcome := 'existing';
    end if;
  else
    -- A new address: a pending invite the sign-up trigger claims.
    select id, role into inv from public.officer_invites where lower(email) = e and status = 'pending';
    if inv.id is not null then
      if public.role_rank(c.role) > public.role_rank(inv.role) then
        update public.officer_invites set role = c.role, source = 'code', access_code_id = c.id where id = inv.id;
      end if;
    else
      insert into public.officer_invites (email, role, status, source, access_code_id)
      values (e, c.role, 'pending', 'code', c.id);
    end if;
    v_outcome := 'invited';
  end if;

  insert into public.access_code_redemptions (code_id, email, user_id, outcome)
  values (c.id, e, prof.id, v_outcome);

  perform public.audit('code.redeemed', c.code,
    jsonb_build_object('email', e, 'outcome', v_outcome, 'role', c.role, 'seats_left', c.max_uses - c.uses - 1));

  return jsonb_build_object('ok', true, 'repeat', false, 'role', c.role, 'outcome', v_outcome,
                            'existing', prof.id is not null);
end; $$;
revoke all on function public.redeem_access_code(text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.redeem_access_code(text, text) to service_role;
  end if;
end $$;

-- ── sign-up trigger: claim the invite, remember how they joined ──────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role   text := 'business';
  v_via    text := 'open';
  v_code   uuid;
  v_invite public.officer_invites%rowtype;
begin
  select * into v_invite
    from public.officer_invites
   where lower(email) = lower(new.email) and status = 'pending'
   order by created_at desc
   limit 1;

  if found then
    v_role := v_invite.role;
    v_via  := case v_invite.source when 'code' then 'code' when 'waitlist' then 'waitlist' else 'invite' end;
    v_code := v_invite.access_code_id;
    update public.officer_invites
       set status = 'claimed', claimed_at = now()
     where id = v_invite.id;
  end if;

  insert into public.profiles (id, email, role, display_name, joined_via, access_code_id)
  values (
    new.id,
    new.email,
    v_role,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    v_via,
    v_code
  )
  on conflict (id) do nothing;

  update public.access_code_redemptions
     set user_id = new.id
   where lower(email) = lower(new.email) and user_id is null;

  return new;
end; $$;

-- ── app settings (one row) ───────────────────────────────────────────────────

create table if not exists public.app_settings (
  id                        boolean primary key default true check (id),
  signup_mode               text not null default 'open' check (signup_mode in ('open', 'invite')),
  public_map_enabled        boolean not null default true,
  public_map_delay_minutes  integer not null default 0 check (public_map_delay_minutes between 0 and 1440),
  updated_by                uuid references public.profiles (id) on delete set null,
  updated_at                timestamptz not null default now()
);
insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, delete on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant update (signup_mode, public_map_enabled, public_map_delay_minutes) on public.app_settings to authenticated;

create or replace function public.app_settings_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
declare changes jsonb := '{}'::jsonb;
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  if new.signup_mode is distinct from old.signup_mode then
    changes := changes || jsonb_build_object('signup_mode', jsonb_build_array(old.signup_mode, new.signup_mode));
  end if;
  if new.public_map_enabled is distinct from old.public_map_enabled then
    changes := changes || jsonb_build_object('public_map_enabled', jsonb_build_array(old.public_map_enabled, new.public_map_enabled));
  end if;
  if new.public_map_delay_minutes is distinct from old.public_map_delay_minutes then
    changes := changes || jsonb_build_object('public_map_delay_minutes', jsonb_build_array(old.public_map_delay_minutes, new.public_map_delay_minutes));
  end if;
  if changes <> '{}'::jsonb then
    perform public.audit('settings.changed', 'app_settings', changes);
  end if;
  return new;
end; $$;
drop trigger if exists trg_app_settings_stamp on public.app_settings;
create trigger trg_app_settings_stamp
  before update on public.app_settings
  for each row execute function public.app_settings_stamp();

-- ── waitlist ─────────────────────────────────────────────────────────────────

create table if not exists public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  name          text not null default '',
  organization  text not null default '',
  note          text not null default '',
  status        text not null default 'pending' check (status in ('pending', 'approved', 'dismissed')),
  role          text check (role in ('business', 'officer')),
  decided_by    uuid references public.profiles (id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists waitlist_pending_email_idx on public.waitlist (lower(email)) where status = 'pending';
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;
drop policy if exists waitlist_admin_select on public.waitlist;
create policy waitlist_admin_select on public.waitlist
  for select to authenticated using (public.is_admin());
drop policy if exists waitlist_admin_update on public.waitlist;
create policy waitlist_admin_update on public.waitlist
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
-- Requests arrive through /api/join (service role); approvals through
-- /api/admin/members (it sends the invitation). Admins may dismiss here.
revoke insert, delete on public.waitlist from anon, authenticated;
revoke update on public.waitlist from anon, authenticated;
grant update (status, decided_at, decided_by) on public.waitlist to authenticated;

create or replace function public.waitlist_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and auth.uid() is not null then
    new.decided_by := auth.uid();
    new.decided_at := coalesce(new.decided_at, now());
    perform public.audit('waitlist.' || new.status, new.email, jsonb_build_object('name', new.name, 'organization', new.organization));
  end if;
  return new;
end; $$;
drop trigger if exists trg_waitlist_audit on public.waitlist;
create trigger trg_waitlist_audit
  before update on public.waitlist
  for each row execute function public.waitlist_audit();

-- ── audit: role changes and invite revocations made in the app ───────────────

create or replace function public.profiles_role_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    perform public.audit('member.role_changed', new.email, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end; $$;
drop trigger if exists trg_profiles_role_audit on public.profiles;
create trigger trg_profiles_role_audit
  after update on public.profiles
  for each row execute function public.profiles_role_audit();

create or replace function public.invites_audit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status = 'revoked' then
    perform public.audit('invite.revoked', new.email, jsonb_build_object('role', new.role));
  end if;
  return new;
end; $$;
drop trigger if exists trg_invites_audit on public.officer_invites;
create trigger trg_invites_audit
  after update on public.officer_invites
  for each row execute function public.invites_audit();

-- ── invite-only sign-up: Supabase "Before User Created" hook ─────────────────

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(coalesce(event->'user'->>'email', '')));
  v_mode  text;
begin
  select signup_mode into v_mode from public.app_settings where id;
  if coalesce(v_mode, 'open') = 'open' then
    return '{}'::jsonb;
  end if;
  if v_email <> '' and exists (
    select 1 from public.officer_invites where lower(email) = v_email and status = 'pending'
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'New accounts need an access code or an invitation. Use your code at 901safety.com/join, or ask to join there.'
  ));
end; $$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
  end if;
end $$;

-- ── public map: sanitized, delayed, block-level ─────────────────────────────
-- Community reports only (never officers-only), no free text, no people or
-- vehicle descriptions, no reporter, photos or contact; coordinates snapped
-- to a ~100 m grid; dismissed reports left out.

create or replace function public.public_incidents(p_hours integer default 48)
returns table (
  ref          text,
  category     text,
  priority     smallint,
  status       text,
  lat          double precision,
  lng          double precision,
  reported_at  timestamptz,
  updated_at   timestamptz
)
language sql stable security definer set search_path = public as $$
  select left(md5(r.id::text), 10),
         r.incident_type,
         r.priority,
         r.status,
         round(r.lat::numeric, 3)::double precision,
         round(r.lng::numeric, 3)::double precision,
         r.created_at,
         r.updated_at
    from public.reports r
    join public.app_settings s on s.id
   where s.public_map_enabled
     and r.visibility = 'community'
     and r.status <> 'dismissed'
     and r.created_at > now() - make_interval(hours => least(greatest(coalesce(p_hours, 48), 1), 168))
     and r.created_at <= now() - make_interval(mins => s.public_map_delay_minutes)
   order by r.created_at desc
   limit 300;
$$;
revoke all on function public.public_incidents(integer) from public;
grant execute on function public.public_incidents(integer) to anon, authenticated;
