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
| **Everyone signed in** | The **Lookout board** (active BOLOs with sightings), **Insights** for officers (trends, hot spots, response times), **Settings** (profile, storefront, voice + alert preferences, passkeys) and **Administration** for admins (**role-specific invitations** for businesses, officers and administrators — one at a time or a **pasted list, sent 5 every 15 minutes** — team, **access codes**, invite-only sign-up and **requests to join**, the public map switch, an **activity log**, passkeys per member, businesses, system status). |
| **The public** | A **live map at [`/live`](https://www.901safety.com/live)** of what's been reported downtown — the type, priority, status and an approximate spot of community reports, never details or people — and **[`/join`](https://www.901safety.com/join)**, where a business or officer joins with an access code (or asks to join while sign-up is invite-only). |

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
The skyline and the Main Street picture (the trolley under the Orpheum sign) are the owner's, in
`public/brand/` (keep the skyline's credit mark). The spot illustrations were generated with
**Higgsfield** for this redesign and are served from its CDN. All of them go through **Vercel
Image Optimization** (`/_vercel/image`, configured in [`vercel.json`](./vercel.json) →
`images`), which resizes them and converts to AVIF/WebP. Every image has a gradient fallback.

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
  `/bolo`, `/insights`, `/admin`, `/account`) and public pages (`/welcome`, `/login`, `/join`,
  `/live`, `/how-it-works`, `/how-to-report`, `/how-to-join`), Leaflet maps (CARTO tiles), a small design
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
  officer-only, and lets members edit only their display name), then
  [`0004_membership_and_public_map.sql`](./supabase/migrations/0004_membership_and_public_map.sql)
  (access codes and their seats, invite-only sign-up, requests to join, the audit log, app
  settings, and `public_incidents()` — the sanitized feed behind `/live`), then
  [`0005_display_links.sql`](./supabase/migrations/0005_display_links.sql) (the wall displays'
  private links: a hash of each key, server-only), then
  [`0006_invite_queue.sql`](./supabase/migrations/0006_invite_queue.sql) (Invite a list: the
  paced invitation queue, its settings row and `claim_queued_invites()`, server-only).

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
   [`0003_write_guards.sql`](./supabase/migrations/0003_write_guards.sql), then
   [`0004_membership_and_public_map.sql`](./supabase/migrations/0004_membership_and_public_map.sql), then
   [`0005_display_links.sql`](./supabase/migrations/0005_display_links.sql), then
   [`0006_invite_queue.sql`](./supabase/migrations/0006_invite_queue.sql)
   into the SQL editor. `0002`–`0006` are idempotent and keep existing data.
3. Edit the seeded super-admin email at the bottom of `0001` (defaults to `sardoru@gmail.com`).
4. **Auth → URL Configuration:** add `https://<your-domain>/auth/callback` to the redirect list.
5. **Auth → Hooks → Before User Created** → Postgres function
   `public.hook_before_user_created`. It lets everyone sign up while Admin → Access → *Who can
   join* is open, and only invited addresses (an invitation, an access code or an approved
   request) once it's invite-only. Without the hook, invite-only has no effect.

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
| `RESEND_API_KEY`, `EMAIL_FROM` | server | branded emails. `EMAIL_FROM` must be on a domain verified in Resend (production: `Core Downtown Memphis Safety <safety@901safety.com>`). |
| `EMAIL_REPLY_TO` | server | optional: where replies to any email go (the sending domain has no inbox, so without it a reply bounces). Leave it empty when the reply relay is on. |
| `RESEND_WEBHOOK_SECRET`, `INBOUND_FORWARD_TO` | server | the reply relay: the Resend webhook's signing secret, and the hidden inbox replies are forwarded to (comma-separated) |
| `SEND_EMAIL_HOOK_SECRET` | server | verifies the Supabase email hook |
| `CRON_SECRET` | server | Vercel Cron's bearer secret for `/api/cron/invites` (Invite a list). **Production only.** Unset = the endpoint answers 503 and no queued invitation goes out. |
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

