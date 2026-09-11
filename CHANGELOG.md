# Changelog

All notable changes to the Core Downtown Memphis Safety Dashboard. Format follows
[Keep a Changelog](https://keepachangelog.com/); newest first.

## [Unreleased] — Voice on OpenAI GPT-Live-1 (raw full duplex) 🎙️

The officer voice report moved from OpenAI Realtime (`gpt-realtime`) to the new **Live API**
(`gpt-live-1`) — a transport migration, not a model swap.

### Changed
- **`/api/live-session` replaces `/api/realtime/session`.** The browser now POSTs its WebRTC
  SDP offer to our function, which creates the GPT-Live session with the project key
  (`POST /v1/live/sessions`) and returns `{ sdp, sessionId, opening }` — the browser never
  talks to OpenAI directly and no ephemeral token exists any more. Errors: missing key → 503,
  bad/absent offer → 400, OpenAI upstream failure → 502; officer/admin role guard unchanged.
- **Raw full duplex.** The mic stays open for the whole call; the officer interrupts by talking
  and a loudspeaker's echo is left to the browser's echo canceller + the model. The assistant
  still **speaks first** via the GPT-Live greeting recipe (`session.instructions.append` →
  `session.commentary.append` after `session.started`).
- **Prompt split** into a live prompt (persona, pacing, backchannel / interruption / silence /
  delegation policy), a backend prompt (report rules, field normalisation, the tool workflow)
  and the opening script. The `file_suspicious_report` tool now lives on the Responses backend
  (`delegation.responses.tools`, `gpt-5.6-terra`, reasoning effort `low`); its call arrives on
  the `oai-events` data channel and the browser answers it (`response.item.create` +
  `response.create`) while filling the draft — the old client never returned a tool result.
- **Transcripts** are stitched from GPT-Live's timed word pieces (verbatim concatenation, rows
  split by a 2.5 s timeline gap); the "Assistant speaking…" readout is an `AnalyserNode` level
  meter on the remote track (no output-audio events exist over WebRTC).
- `src/lib/realtime.ts` → `src/lib/live.ts` (`LiveSession`); `VoiceReportRealtime` →
  `VoiceReportLive`. Ending a call sends `session.close` and waits (≤1.5 s) for `session.closed`.

### Removed
- Server-VAD tuning, input-transcription config, the mobile half-duplex mic gate and its
  "use earbuds" tip, the `response.create` greeting kick-off, and `OPENAI_REALTIME_MODEL`.

### Added
- Optional env overrides `OPENAI_LIVE_MODEL`, `OPENAI_LIVE_VOICE`, `OPENAI_LIVE_BACKEND_MODEL`,
  `OPENAI_LIVE_BACKEND_EFFORT` (defaults `gpt-live-1` / `marin` / `gpt-5.6-terra` / `low`) —
  nothing has to change in Vercel for the defaults.

### Verified
- `tsc` (app + api), eslint, `npm run build`; a Node harness calling the function with a real
  headless-Chromium SDP offer (200 + SDP answer, 405/401/400/503 paths); and a full headless call
  through the built `/officer` page with a fake microphone: greeting first, officer transcript,
  `file_suspicious_report` round-trip that auto-filled the draft, spoken confirmation,
  `session.closed` with usage, no `error` events.

## [0.2.0] — 2026-06-09 — Rebrand + branded identity 🛡️

Renamed to **Core Downtown Memphis Safety Dashboard** and gave it a real visual identity.

### Changed
- **Rebrand → "Core Downtown Memphis Safety Dashboard."** Renamed across UI, emails,
  API, and `<title>` (25 files). **Removed every "Downtown Memphis Commission" mention**;
  **"DMC Officer" → "Public Safety"** (report source + role labels); the header now reads
  **Core Downtown Memphis** / *Safety Dashboard*. Updated the `EMAIL_FROM` sender name.
  (Repo, URL, and Supabase project keep their `dmc-` infra names for link stability.)
- **Map basemap → CARTO Voyager** (light) + **Dark Matter** (dark) with retina
  (`detectRetina`) tiles — replaces the raw, dated OpenStreetMap raster. Both are
  OSM-based, free, no API key.

### Added
- **Branded favicon** — a navy/gold shield-check (`favicon.svg` + 16/32 PNG +
  multi-res `.ico` + 180px `apple-touch-icon`), replacing the default Vite logo.
- **Custom 1200×630 OG image** (`public/og-image.png`) for link previews, with full
  **Open Graph + Twitter `summary_large_image`** meta + `theme-color` in `index.html`.

## [0.1.0] — 2026-06-08 — Production launch 🚀

Wired the live backend, fixed two production-blocking bugs, and merged to `main`.
The app is now **live with real auth** at https://dmc-safety-dashboard.vercel.app.

