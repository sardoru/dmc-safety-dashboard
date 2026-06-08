# Changelog

All notable changes to the DMC Safety Dashboard. Format follows
[Keep a Changelog](https://keepachangelog.com/); newest first.

## [Unreleased] — 2026-06-07

Turned the localStorage prototype into a real multi-tenant app with accounts, a
voice-first officer portal, a Supabase backend, and live Memphis PD scanner audio.

### Added
- **Accounts & passwordless auth.** Supabase magic-link sign-in with **branded
  navy/gold HTML emails** sent via **Resend** through a Supabase *Send Email*
  hook (Standard-Webhooks signature verified). **Passkeys** (WebAuthn) for
  enroll + usernameless re-login (`@simplewebauthn`). Three roles —
  `business` / `officer` / `admin` — with React Router guards, a unified
  `/login`, `/auth/callback`, and an `/account` page (profile + passkey manager).
- **DMC Officer portal (`/officer`).** File suspicious-activity reports two ways:
  - **GPT Realtime voice-to-voice** over WebRTC (`gpt-realtime`), with a
    `file_suspicious_report` tool that auto-fills the draft, live transcripts,
    and the **mobile half-duplex echo fix** (mic gating + raised server-VAD
    threshold).
  - **Tap-to-speak** record → OpenAI transcription → AI structuring of the
    transcript into incident type + description + location hint.
  - **Drop-a-pin** Leaflet map (click / drag / "my location") with reverse +
    forward geocoding; submit pushes the report live to the map.
- **Admin portal (`/admin`).** Invite officers by email (branded invite,
  role auto-claimed on first login), demote officers, revoke pending invites,
  and view businesses + stats.
- **Memphis PD live scanner.** Broadcastify **feed 215** ("Memphis Police &
  Shelby County Sheriff") card in the radio panel — inline `<audio>` when a
  stream URL is configured, otherwise a one-tap official-player popup.
- **Supabase backend.** `supabase/migrations/0001_init.sql`: `profiles`,
  `businesses`, `reports`, `officer_invites`, `passkeys`,
  `webauthn_challenges`; RLS, a `handle_new_user` trigger that auto-claims
  officer invites, a role-escalation guard trigger, and Realtime on `reports`.
- **Serverless API (`/api`).** `realtime/session`, `transcribe`,
  `reports/extract`, `auth/email-hook`, `officers/invite`, and the four
  `passkeys/*` endpoints, with shared `_lib` helpers (admin client, auth/role
  guards, email templates, WebAuthn, HTTP).

### Changed
- Reports/alerts now persist in Supabase and stream to every client via
  Realtime (`AlertContext`), replacing localStorage in connected mode.
- The map + business count now read **registered businesses from the DB**
  (`useBusinesses`), falling back to the demo set when not connected.
- Vite **code-splitting** (manualChunks + lazy routes) — no more 500 kB
  warning; largest app chunk ≈ 67 kB gzipped.
- Fixed Tailwind v4 **class-based dark mode** (`@custom-variant dark`) so the
  manual theme toggle drives `dark:` utilities.

### Decisions
- **Officer access = admin-invites** (vs. allowlist / self-serve).
- **Email = Resend via Supabase Send Email hook** (vs. Supabase built-in SMTP) —
  full branding + production deliverability.
- **Graceful demo mode:** with no Supabase env the app behaves exactly like the
  original prototype, so the live URL never breaks before keys are added.

### Known / open
- Set Vercel env vars (Supabase, OpenAI, Resend, `SEND_EMAIL_HOOK_SECRET`) — see README.
- Run `0001_init.sql`, enable the Send Email Hook, and allow-list `/auth/callback`.
- Optional: `VITE_BROADCASTIFY_STREAM_URL` for inline scanner audio (else popup).
- Work is on branch `feat/accounts-officer-portal` (preview deploy); not yet merged to `main`.
- Pre-existing lint conventions remain (context provider+hook co-location; one RadioContext deps warning).