`vercel.json` also schedules one cron job — `/api/cron/invites` every 15 minutes, for
[Inviting a list](#inviting-a-list-paced). Vercel runs crons on the production deployment only, and
it needs `CRON_SECRET` set there.

---

## Replies to emails (the hidden relay)

Every email comes from `EMAIL_FROM` (`safety@901safety.com`). Replies are relayed so the team's
own inbox never shows:

1. Someone answers an invitation or a sign-in email → Resend receives it for 901safety.com and
   calls [`/api/inbound-email`](./api/inbound-email.ts) (`email.received`, signature checked).
2. It is forwarded to `INBOUND_FORWARD_TO`, from `EMAIL_FROM`, with the sender's details on top and
   a reply-to of `reply+<message id>@901safety.com`.
3. The team just hits Reply. The answer arrives at that reply+ address and goes back to the
   original sender from `EMAIL_FROM`, threaded under their message. Any copy of the team's
   address in the quoted text is replaced first.

Only an `INBOUND_FORWARD_TO` sender can answer through a reply+ address, and only to the person
who wrote that message. Mail from 901safety.com itself and automatic replies are dropped, so
nothing loops. A failed send answers 502 and Resend retries.

**Setup:** in Resend, turn on receiving for 901safety.com and add the MX record it shows to the
domain's DNS (GoDaddy). Add a webhook for `email.received` → `https://www.901safety.com/api/inbound-email`
and put its signing secret in `RESEND_WEBHOOK_SECRET`. Set `INBOUND_FORWARD_TO`, leave
`EMAIL_REPLY_TO` empty, and redeploy. The Resend API key must have full access, because the relay
reads received mail.

## Wall display (`/tv`)

A full-screen page for a TV on an office wall: the live map and the latest reports, the counts
(new · open · P1–P2 open · last 24 h · lookouts) and a clock. It refreshes every 15 seconds, keeps
the screen awake where the browser allows it, hides the cursor and scales from a 1080p TV to 4K.

- **Get a link:** Admin → Access → *Wall displays* → *New link* → name it ("Office wall") → *Copy
  link*. The link is `https://www.901safety.com/tv#key=…`; open it in the TV's browser and press
  *Full screen*. The key rides after `#`, so it never reaches server logs or `Referer` headers. It
  is shown once — only its SHA-256 hash is stored (`display_links`, server-only).
- **What it shows:** open reports of any age plus everything from the last 24 hours — priority,
  category, headline, a short place, status, time, and the happening-now / weapon / hurt flags.
  Never who reported, contact details, descriptions, people, photos, transcripts or notes
  (`api/_lib/displays.ts`, enforced by `npm run test:api`).
- **Revoke:** the same card. The screen shows "This display link no longer works" at its next
  refresh. Admins see when each display was last on screen.
- **Demo mode:** `/tv` shows the sample data without a link.

## Films

Three films, each with chapters, a clickable transcript and `?t=` deep links (each chapter's
QR code in the film opens one):

- **https://www.901safety.com/how-it-works** — the 5:53 tour of the dashboard and the Ops Center
  (dark).
- **https://www.901safety.com/how-to-report** — the 3:08 how-to (light): report an incident by
  voice, with the guided form or with a quick alert, review and send, follow its status, and how
  officers respond. Its voice chapter is a real call on the voice line; the transcript labels the
  call's own lines ("Interviewer:", "Caller:"). Linked from the landing page, the report page and
  the first film.
- **https://www.901safety.com/how-to-join** — the 3:08 how-to (light) for Downtown businesses and
  local stakeholders: who can join, register with only an email, join with an access code, set up
  the storefront and a passkey, take part every day (nearby alerts, your block, spoken alerts), the
  Lookout board, and the public live map. Linked from the landing page, the sign-in page and
  `/join`.

All three show the demo's sample report DT-0119, "Man trying car door handles on S Main St", from
Ortega's Corner Market, 254 S Main St (`src/data/demo.ts`).

How they're wired:

- Each page is its own Vite entry — [`how-it-works.html`](./how-it-works.html),
  [`how-to-report.html`](./how-to-report.html) and [`how-to-join.html`](./how-to-join.html) →
  `src/film/main.tsx` / `reportMain.tsx` / `joinMain.tsx`, sharing `FilmPage.tsx` — so link
  previews get real video tags without running the app, and each page bundles only its own
  transcript.
- Each film is made in its own HyperFrames project (`~/videos/dmc-safety-how-it-works`,
  `~/videos/dmc-safety-how-to-report`, `~/videos/dmc-safety-how-to-join`). To bring a new cut in:
  `node scripts/film-data.mjs <project>/renders [YYYY-MM-DD] [--film how-it-works|how-to-report|how-to-join]`
  — it copies the web MP4, poster and captions into `public/video/` (or
  `public/video/how-to-report/`, `public/video/how-to-join/`), regenerates the film's data module
  (`src/film/filmData.ts`, `reportFilmData.ts` or `joinFilmData.ts`) and its length in
  `filmMeta.ts`, fills the page's VideoObject, and refuses wording the product doesn't use ("AI",
  vendor names). A film's links on the site appear only once its length is set.
- The share cards come from `node scripts/og-images.mjs` (`--only how-to-report` or
  `--only how-to-join` for just that one).

## Invitation emails

Every way in sends one invitation, written for the role — built by
[`api/_lib/invitations.ts`](./api/_lib/invitations.ts): an administrator's invite (Admin → Team →
**Invite someone**: a member business, a Public Safety officer or an administrator), an access code
(`/join`), an approved request to join, and invitations Supabase sends itself (the Send Email hook
looks up the invited role).

