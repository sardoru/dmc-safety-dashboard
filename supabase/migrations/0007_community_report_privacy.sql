-- ════════════════════════════════════════════════════════════════════════════
-- Core Downtown Memphis Safety Dashboard — 0007: private report fields stay private
--
-- Until now `reports_select` let every signed-in member read every report shared
-- with the community — the whole row: the reporter's contact phone, the voice
-- interview transcript, the reporter's account id, photo paths and internal
-- fields. The app showed a summary, but the rest reached every member's browser
-- (REST reads and Realtime).
--
--   • community_reports: a copy of each community report holding only what other
--     member businesses are shown — headline, category, priority, status, place,
--     time, flags, the description and the people and vehicles to look out for,
--     the storefront that filed it, how many photos it has and how many members
--     marked it as seen. Triggers on reports keep it in sync (new reports, every
--     change, visibility changes both ways, deletes). Signed-in members read it;
--     nobody writes it; Realtime streams it.
--   • reports_select: the reporter (their own reports, every field) and officers
--     and admins (every report) — nobody else.
--   • my_seen_report_ids(): the community alerts the caller marked as seen (the
--     copy carries a count, never who).
--   • businesses_select: a member reads only their own storefront (contact name,
--     phone, email); officers and admins read the directory.
--
-- Order: deploy the app first — it works with and without this migration — then
-- run this file in the Supabase SQL editor. Open dashboards switch over on their
-- own within two minutes.
--
-- Safe to run more than once: a re-run re-syncs the copies and leaves rows that
-- are already right untouched (no Realtime traffic).
-- ════════════════════════════════════════════════════════════════════════════

-- ── helper: keep listed fields ───────────────────────────────────────────────
-- For each object in a JSON array, keep only the listed keys whose values are
-- text or numbers. Descriptions are member-written JSON: anything else a client
-- stored there never reaches other members.

create or replace function public.keep_fields(p_items jsonb, p_keys text[])
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(kept.obj order by item.ord), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
         with ordinality as item(value, ord)
   cross join lateral (
     select coalesce(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) as obj
       from jsonb_each(case when jsonb_typeof(item.value) = 'object' then item.value else '{}'::jsonb end) as kv
      where kv.key = any(p_keys)
        and jsonb_typeof(kv.value) in ('string', 'number')
   ) as kept
   where jsonb_typeof(item.value) = 'object';
$$;
revoke all on function public.keep_fields(jsonb, text[]) from public, anon, authenticated;

-- ── community_reports ────────────────────────────────────────────────────────

create table if not exists public.community_reports (
  id             uuid primary key references public.reports (id) on delete cascade on update cascade,
  created_at     timestamptz not null,
  updated_at     timestamptz not null,
  occurred_at    timestamptz,
  source         text not null,
  kind           text not null,
  incident_type  text not null,
  priority       smallint not null,
  status         text not null,
  title          text,
  description    text not null default '',
  address        text,
  location_note  text,
  lat            double precision not null,
  lng            double precision not null,
  happening_now  boolean not null default false,
  weapons_seen   boolean not null default false,
  injuries       boolean not null default false,
  visibility     text not null default 'community' check (visibility = 'community'),
  subjects       jsonb not null default '[]'::jsonb,
  vehicles       jsonb not null default '[]'::jsonb,
  business_name  text,
  assigned_name  text,
  photo_count    integer not null default 0,
  seen_count     integer not null default 0
);

create index if not exists community_reports_created_idx on public.community_reports (created_at desc);

comment on table public.community_reports is
  'Community reports as other members see them: no reporter, contact details, transcript, photos or internal fields. Written only by trg_reports_sync_community (migration 0007).';
comment on column public.community_reports.business_name is
  'The storefront that filed it; null for officers'' reports and members without a storefront.';
comment on column public.community_reports.assigned_name is
  'The officer working it (shown on the nearby card).';
comment on column public.community_reports.photo_count is
  'How many photos the report has; the photos stay with officers and the reporter.';
comment on column public.community_reports.seen_count is
  'How many members marked it as seen; who did stays in reports.acknowledged_by.';

alter table public.community_reports enable row level security;

-- Signed-in members read it; no policy or grant writes it (the trigger below runs
-- as the table owner). Anonymous visitors get nothing — /live uses public_incidents().
revoke all on public.community_reports from anon, authenticated;
grant select on public.community_reports to authenticated;

drop policy if exists community_reports_select on public.community_reports;
create policy community_reports_select on public.community_reports
  for select to authenticated using (true);

-- ── keeping the copy in sync ─────────────────────────────────────────────────
-- One report in, one copy out: upsert the copy while the report is shared with
-- the community, delete it otherwise (officers-only or gone). A copy is only
-- rewritten when something members see changed, so edits to private fields
-- (contact phone, transcript, internal fields) send members nothing.

