# Core Downtown Memphis Safety Dashboard

A **self-regulated safety dashboard** for **Downtown Memphis**. Local businesses report suspicious people,
suspicious activity and crimes they see — by a **short voice interview**, filling a
two-minute guided form, or sending a one-tap alert — and every report lands instantly on the
**Operations Center** that Downtown public-safety officers monitor. Officers triage, respond,
publish be-on-the-lookout notices, and **hear new reports read aloud**.

**Live:** https://www.901safety.com

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

### Two-way reporting — an ElevenLabs agent with the **Eleven v4** voice
- The interviewer is an **ElevenLabs agent** (ElevenAgents) speaking with **Eleven v4**.
  ElevenLabs runs speech recognition (Downtown street names boosted), turn-taking,
  interruptions and the voice; the agent's brain is `gpt-5.6-terra`. Its definition lives in
  [`api/_lib/voiceAgent.ts`](./api/_lib/voiceAgent.ts) — `npx tsx scripts/voice-agent.ts`
  creates or updates it (safe to re-run) and prints the id for `ELEVENLABS_AGENT_ID`.
- The browser asks [`/api/voice-session`](./api/voice-session.ts) for a one-time WebRTC
  conversation token (signed-in members only, 6 call starts per 10 minutes; the ElevenLabs key
  never leaves the server) and for who is calling, read from the database — never the
  request — then joins the agent with `@elevenlabs/client` (loaded only when a call starts).
- **Personas**: businesses get a warm interviewer that knows their storefront and works through
  *what, where, when, who, vehicles, contact* one question at a time; officers get a terse
  intake assistant. Spanish callers are answered in Spanish. The caller can interrupt any time.
- The agent fills the draft through its `file_incident_report` **client tool**, which runs in
  the browser: category, priority, headline, description, location, time, flags, and
  structured **subjects** and **vehicles**. It says "filing that now" first, reads back a
  one-sentence confirmation, files again when the caller adds a detail, and hangs up after
  goodbye. Callers hear the voice they picked for spoken alerts (George by default).
- Private by design: a token from our server is required, no audio is recorded, and transcripts
  are deleted after 30 days. Measured on a real call: the voice starts ≈2.1–2.6 s after the
  caller stops talking (≈1.8–2.2 s with `eleven_v4_turbo`).
- **Fallback:** without `ELEVENLABS_AGENT_ID`, the OpenAI **GPT-Live** line
  ([`/api/live-session`](./api/live-session.ts), `gpt-live-1`) takes the call.
- **Fairness built in**: no race field anywhere; the interviewer asks what the person *did* and
  for clothing and identifying details rather than appearance; it never promises a response
  time. Anyone in danger is told to call 9-1-1.

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
Set `OPENAI_API_KEY` (extraction, the shift briefing, transcription and the GPT-Live fallback).
Everything else has a default (see the table below).

### 4. ElevenLabs
Set `ELEVENLABS_API_KEY` (text-to-speech and Agents access; `voices_read` lets users pick from
the account's own voices). `ELEVENLABS_MODEL` defaults to `eleven_v4`.

For voice interviews, create the agent once — `ELEVENLABS_API_KEY=… npx tsx scripts/voice-agent.ts`
— and set the printed `ELEVENLABS_AGENT_ID`. Re-run it after changing `api/_lib/voiceAgent.ts`.

### 5. Environment variables
Copy [`.env.example`](./.env.example). `VITE_…` variables go into the client build; the rest
are **server-only** Vercel variables.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client | Supabase client (unset = demo mode) |
| `VITE_SITE_URL` | client | origin used in email links (production: `https://www.901safety.com`) |
| `VITE_BROADCASTIFY_FEED_ID`, `VITE_BROADCASTIFY_STREAM_URL` | client | Memphis PD scanner (feed `215` streams inline) |
| `VITE_CARTO_KEY` | client | CARTO basemap key (free: carto.com/basemaps/apikey). Unset = OpenStreetMap tiles; CARTO without a key shows an "API KEY REQUIRED" watermark. Baked in at build — redeploy after setting it. |
| `VITE_RADIO_WS_URL`, `VITE_RADIO_HTTP_URL` | client | optional radio-transcription bridge |
| `VITE_IMAGE_OPTIMIZER` | client | `off` loads brand images straight from the CDN |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | admin DB access, session minting, caller context |
| `SITE_URL` | server | WebAuthn + email links |
| `OPENAI_API_KEY` | server | extraction, briefing, transcription, GPT-Live fallback |
| `OPENAI_LIVE_MODEL`, `OPENAI_LIVE_VOICE` | server | defaults `gpt-live-1`, `marin` |
| `OPENAI_LIVE_BACKEND_MODEL`, `OPENAI_LIVE_BACKEND_EFFORT` | server | interviewer backend, defaults `gpt-5.6-terra`, `low` |
| `OPENAI_TRANSCRIBE_MODEL` | server | default `gpt-4o-mini-transcribe` |
| `OPENAI_EXTRACT_MODEL`, `OPENAI_BRIEFING_MODEL`, `OPENAI_TEXT_MODEL` | server | optional text-model overrides |
| `ELEVENLABS_API_KEY` | server | Eleven v4 speech and the voice interviewer |
| `ELEVENLABS_AGENT_ID` | server | the voice interviewer agent (from `scripts/voice-agent.ts`); unset = GPT-Live fallback |
| `ELEVENLABS_AGENT_TTS_MODEL`, `ELEVENLABS_AGENT_LLM` | script | agent voice model and brain: defaults `eleven_v4`, `gpt-5.6-terra` |
| `ELEVENLABS_MODEL`, `ELEVENLABS_FALLBACK_MODEL`, `ELEVENLABS_VOICE_ID` | server | defaults `eleven_v4`, `eleven_multilingual_v2`, George |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | branded emails |
| `SEND_EMAIL_HOOK_SECRET` | server | verifies the Supabase email hook |
| `RP_ID`, `RP_ORIGIN` | server | passkey relying party. Production: `RP_ID=901safety.com` (works on the bare domain and `www`) and `RP_ORIGIN=https://www.901safety.com,https://901safety.com` (comma-separated). Unset = the request host. Passkeys are bound to the domain — changing it means users add a new passkey once. |

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

> This project deploys with the CLI (`vercel --prod`) — merging to `main` does not deploy.

---

## "How it works" film

**https://www.901safety.com/how-it-works** — a 5:53 walkthrough with chapters, a
clickable transcript and `?t=` deep links (each chapter's QR code in the film opens one).

- The page is its own Vite entry, [`how-it-works.html`](./how-it-works.html) + `src/film/`, so
  link previews get real video tags without running the app.
- The film is made in its own project (`~/videos/dmc-safety-how-it-works`, HyperFrames). To bring
  a new cut in: `node scripts/film-data.mjs ~/videos/dmc-safety-how-it-works/renders` — it copies
  the web MP4, poster, share image and captions into `public/video/`, regenerates
  `src/film/filmData.ts` / `filmMeta.ts` and the page's VideoObject, and refuses wording the
  product doesn't use ("AI", vendor names).

---

## Project structure

```
api/
  _lib/              auth, Supabase admin, http, OpenAI + ElevenLabs clients, incident vocabulary
  voice-session.ts   voice line: ElevenLabs agent token + caller context (GPT-Live fallback)
  live-session.ts    GPT-Live interviewer — the fallback line
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
scripts/voice-agent.ts   create/update the ElevenLabs interviewer agent
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