- **What's in it:** what they're joining (a self-regulated safety dashboard for the core of
  Downtown Memphis), who invited them and as what, what that role can do (in the app's own
  labels), numbered first steps, 911-first and privacy notes, how sign-in works (a one-time link
  now; `/login` or a passkey later) and the three films, ordered for the role, with chapter links
  (`?t=<seconds>`) to the parts that matter to it.
- **New or existing account:** a new address gets **Accept your invitation** (or **Finish joining**
  for codes and approved requests); an existing account gets **Sign in to the dashboard** — "You're
  now a Public Safety officer" when its role went up, the guide for the role it keeps when it
  didn't; an account that has never signed in gets the invitation again. An invitation never
  lowers a role — an account's or an open invitation's.
- **Films:** one list in [`api/_lib/films.ts`](./api/_lib/films.ts) — titles, lengths, chapter
  starts, posters. The harness checks all three against the film pages' generated data, so a
  re-cut that moves a chapter fails the tests until this list follows.
- **Craft:** tables + inline styles for Gmail, Outlook and Apple Mail, phone and dark-mode
  refinements, readable with images off, a plain-text part, ~35 KB.
- **Wording:** `npm run test:api` renders every role × way in × account and fails on AI or vendor
  wording, or an interviewer described as a person.
- **Preview:** `npx tsx scripts/email-previews.ts [dir]` writes every variant as HTML + text
  (default `/tmp/dmc-invite-emails/html`, with an `index.html`) — nothing is sent.

## Inviting a list (paced)

Admin → Team → **Invite a list** invites a whole list — say, the ~90 businesses on a safety
meeting's sign-in sheet — a few at a time: **5 every 15 minutes**. The emails trickle out (better
for deliverability than 90 at once), and the team can watch, pause, or cancel the rest.

> **Before first use:** (1) apply [`0006_invite_queue.sql`](./supabase/migrations/0006_invite_queue.sql)
> to the production database, (2) set **`CRON_SECRET`** in Vercel → Production (for example
> `openssl rand -hex 32`), (3) deploy (`vercel --prod`). Vercel registers the cron from `vercel.json`
> on that deploy (Project → Settings → Cron Jobs). Without the migration the card says so and nothing
> is queued; without `CRON_SECRET` the cron answers 503 and nothing goes out.

