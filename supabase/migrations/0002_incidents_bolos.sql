-- ════════════════════════════════════════════════════════════════════════════
-- Core Downtown Memphis Safety Dashboard — 0002: incident workflow
--
--   • reports: priority, structured subjects/vehicles, flags, photos,
--     assignment, visibility, timestamps, BOLO link
--   • report_updates: the incident timeline (status changes, notes, sightings)
--   • bolos: "be on the lookout" board for persons / vehicles of interest
--   • storage bucket `report-media` for report photos
--   • mark_report_seen(): lets a business mark a community alert as seen
--
-- Safe to run more than once. The app detects whether this migration has been
-- applied and degrades gracefully (legacy columns only) until it is.
-- Run with `supabase db push` or paste into the Supabase SQL editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── BOLOs (created first: reports reference them) ───────────────────────────

create table if not exists public.bolos (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null default 'person' check (kind in ('person','vehicle')),
  title              text not null,
  summary            text not null default '',
  subject            jsonb,
  vehicle            jsonb,
  photo_path         text,
  report_ids         uuid[] not null default '{}',
  status             text not null default 'active' check (status in ('active','cleared','expired')),
  created_by         uuid references public.profiles (id) on delete set null,
  created_by_name    text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  expires_at         timestamptz not null default (now() + interval '7 days'),
  last_seen_at       timestamptz,
  last_seen_location text,
  last_seen_lat      double precision,
  last_seen_lng      double precision,
  sightings          integer not null default 0
);

create index if not exists bolos_status_idx on public.bolos (status, created_at desc);

-- ── reports: new columns ─────────────────────────────────────────────────────

alter table public.reports add column if not exists title          text;
alter table public.reports add column if not exists priority       smallint not null default 3;
alter table public.reports add column if not exists occurred_at    timestamptz;
alter table public.reports add column if not exists happening_now  boolean not null default false;
alter table public.reports add column if not exists weapons_seen   boolean not null default false;
alter table public.reports add column if not exists injuries       boolean not null default false;
alter table public.reports add column if not exists subjects       jsonb not null default '[]'::jsonb;
alter table public.reports add column if not exists vehicles       jsonb not null default '[]'::jsonb;
alter table public.reports add column if not exists photos         text[] not null default '{}';
alter table public.reports add column if not exists location_note  text;
alter table public.reports add column if not exists assigned_to    uuid references public.profiles (id) on delete set null;
alter table public.reports add column if not exists assigned_name  text;
alter table public.reports add column if not exists acknowledged_at timestamptz;
alter table public.reports add column if not exists resolved_at    timestamptz;
alter table public.reports add column if not exists updated_at     timestamptz not null default now();
alter table public.reports add column if not exists visibility     text not null default 'community';
alter table public.reports add column if not exists contact_ok     boolean not null default true;
alter table public.reports add column if not exists contact_phone  text;
alter table public.reports add column if not exists bolo_id        uuid references public.bolos (id) on delete set null;
alter table public.reports add column if not exists ai_summary     text;

-- Widen the status / kind vocab and constrain the new columns.
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('active','acknowledged','responding','resolved','dismissed'));

alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check
  check (kind in ('voice','quick','incident','form'));

alter table public.reports drop constraint if exists reports_priority_check;
alter table public.reports add constraint reports_priority_check check (priority between 1 and 4);

alter table public.reports drop constraint if exists reports_visibility_check;
alter table public.reports add constraint reports_visibility_check
  check (visibility in ('community','officers'));

-- Backfill a sensible priority for rows filed before priorities existed
-- (legacy rows have no title; the app always sets one now).
update public.reports
   set priority = case incident_type
                    when 'Medical Emergency' then 1
                    when 'Fire/Hazard'       then 1
                    when 'Noise Disturbance' then 4
                    else priority
                  end
 where title is null and priority = 3;

create index if not exists reports_priority_idx on public.reports (priority, created_at desc);
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);
create index if not exists reports_bolo_idx on public.reports (bolo_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id, created_at desc);

