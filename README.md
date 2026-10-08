# Core Downtown Memphis Safety Dashboard

A **self-regulated safety dashboard** for **Downtown Memphis**. Local businesses report suspicious people,
suspicious activity and crimes they see — by a **short voice interview**, filling a
two-minute guided form, or sending a one-tap alert — and every report lands instantly on the
**Operations Center** that Downtown public-safety officers monitor. Officers triage, respond,
publish be-on-the-lookout notices, and **hear new reports read aloud**.

**Live:** https://dmc-safety-dashboard.vercel.app

---

## What it does

| Who | What they get |
| --- | --- |
| **Businesses** | A home screen with their open reports, live status updates and nearby community alerts on a map centred on their storefront. Three ways to report: **Report by voice** (an automated two-way interview — they just talk), a **guided form** that can read its questions aloud and organise dictated notes ("Organize my notes"), or a **quick alert**. Photos, people and vehicle descriptions, "happening now" / weapon / injury flags, and a spoken read-back confirmation. |
| **Public-safety officers** | The **Operations Center**: a live, prioritised queue (P1–P4) with new-report flashes, a district map with heat and BOLO layers, an activity stream, KPIs, **spoken alerts** for new high-priority reports, and a spoken **shift briefing** summarised from the last hours. Full triage on every report: acknowledge → responding → resolved (with outcome), priority, assignment, internal or public notes, directions, "Listen", and one-click BOLOs. Officers can file reports by voice too. |
| **Everyone signed in** | The **Lookout board** (active BOLOs with sightings), **Insights** for officers (trends, hot spots, response times), **Settings** (profile, storefront, voice + alert preferences, passkeys) and **Administration** for admins (officer invites, team, businesses, system status). |

The app is fully responsive (phone bottom-tab layout with a centre **Report** button; desktop
sidebar), has light and dark themes, and keeps a **"Call 9-1-1 first"** callout everywhere a
report starts — this is not an emergency line.

---

## Voice and AI

### Two-way reporting — OpenAI **GPT-Live** (`gpt-live-1`)
- The browser opens a WebRTC connection and posts its SDP offer to
  [`/api/live-session`](./api/live-session.ts). The function creates the Live session with the
  project key (`POST /v1/live/sessions`) and returns the SDP answer — the browser never holds
  an OpenAI key.
- **Full duplex**: the interviewer speaks first, the caller talks naturally and can interrupt.
  Pacing, backchannels, interruptions and silence are prompt policy.
- **Personas**: businesses get a warm interviewer that knows their storefront (read from the
  database, never the request) and works through *what, where, when, who, vehicles, contact*
  one question at a time; officers get a terse intake assistant. Spanish callers are answered
  in Spanish.
- The interviewer **delegates** to a Responses backend (`gpt-5.6-terra`, effort `low`) that
  owns the `file_incident_report` tool: category, priority, headline, description, location,
  time, flags, and structured **subjects** and **vehicles**. The tool call arrives on the
  `oai-events` data channel; the browser fills the draft live, answers the tool, and the
  interviewer reads back a one-sentence confirmation.
- **Fairness built in**: no race field anywhere; the interviewer asks what the person *did* and
  for clothing and identifying details rather than appearance; it never promises a response
  time. Anyone in danger is told to call 9-1-1.
- The data channel is locked to a short allow-list of client events.

### Speech — ElevenLabs **Eleven v4**
- [`/api/tts`](./api/tts.ts) streams `audio/mpeg` from ElevenLabs with the key kept server-side
  (signed-in users only, rate-limited, 2,400 characters max).
- **Eleven v4** is requested through the Text to Dialogue API first (where v4 launched), then
  the classic text-to-speech route, then `ELEVENLABS_FALLBACK_MODEL` — so speech keeps working
  while v4 rolls out to an account. The response headers say which route/model answered.
