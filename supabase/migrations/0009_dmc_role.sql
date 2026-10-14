-- ════════════════════════════════════════════════════════════════════════════
-- Core Downtown Memphis Safety Dashboard — 0009: the DMC role
--
--   • 'dmc': a role with exactly a Public Safety officer's access, for the
--     Downtown Memphis Commission. Every officer rule — the policies, the write
--     guards, the report photos — goes through is_officer(), which now
--     includes it
--   • it ranks with officers (role_rank 2), so an invitation or an access code
--     never moves anyone between officer and DMC. To switch someone, remove
--     their access in Admin → Team, then invite them again
--   • profiles and invitations (officer_invites) accept it. Access codes,
--     requests to join and Invite a list don't: DMC is invited one at a time
--     (Admin → Team → Invite someone)
--
-- Run it BEFORE deploying the app that offers the role: without it, inviting
-- someone as DMC fails on the role check. The previous app is unaffected —
-- nobody has the role yet. Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('business', 'officer', 'dmc', 'admin'));

alter table public.officer_invites drop constraint if exists officer_invites_role_check;
alter table public.officer_invites add constraint officer_invites_role_check
  check (role in ('business', 'officer', 'dmc', 'admin'));

-- An older role check under another name would still refuse 'dmc', and the
-- sign-up trigger would fail when a DMC invitation is claimed. Stop here instead.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid in ('public.profiles'::regclass, 'public.officer_invites'::regclass)
       and contype = 'c'
       and pg_get_constraintdef(oid) ~ '\mrole\M'
       and pg_get_constraintdef(oid) !~ '''dmc'''
  ) then
    raise exception 'A role check on profiles or officer_invites leaves out dmc: drop it, then run 0009 again';
  end if;
end $$;

-- SECURITY DEFINER to avoid RLS recursion on profiles (as in 0001).
create or replace function public.is_officer()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()) in ('officer', 'dmc', 'admin'), false);
$$;

create or replace function public.role_rank(r text)
returns integer language sql immutable as $$
  select case r when 'admin' then 3 when 'officer' then 2 when 'dmc' then 2 when 'business' then 1 else 0 end;
$$;