- **Paste:** one address per line. `dana@business.com`, `Dana Whitfield <dana@business.com>`,
  `"Whitfield, Dana" <dana@business.com>`, spreadsheet columns and stray commas or semicolons all
  work. Addresses are trimmed, lower-cased and de-duplicated; lines that aren't an address are
  listed with their line number. Up to 500 addresses at a time. Pick the role (**Member business**
  by default, with the same hints as Invite someone) and an optional label ("Safety Meeting · Mar
  11"). Addresses already waiting in the queue are skipped.
- **Confirm:** "92 invitations will go out 5 every 15 minutes, starting about 2:45 PM. You can pause
  any time." — with when the last should go out and how many are already waiting ahead of them.
- **Sending:** the cron (`/api/cron/invites`) claims the oldest few and invites each exactly as
  Invite someone does (`api/_lib/invite.ts`, shared by both): the email written for the role, from
  the administrator who queued it (their name in the email), never lowering anyone, an audit entry
  (`invite.sent` with `via: "queue"`). About 600 ms apart, so the email service sees at most ~2 a
  second. People who already use the dashboard (they've signed in) are **skipped** — "Already a
  member" — so the list can't change an active member's role (use Invite someone for that). Someone
  invited before who never signed in gets the invitation again. If whoever queued a row is no
  longer an administrator, it isn't sent.
- **Watching:** counts (queued · sent · skipped · failed · cancelled), "Next 5 at HH:MM", the next
  batch (each can be cancelled), and recent results with a status and a readable outcome. The card
  reloads about 30 seconds after each run while invitations are waiting.
- **Pause / Resume / Cancel the rest:** Pause stops the next run (a batch already being sent
  finishes). Cancel the rest cancels every invitation still waiting; ones already sent stay sent.
- **When something goes wrong:** one failure never stops the others — the row is marked failed with
  why ("Couldn't send: …"). A rate limit puts the row back for the next run (failed after 3 tries).
  A row stuck in "sending" for 30 minutes (its run died) goes back in the queue, and is failed after
  3 tries. A run starts no new send after 20 seconds, well inside Vercel's 30-second limit. Failed
  and cancelled addresses can be pasted again.
- **The pace** lives in the one-row `invite_queue_settings` table: `per_run` (1–10, default 5) and
  `paused`. To send 10 per run: `update public.invite_queue_settings set per_run = 10;`
- **API** (`/api/admin/invite-queue`, administrators only, every change audited): `add`, `list`,
  `pause`, `resume`, `cancel` (one `id`, a `label`, or `all: true`). The queue tables have RLS on with
  no policies: only the server reads or writes them, and only the service role may run
  `claim_queued_invites()` — which hands each row to exactly one run (`FOR UPDATE SKIP LOCKED`).
- **Demo mode:** the card shows a sample 92-address list mid-way through, and every action is
  simulated.

---

## Project structure

```
api/
  _lib/              auth, Supabase admin, http, OpenAI + ElevenLabs clients, incident vocabulary,
                     invitation emails (invitations.ts), the film list (films.ts), one invitation
                     (invite.ts) and the paced queue (inviteQueue.ts, emailList.ts)
  voice-session.ts   voice line: ElevenLabs agent token + caller context (GPT-Live fallback)
  live-session.ts    GPT-Live interviewer — the fallback line
  tts.ts             ElevenLabs Eleven v4 speech + voice list
  briefing.ts        AI shift briefing
  reports/extract.ts text → structured report draft
  transcribe.ts      dictation
  auth/ officers/ passkeys/   email hook, invitations (any role), WebAuthn
  join.ts            public: redeem an access code, ask to join
  admin/members.ts   admin: approve requests, a member's passkeys, setup links
  admin/invite-queue.ts  admin: Invite a list — add, list, pause, resume, cancel
  cron/invites.ts    Vercel Cron, every 15 minutes: sends the next few queued invitations
src/
  pages/             Landing, Login, Join, LiveMap, BusinessHome, ReportCenter, OpsCenter,
                     BoloBoard, Insights, AdminPortal, AccountPage
  components/        ui/ (design system), layout/, report/, incidents/, map/, voice/,
                     bolo/, insights/, admin/, account/, brand/
  context/           Auth, Incidents, BOLOs, Voice, Profile, Theme, Toasts, Radio
  lib/               taxonomy, live (GPT-Live client), speech (ElevenLabs + fallback),
                     announce (spoken copy), schema detection, media, geo, format
  data/demo.ts       demo-mode dataset
scripts/api-harness.ts   mocked-upstream tests for the voice, AI and membership endpoints, every invitation email,
                         and Invite a list with its cron
scripts/email-previews.ts  every invitation email as HTML + text, to look at without sending
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
- Access codes are meant to be shared, so redeeming one never signs anyone in — it claims a
  seat and emails a link to the address, which proves it. A leaked code can only burn seats
  (revoke it); it can't raise anyone's role beyond the code's, or lower one.
- Only administrators send invitations, and an invitation never lowers a role: an existing
  account — or an open invitation — is raised to the invited role or keeps its own (removing
  officer access is a separate, confirmed action in Team). A failed lookup or write stops before
  any email is sent.
- Invite a list queues invitations server-side only (no browser access to the queue). The cron
  that sends them needs Vercel's `CRON_SECRET` (compared in constant time) and fails closed — 503 —
  without it; each row is sent only while whoever queued it is still an administrator, and people
  who already use the dashboard are skipped.
- The public map (`/live`) reads only `public_incidents()`: community reports, type, priority,
  status and a position rounded to about 100 m — no text, people, vehicles, photos, reporter or
  address. Officers-only and dismissed reports never appear; admins can pause it or delay it.
- Administrative changes are written to an append-only audit log only admins can read.

## Changelog
See [CHANGELOG.md](./CHANGELOG.md).
