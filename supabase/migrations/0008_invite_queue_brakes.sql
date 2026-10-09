-- 0008 — Paced invitations: brakes and no repeats (follows 0006; 0007 is the report-privacy change).
--
--   • invite_queue.emailing_at — stamped right before an invitation's email is handed to the email
--     service (and only while the row is still being sent and not cancelled). A row stuck in
--     "sending" with this set may have gone out, so it is never put back in the queue; one without it
--     never started emailing and can be.
--   • invite_queue_settings.pause_reason — why the queue paused itself (the email service's daily or
--     monthly limit), shown in Admin → Team; empty when an administrator paused it.
--   • invite_queue_settings.last_slot — the quarter hour the last run took. Each run claims its slot
--     with a check-and-set, so a duplicate delivery of the same cron can't double the pace.
--   • invite_queue_settings.last_run_at / last_run — when the last run happened and what it did.
--
-- RLS and the revokes from 0006 cover the new columns: browsers still can't read or write either table.
-- Additive and idempotent: safe to run more than once.

alter table public.invite_queue add column if not exists emailing_at timestamptz;

alter table public.invite_queue_settings add column if not exists pause_reason text check (char_length(pause_reason) <= 200);
alter table public.invite_queue_settings add column if not exists last_slot timestamptz not null default '-infinity';
alter table public.invite_queue_settings add column if not exists last_run_at timestamptz;
alter table public.invite_queue_settings add column if not exists last_run jsonb;