### Added
- **Whitelisted admins.** `sardoru@gmail.com` (migration-seeded) and
  `ugsuzbek@gmail.com` (seeded this session) are pending-admin `officer_invites` —
  each becomes `admin` automatically on first magic-link login.

### Changed
- **Police scanner plays inline.** The Memphis PD scanner (Broadcastify feed 215)
  now streams **inside the dashboard** when you press play — it uses the feed's
  CORS-open Icecast mount (`https://broadcastify.cdnstream1.com/215`) in the app's
  own `<audio>` element with play/pause + volume — instead of opening Broadcastify
  in a popup. Falls back to the popup player automatically if the stream errors.

- **Left panel is a real "Activity Feed" now.** Removed the simulated police-radio
  chatter (deleted `mockRadio.ts`; `RadioContext` no longer has a mock mode). The
  panel shows **only real data** — submitted reports (officer voice + business
  Call-for-Help, via Supabase) merged with live scanner transcriptions when the
  radio-transcriptor bridge is connected — time-sorted, with an empty state when
  there's nothing yet.

### Fixed
- **All `/api` functions returned `500` in production** (`ERR_MODULE_NOT_FOUND`).
  With `package.json` `"type":"module"`, Vercel runs the functions as native ESM,
  which requires explicit `.js` extensions on relative imports. Added `.js` to all
  **28 relative imports across 11 `/api` files**. (Bundler resolution hid this at
  build time; the SPA was unaffected.)
- **Public dashboard was unreachable.** `/` was wrapped in `RequireAuth`, so once
  real Supabase env vars were set, clicking "Continue to the public dashboard" on
  `/login` bounced straight back to `/login`. Removed the wrapper — `/` is now
  public (auth still gates `/account`, `/officer`, `/admin`). Verified in a browser.

- **Blank dashboard after magic-link sign-in** ([#2](https://github.com/sardoru/dmc-safety-dashboard/issues/2)).
  `useBusinesses()` renders in both `<Header>` and `<MapView>`, and both opened a
  Supabase Realtime channel named `public:businesses` — so the second subscriber
  threw `cannot add postgres_changes callbacks … after subscribe()`. The
  subscription only runs when authenticated, so anonymous worked but **every
  signed-in user got a white screen** (the throw unmounted the whole tree — no
  error boundary). Fixed with **unique per-subscription channel names**
  (`useBusinesses` + `AlertContext`) and a new **`ErrorBoundary`** around the map
  and at the app root, so one failing component can never white-screen the app again.

### Infrastructure / config
- **Vercel env** set for Production + Development (Supabase URL/anon/service-role,
  `SITE_URL`, OpenAI, Resend, `SEND_EMAIL_HOOK_SECRET`). **Preview left in demo
  mode** on purpose (no prod Supabase creds → previews never touch prod data).
- **Supabase Auth** configured via Management API: Site URL + redirect allow-list
  (prod `/auth/callback` + `/**`, `localhost:5173`).
- **Resend Send-Email hook enabled** → branded navy/gold emails replace Supabase's
  bland default (verified: hook `POST` → `200`; from `safety@sardoru.com`).
- Deployed to production (CLI `vercel --prod`); **PR #1 merged to `main`** (squash).
- Hardened `.gitignore` against committing `.env*` secrets.

### Decisions / corrections (supersede earlier notes)
- **`ADMIN_EMAILS` is NOT wired in code** — admin comes only from the
  `officer_invites` seed + `handle_new_user` trigger. (README corrected.)
- **`RP_ID`/`RP_ORIGIN` left unset** → derived from request host, so passkeys work
  on production *and* preview domains.
- **`EMAIL_FROM` = `DMC Safety Dashboard <safety@sardoru.com>`** (a verified Resend
  domain; no DMC-specific domain exists yet).
- **Deploys are CLI (`vercel --prod`), not git-connected** — merging `main` does
  not auto-deploy.
- `ugsuzbek@gmail.com` granted `admin` (could be `officer` if preferred).

### Known / open
- **Supabase email rate limit still at default 2/hour** — raise to ~30 before
  onboarding multiple users (attempted this session, deferred as out-of-scope).
- `ugsuzbek@gmail.com` has not logged in yet (no magic link sent to them).
- Voice (OpenAI) wired + key validated, but not exercised end-to-end.
- Rotate/revoke the Supabase Management token used for setup.
- `vercel.json` `memory` setting is ignored on Active-CPU billing (harmless; can remove).
- Custom domain `safety.downtownmemphis.com` not set; consider DMC-branded `EMAIL_FROM`.

## 2026-06-07 — Backend build (on `feat/accounts-officer-portal`)

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