create or replace function public.sync_community_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.community_reports as c (
    id, created_at, updated_at, occurred_at, source, kind, incident_type, priority, status, title,
    description, address, location_note, lat, lng, happening_now, weapons_seen, injuries, visibility,
    subjects, vehicles, business_name, assigned_name, photo_count, seen_count
  )
  select r.id,
         r.created_at,
         coalesce(r.updated_at, r.created_at),
         r.occurred_at,
         r.source,
         r.kind,
         r.incident_type,
         r.priority,
         r.status,
         r.title,
         coalesce(r.description, ''),
         r.address,
         r.location_note,
         r.lat,
         r.lng,
         coalesce(r.happening_now, false),
         coalesce(r.weapons_seen, false),
         coalesce(r.injuries, false),
         'community',
         public.keep_fields(r.subjects, array['id', 'ageRange', 'sex', 'height', 'build', 'hair', 'clothingTop',
                                              'clothingBottom', 'footwear', 'distinguishing', 'behavior', 'direction']),
         public.keep_fields(r.vehicles, array['id', 'make', 'model', 'color', 'bodyType', 'plate', 'plateState',
                                              'direction', 'notes']),
         -- A storefront's name, never a person's: members without a storefront file under their own name.
         case when r.source = 'business' and exists (select 1 from public.businesses b where b.id = r.business_id)
              then nullif(btrim(r.business_name), '') end,
         nullif(btrim(r.assigned_name), ''),
         coalesce(cardinality(r.photos), 0),
         coalesce(cardinality(r.acknowledged_by), 0)
    from public.reports r
   where r.id = p_id
     and r.visibility = 'community'
  on conflict (id) do update
     set created_at    = excluded.created_at,
         updated_at    = excluded.updated_at,
         occurred_at   = excluded.occurred_at,
         source        = excluded.source,
         kind          = excluded.kind,
         incident_type = excluded.incident_type,
         priority      = excluded.priority,
         status        = excluded.status,
         title         = excluded.title,
         description   = excluded.description,
         address       = excluded.address,
         location_note = excluded.location_note,
         lat           = excluded.lat,
         lng           = excluded.lng,
         happening_now = excluded.happening_now,
         weapons_seen  = excluded.weapons_seen,
         injuries      = excluded.injuries,
         visibility    = excluded.visibility,
         subjects      = excluded.subjects,
         vehicles      = excluded.vehicles,
         business_name = excluded.business_name,
         assigned_name = excluded.assigned_name,
         photo_count   = excluded.photo_count,
         seen_count    = excluded.seen_count
   where (c.created_at, c.occurred_at, c.source, c.kind, c.incident_type, c.priority, c.status, c.title,
          c.description, c.address, c.location_note, c.lat, c.lng, c.happening_now, c.weapons_seen, c.injuries,
          c.visibility, c.subjects, c.vehicles, c.business_name, c.assigned_name, c.photo_count, c.seen_count)
         is distinct from
         (excluded.created_at, excluded.occurred_at, excluded.source, excluded.kind, excluded.incident_type,
          excluded.priority, excluded.status, excluded.title, excluded.description, excluded.address,
          excluded.location_note, excluded.lat, excluded.lng, excluded.happening_now, excluded.weapons_seen,
          excluded.injuries, excluded.visibility, excluded.subjects, excluded.vehicles, excluded.business_name,
          excluded.assigned_name, excluded.photo_count, excluded.seen_count);

  delete from public.community_reports c
   where c.id = p_id
     and not exists (select 1 from public.reports r where r.id = p_id and r.visibility = 'community');
end; $$;
revoke all on function public.sync_community_report(uuid) from public, anon, authenticated;

create or replace function public.reports_sync_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_community_report(old.id);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.id is distinct from old.id then
    perform public.sync_community_report(old.id);
  end if;
  perform public.sync_community_report(new.id);
  return new;
end; $$;
revoke all on function public.reports_sync_community() from public, anon, authenticated;

drop trigger if exists trg_reports_sync_community on public.reports;
create trigger trg_reports_sync_community
  after insert or update or delete on public.reports
  for each row execute function public.reports_sync_community();

-- Backfill (after the trigger exists, so nothing filed meanwhile is missed). On
-- a re-run this repairs any copy that drifted and changes nothing else.
do $$
begin
  perform public.sync_community_report(r.id) from public.reports r where r.visibility = 'community';
  delete from public.community_reports c
   where not exists (select 1 from public.reports r where r.id = c.id and r.visibility = 'community');
end $$;

-- ── Realtime ─────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_reports'
  ) then
    alter publication supabase_realtime add table public.community_reports;
  end if;
end $$;

-- ── "Marked as seen" for the caller ──────────────────────────────────────────
-- The copy says how many members saw an alert; this says whether the caller
-- did, for the latest 500 community reports, and nothing about anyone else.

create or replace function public.my_seen_report_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(s.id), '{}')
    from (
      select r.id
        from public.reports r
       where auth.uid() is not null
         and r.visibility = 'community'
         and auth.uid() = any(r.acknowledged_by)
       order by r.created_at desc
       limit 500
    ) s;
$$;
revoke all on function public.my_seen_report_ids() from public, anon;
grant execute on function public.my_seen_report_ids() to authenticated;

-- ── reports: the reporter and officers only ──────────────────────────────────
-- Everyone else reads community reports through community_reports above.
-- report_updates, mark_report_seen() and public_incidents() keep working: the
-- first checks the reporter, the other two are SECURITY DEFINER.

drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_officer());

-- ── businesses: your own storefront; officers and admins see the directory ───
-- The app never shows members other storefronts; the directory's contact name,
-- phone and email belong to officers and admins (the Ops map, Admin → Members).

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
  for select to authenticated
  using (owner_id = auth.uid() or public.is_officer());
