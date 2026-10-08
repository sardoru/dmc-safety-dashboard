-- ════════════════════════════════════════════════════════════════════════════
-- Core Downtown Memphis Safety Dashboard — 0003: who may write what
--
--   • profiles: members edit only their display name (admins: roles). The
--     passkey sign-in used to trust profiles.email, which let any member take
--     over another account (the API now reads auth.users; this closes it in
--     the database too).
--   • reports: the database stamps who filed a report and from which
--     storefront; the officer workflow (status, priority, assignment,
--     timestamps) stays officer-only.
--   • report_updates: members add plain notes as themselves; the one system
--     line they may write is the "Report received …" receipt.
--   • bolos: a sighting only counts against an active lookout; members can
--     read a lookout for a day after it is cleared, so Realtime tells them.
--   • profiles role guard: the server (service role) can set a role, which is
--     how /api/officers/invite promotes an existing account.
--   • mark_report_seen(): signed-in members only.
--
-- Server-side code (service role, no signed-in user) is not restricted.
-- Safe to run more than once. Run with `supabase db push` or paste into the
-- Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── profiles ─────────────────────────────────────────────────────────────────

revoke update on public.profiles from anon, authenticated;
grant update (display_name, role) on public.profiles to authenticated;

create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role) and auth.uid() is not null and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end; $$;

-- ── reports: insert ──────────────────────────────────────────────────────────

create or replace function public.guard_report_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  biz record;
  me  record;
begin
  if uid is null then
    return new;
  end if;

  new.reporter_id := uid;
  new.created_at  := now();
  if public.is_officer() then
    return new;
  end if;

  new.source          := 'business';
  new.status          := 'active';
  new.assigned_to     := null;
  new.assigned_name   := null;
  new.acknowledged_at := null;
  new.resolved_at     := null;
  new.acknowledged_by := '{}';

  -- A member files as itself: its own storefront, else its own name.
  select id, name into biz from public.businesses where owner_id = uid limit 1;
  if biz.id is not null then
    new.business_id   := biz.id;
    new.business_name := biz.name;
  else
    select coalesce(nullif(btrim(display_name), ''), nullif(split_part(coalesce(email, ''), '@', 1), ''), 'Member') as name
      into me from public.profiles where id = uid;
    new.business_id   := null;
    new.business_name := coalesce(me.name, 'Member');
  end if;

  -- A sighting can only point at an active lookout.
  if new.bolo_id is not null
     and not exists (select 1 from public.bolos b where b.id = new.bolo_id and b.status = 'active') then
    new.bolo_id := null;
  end if;

  return new;
end; $$;

drop trigger if exists trg_reports_guard_insert on public.reports;
create trigger trg_reports_guard_insert
  before insert on public.reports
  for each row execute function public.guard_report_insert();

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

-- ── reports: update ──────────────────────────────────────────────────────────
-- Members change nothing on a report except adding themselves to
-- acknowledged_by (what mark_report_seen() does). Runs before
-- trg_reports_updated_at (triggers fire in name order).

create or replace function public.guard_report_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  seen uuid[];
begin
  if uid is null or public.is_officer() then
    return new;
  end if;

  seen := old.acknowledged_by;
  if not (uid = any(old.acknowledged_by))
     and new.acknowledged_by = array_append(old.acknowledged_by, uid) then
    seen := new.acknowledged_by;
  end if;

  new := old;
  new.acknowledged_by := seen;
  return new;
end; $$;

drop trigger if exists trg_reports_guard_update on public.reports;
create trigger trg_reports_guard_update
  before update on public.reports
  for each row execute function public.guard_report_update();

-- ── report_updates: insert ───────────────────────────────────────────────────

create or replace function public.guard_report_update_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  me  record;
begin
  if uid is null then
    return new;
  end if;

  new.author_id  := uid;
  new.created_at := now();
  if public.is_officer() then
    return new;
  end if;

  new.internal := false;
  new.meta     := '{}'::jsonb;

  -- The app writes this receipt right after a member files a report.
  if new.kind = 'system'
     and new.body ~ '^Report received (by voice interview|as a quick alert|via the report form)\.$' then
    new.author_name := 'System';
    new.author_role := 'system';
    return new;
  end if;

  select role, coalesce(nullif(btrim(display_name), ''), nullif(split_part(coalesce(email, ''), '@', 1), '')) as name
    into me from public.profiles where id = uid;
  new.kind        := 'note';
  new.author_role := coalesce(me.role, 'business');
  new.author_name := coalesce(me.name, 'Member');
  return new;
end; $$;

drop trigger if exists trg_report_updates_guard_insert on public.report_updates;
create trigger trg_report_updates_guard_insert
  before insert on public.report_updates
  for each row execute function public.guard_report_update_insert();

-- ── bolos ────────────────────────────────────────────────────────────────────

create or replace function public.record_bolo_sighting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bolo_id is not null then
    update public.bolos
       set sightings          = sightings + 1,
           last_seen_at       = coalesce(new.occurred_at, new.created_at, now()),
           last_seen_location = coalesce(new.address, last_seen_location),
           last_seen_lat      = new.lat,
           last_seen_lng      = new.lng,
           report_ids         = case when new.id = any(report_ids) then report_ids
                                     else array_append(report_ids, new.id) end
     where id = new.bolo_id
       and status = 'active';
  end if;
  return new;
end; $$;

drop policy if exists bolos_select on public.bolos;
create policy bolos_select on public.bolos
  for select to authenticated
  using (
    status = 'active'
    or (status = 'cleared' and updated_at > now() - interval '1 day')
    or public.is_officer()
  );

-- ── mark_report_seen(): signed-in members only ───────────────────────────────

revoke execute on function public.mark_report_seen(uuid) from anon;