- Used for: **spoken alerts** on new reports (officers, with a minimum-priority threshold),
  the **shift briefing**, the reporter's **read-back** confirmation and status updates,
  **Listen** buttons on reports and BOLOs, the guided form's **voice prompts**, and voice
  previews in Settings. Each user picks a voice (their account's voices, or a curated list).
- Without a key, or if ElevenLabs is unavailable, the app falls back to the browser's built-in
  speech automatically.

### Text AI — OpenAI Responses API
- [`/api/reports/extract`](./api/reports/extract.ts): turns dictated or typed text into a
  structured draft (category, priority, headline, description, location, people, vehicles).
- [`/api/briefing`](./api/briefing.ts): writes a ~60-second spoken shift briefing from the
  recent incidents and BOLOs (officers and admins only). A deterministic template is used if
  the model is unavailable.
- [`/api/transcribe`](./api/transcribe.ts): dictation (`gpt-4o-mini-transcribe`).
- Every text feature walks a model chain (feature override → `OPENAI_TEXT_MODEL` →
  `gpt-5.6-luna` → `gpt-4.1-mini`) so a renamed model never takes a feature down.

### Imagery — Higgsfield
The skyline hero, Main Street photo and the spot illustrations were generated with
**Higgsfield** for this redesign. They are served from Higgsfield's CDN through **Vercel Image
Optimization** (`/_vercel/image`, configured in [`vercel.json`](./vercel.json) → `images`),
which resizes them and converts to AVIF/WebP. Every image has a gradient fallback.

---

## Architecture

```
Vite + React 19 + TypeScript + Tailwind v4 (SPA)
   │
   ├── Supabase         Postgres + Auth + Realtime + Storage, row-level security
   └── Vercel Functions /api/*  — OpenAI (GPT-Live, Responses, transcription),
                                  ElevenLabs, Resend, WebAuthn, email hook
```

- **Frontend:** React Router app with role-based workspaces (`/home`, `/ops`, `/report`,
  `/bolo`, `/insights`, `/admin`, `/account`), Leaflet maps (CARTO tiles), a small design
  system in [`src/components/ui`](./src/components/ui), and contexts for auth, incidents,
  BOLOs, voice, theme and toasts.
- **Backend:** stateless functions under [`/api`](./api). They hold every secret — the browser
  only sees the Supabase anon key.
- **Realtime:** new reports, status changes and timeline updates stream to every connected
  officer and reporter through Supabase Realtime.
- **Database:** [`0001_init.sql`](./supabase/migrations/0001_init.sql) (profiles, businesses,
  reports, invites, passkeys) and [`0002_incidents_bolos.sql`](./supabase/migrations/0002_incidents_bolos.sql)
  (incident fields — title, priority, subjects, vehicles, photos, assignment, visibility —
  the `report_updates` timeline, `bolos` with sightings, the private `report-media` photo
  bucket, and the RLS that goes with them), then [`0003_write_guards.sql`](./supabase/migrations/0003_write_guards.sql)
  (who may write what: the database stamps who filed a report, keeps the officer workflow
  officer-only, and lets members edit only their display name).

### Demo mode vs. connected mode
With no Supabase variables the app runs in **demo mode**: a realistic downtown dataset, a role
switcher (business / officer / admin), simulated incoming reports, and browser speech. Add
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` and real sign-in, persistence, Realtime and the
staff workspaces switch on.

The client also **detects the database schema**: until migration `0002` is applied it keeps
writing reports in the original format, so deploying the new UI before migrating is safe.

---

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Apply the migrations in order — `supabase db push` with the CLI linked, **or** paste
   [`0001_init.sql`](./supabase/migrations/0001_init.sql), then
   [`0002_incidents_bolos.sql`](./supabase/migrations/0002_incidents_bolos.sql), then
   [`0003_write_guards.sql`](./supabase/migrations/0003_write_guards.sql) into the SQL
   editor. `0002` and `0003` are idempotent and keep existing data.
3. Edit the seeded super-admin email at the bottom of `0001` (defaults to `sardoru@gmail.com`).
4. **Auth → URL Configuration:** add `https://<your-domain>/auth/callback` to the redirect list.

### 2. Branded magic-link emails (Resend + Send Email hook)
1. Get a [Resend](https://resend.com) API key and verify your sending domain.
2. Supabase **Auth → Hooks → Send Email Hook** → enable, point it at
   `https://<your-domain>/api/auth/email-hook`, and copy the secret (`v1,whsec_…`) into
   `SEND_EMAIL_HOOK_SECRET`.

### 3. OpenAI
Set `OPENAI_API_KEY`. Everything else has a default (see the table below).

### 4. ElevenLabs
Set `ELEVENLABS_API_KEY` (a key with text-to-speech access; `voices_read` lets users pick from
the account's own voices). `ELEVENLABS_MODEL` defaults to `eleven_v4`.

### 5. Environment variables
Copy [`.env.example`](./.env.example). `VITE_…` variables go into the client build; the rest
are **server-only** Vercel variables.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client | Supabase client (unset = demo mode) |
| `VITE_SITE_URL` | client | origin used in email links |
| `VITE_BROADCASTIFY_FEED_ID`, `VITE_BROADCASTIFY_STREAM_URL` | client | Memphis PD scanner (feed `215` streams inline) |
| `VITE_RADIO_WS_URL`, `VITE_RADIO_HTTP_URL` | client | optional radio-transcription bridge |
| `VITE_IMAGE_OPTIMIZER` | client | `off` loads brand images straight from the CDN |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | admin DB access, session minting, caller context |
| `SITE_URL` | server | WebAuthn + email links |
| `OPENAI_API_KEY` | server | GPT-Live, extraction, briefing, transcription |
| `OPENAI_LIVE_MODEL`, `OPENAI_LIVE_VOICE` | server | defaults `gpt-live-1`, `marin` |
| `OPENAI_LIVE_BACKEND_MODEL`, `OPENAI_LIVE_BACKEND_EFFORT` | server | interviewer backend, defaults `gpt-5.6-terra`, `low` |
| `OPENAI_TRANSCRIBE_MODEL` | server | default `gpt-4o-mini-transcribe` |
| `OPENAI_EXTRACT_MODEL`, `OPENAI_BRIEFING_MODEL`, `OPENAI_TEXT_MODEL` | server | optional text-model overrides |
| `ELEVENLABS_API_KEY` | server | Eleven v4 speech |
| `ELEVENLABS_MODEL`, `ELEVENLABS_FALLBACK_MODEL`, `ELEVENLABS_VOICE_ID` | server | defaults `eleven_v4`, `eleven_multilingual_v2`, George |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | branded emails |
| `SEND_EMAIL_HOOK_SECRET` | server | verifies the Supabase email hook |
| `RP_ID`, `RP_ORIGIN` | server | passkey relying party (defaults to the request host) |

---

## Local development

```bash
npm install
npm run dev          # Vite dev server — demo mode unless Supabase vars are set
npm run lint
npm run build        # tsc -b && vite build
npm run test:api     # runs the /api functions against mocked OpenAI, ElevenLabs and Supabase
npx tsc -p api/tsconfig.json --noEmit
```

The `/api` functions run on Vercel; use `vercel dev` to serve the SPA and functions together.

> **ESM gotcha (`/api`):** `package.json` has `"type": "module"`, so Vercel runs the functions
> as native ESM — **every relative import inside `/api` needs the `.js` extension**
> (`from './_lib/http.js'`). Without it the build passes but each function fails at runtime.

---

## Deploy (Vercel)

1. Import the repo (framework preset **Vite**).
2. Add the variables above for Production (and Preview if you want voice there too).
3. Deploy. [`vercel.json`](./vercel.json) configures the SPA rewrite, function limits,
   image optimization and caching headers.

---

## Project structure

```
api/
  _lib/              auth, Supabase admin, http, OpenAI + ElevenLabs clients, incident vocabulary
  live-session.ts    GPT-Live interviewer (personas, delegation backend, report tool)
  tts.ts             ElevenLabs Eleven v4 speech + voice list
  briefing.ts        AI shift briefing
  reports/extract.ts text → structured report draft
  transcribe.ts      dictation
  auth/ officers/ passkeys/   email hook, officer invites, WebAuthn
src/
  pages/             Landing, Login, BusinessHome, ReportCenter, OpsCenter, BoloBoard,
                     Insights, AdminPortal, AccountPage
  components/        ui/ (design system), layout/, report/, incidents/, map/, voice/,
                     bolo/, insights/, admin/, account/, brand/
  context/           Auth, Incidents, BOLOs, Voice, Profile, Theme, Toasts, Radio
  lib/               taxonomy, live (GPT-Live client), speech (ElevenLabs + fallback),
                     announce (spoken copy), schema detection, media, geo, format
  data/demo.ts       demo-mode dataset
scripts/api-harness.ts   mocked-upstream tests for the voice and AI endpoints
supabase/migrations/     schema + RLS
```

## Security and privacy
- Secrets live only in serverless functions; the browser uses the anon key under RLS.
- Roles can't be self-escalated (a Postgres trigger blocks non-admin role changes).
- Reports can be shared with the community or kept **officers-only**; internal notes are never
  shown to reporters; photos live in a private bucket served by short-lived signed URLs.
- The voice interviewer's caller context is read from the database and sanitised; the
  browser can only send an allow-listed set of events on the Live data channel.
- Text-to-speech, briefing and extraction endpoints require a signed-in user with the right
  role; speech is rate-limited per user.
- Magic links are single-use; passkey challenges are one-time and verified server-side.

## Changelog
See [CHANGELOG.md](./CHANGELOG.md).