-- Keep updated_at fresh (reuses touch_updated_at() from 0001).
drop trigger if exists trg_reports_updated_at on public.reports;
create trigger trg_reports_updated_at
  before update on public.reports
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_bolos_updated_at on public.bolos;
create trigger trg_bolos_updated_at
  before update on public.bolos
  for each row execute function public.touch_updated_at();

-- A report filed as a sighting of a BOLO bumps the BOLO's sighting count and
-- last-seen details (SECURITY DEFINER: businesses can't update bolos directly).
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
     where id = new.bolo_id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_reports_bolo_sighting on public.reports;
create trigger trg_reports_bolo_sighting
  after insert on public.reports
  for each row execute function public.record_bolo_sighting();

-- ── Incident timeline ────────────────────────────────────────────────────────

create table if not exists public.report_updates (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_name text,
  author_role text,
  kind        text not null default 'note'
              check (kind in ('note','status','assignment','priority','system','sighting')),
  body        text not null default '',
  internal    boolean not null default false,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists report_updates_report_idx on public.report_updates (report_id, created_at);

-- ── Row Level Security ───────────────────────────────────────────────────────

alter table public.bolos          enable row level security;
alter table public.report_updates enable row level security;

-- reports: officers see everything; a reporter sees their own; everyone signed
-- in sees reports shared with the business community.
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using (visibility = 'community' or reporter_id = auth.uid() or public.is_officer());

-- report_updates: officers see all; a reporter sees the non-internal updates on
-- their own reports. Officers write anything; a reporter may add a public note
-- to their own report as themselves.
drop policy if exists report_updates_select on public.report_updates;
create policy report_updates_select on public.report_updates
  for select to authenticated
  using (
    public.is_officer()
    or (not internal and exists (
      select 1 from public.reports r where r.id = report_id and r.reporter_id = auth.uid()
    ))
  );

drop policy if exists report_updates_insert on public.report_updates;
create policy report_updates_insert on public.report_updates
  for insert to authenticated
  with check (
    public.is_officer()
    or (
      internal = false
      and author_id = auth.uid()
      and exists (select 1 from public.reports r where r.id = report_id and r.reporter_id = auth.uid())
    )
  );

drop policy if exists report_updates_delete on public.report_updates;
create policy report_updates_delete on public.report_updates
  for delete to authenticated using (public.is_admin());

-- bolos: signed-in users read active ones (officers read all); officers manage.
drop policy if exists bolos_select on public.bolos;
create policy bolos_select on public.bolos
  for select to authenticated
  using (status = 'active' or public.is_officer());

drop policy if exists bolos_write on public.bolos;
create policy bolos_write on public.bolos
  for all to authenticated
  using (public.is_officer()) with check (public.is_officer());

grant select, insert, update, delete on public.bolos, public.report_updates to authenticated;

-- A business marks a community alert as seen. reports_update only lets the
-- reporter or an officer write a row, so this narrow SECURITY DEFINER helper
-- appends the caller to acknowledged_by and nothing else.
create or replace function public.mark_report_seen(p_report uuid)
returns void language sql security definer set search_path = public as $$
  update public.reports
     set acknowledged_by = array_append(acknowledged_by, auth.uid())
   where id = p_report
     and auth.uid() is not null
     and not (auth.uid() = any(acknowledged_by))
     and (visibility = 'community' or reporter_id = auth.uid() or public.is_officer());
$$;

revoke all on function public.mark_report_seen(uuid) from public;
grant execute on function public.mark_report_seen(uuid) to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'report_updates'
  ) then
    alter publication supabase_realtime add table public.report_updates;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bolos'
  ) then
    alter publication supabase_realtime add table public.bolos;
  end if;
end $$;

-- ── Storage: report photos ───────────────────────────────────────────────────
-- Private bucket. Files live under <uploader uid>/<file>. The uploader and
-- officers can read them (the app uses short-lived signed URLs).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-media', 'report-media', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do nothing;

drop policy if exists report_media_insert on storage.objects;
create policy report_media_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'report-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists report_media_select on storage.objects;
create policy report_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_officer())
  );

drop policy if exists report_media_delete on storage.objects;
create policy report_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'report-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
