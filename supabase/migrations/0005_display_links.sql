-- 0005 — Wall displays: private, revocable links for a TV on an office wall (/tv#key=…).
--
-- An administrator creates a display link in Admin → Access. The key is shown once, inside the link; only its
-- SHA-256 hash is stored. /api/display looks the hash up with the service role and answers with a minimal,
-- read-only feed (no reporter, contact details, descriptions, photos or notes). Revoking a link stops it at
-- once. The table has RLS on and NO policies: browsers can't read or write it — only the server can.
--
-- Additive and idempotent: safe to run more than once.

create table if not exists public.display_links (
  id            uuid primary key default gen_random_uuid(),
  label         text not null check (char_length(label) between 1 and 60),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists display_links_active_idx on public.display_links (created_at desc) where revoked_at is null;

alter table public.display_links enable row level security;
revoke all on public.display_links from anon, authenticated;
