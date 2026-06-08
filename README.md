# DMC Safety Dashboard

Real-time safety monitoring for **Downtown Memphis Commission** businesses and DMC safety officers — a live incident map, police-scanner audio + transcription feed, business accounts, and a voice-first officer reporting portal.

**Live:** https://dmc-safety-dashboard.vercel.app

---

## What it does

| Audience | Capabilities |
| --- | --- |
| **Businesses** | Create an account, register their storefront, see a live downtown incident map + alert history, get proximity push notifications, and tap **Call for Help** to broadcast an incident. |
| **DMC Safety Officers** | An officer-only portal to file suspicious-activity reports by **GPT Realtime voice-to-voice** conversation **or** **tap-to-speak** transcription, drop a **map pin** on the exact location, and push it live to every connected business. |
| **Administrators** | Invite officers (branded email), manage officer roles, and see businesses, officers, pending invites, and 24h report volume. |
| **Everyone** | Live **City of Memphis Police** scanner (Broadcastify feed 215) audio + the existing radio transcription feed, light/dark, fully responsive. |

### Authentication
- **Passwordless magic links** (Supabase Auth) with **branded HTML emails** sent through **Resend** via a Supabase *Send Email* hook.
- **Passkeys** (WebAuthn / Apple Face ID · Touch ID) for instant re-login, including usernameless sign-in.
- Three roles: `business` (self sign-up), `officer` (admin-invited), `admin`.
- The dashboard (`/`) is **public** — anyone can view the map + scanner; only `/account`, `/officer`, `/admin` require sign-in. Live incident + business data stays RLS-gated to signed-in users.

---

## Architecture

```
Vite + React 19 + TS + Tailwind v4  (SPA, client)
        │
        ├── Supabase           → Postgres + Auth + Realtime + RLS
        └── Vercel Functions   → /api/* (OpenAI, Resend, WebAuthn, email hook)
```

- **Frontend:** single-page app (React Router). Leaflet map, role-based portals, theme + auth contexts.
- **Backend:** stateless serverless functions under [`/api`](./api) (Node). They hold all secrets — the browser only ever sees the Supabase anon key.
- **Database:** [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) — `profiles`, `businesses`, `reports`, `officer_invites`, `passkeys`, `webauthn_challenges`, with row-level security, a new-user trigger that auto-claims officer invites, and Realtime enabled on `reports`.

### 🟢 Demo mode vs. Connected mode
The app **degrades gracefully**. With no Supabase env vars set it runs exactly like the original prototype — localStorage profile, mock alerts, open dashboard, no login. The moment you add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`, real auth, accounts, persistence, Realtime, and the officer/admin portals activate.

---

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Run the migration: `supabase db push` (with the CLI linked) **or** paste [`supabase/migrations/0001_init.sql`](./supabase/migrations/0001_init.sql) into the SQL editor.
3. Edit the seeded super-admin email at the bottom of that file (defaults to `sardoru@gmail.com`) — that address becomes `admin` on first login.
4. **Auth → URL Configuration:** add `https://<your-domain>/auth/callback` to the redirect allow-list.

### 2. Branded magic-link emails (Resend + Send Email hook)
1. Get a [Resend](https://resend.com) API key and verify your sending domain.
2. Supabase **Auth → Hooks → Send Email Hook** → enable, point it at `https://<your-domain>/api/auth/email-hook`, and copy the generated secret (`v1,whsec_…`) into `SEND_EMAIL_HOOK_SECRET`.
   - The hook verifies the Standard-Webhooks signature, renders the navy/gold template in [`api/_lib/emails.ts`](./api/_lib/emails.ts), and sends via Resend. With the hook enabled, Supabase's built-in SMTP is bypassed entirely.

### 3. OpenAI (voice + transcription)
- `OPENAI_API_KEY` — used by `/api/realtime/session` (ephemeral token for the **gpt-realtime** WebRTC voice session), `/api/transcribe` (tap-to-speak), and `/api/reports/extract` (structuring transcripts).

### 4. Environment variables
Copy [`.env.example`](./.env.example). Client vars (`VITE_…`) go in the build; the rest are **server-only** Vercel env vars.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | client | Supabase client |
| `VITE_SITE_URL` | client | origin used in email links |
| `VITE_BROADCASTIFY_FEED_ID` / `VITE_BROADCASTIFY_STREAM_URL` | client | Memphis PD scanner (feed `215`; optional direct stream) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | server | admin DB + session minting |
| `SITE_URL` | server | WebAuthn + email links |
| `ADMIN_EMAILS` | server | _documented but not wired in code_ — `admin` comes from the `officer_invites` seed in `0001_init.sql` + the `handle_new_user` trigger |
| `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_TRANSCRIBE_MODEL` | server | voice + transcription |
| `RESEND_API_KEY`, `EMAIL_FROM` | server | branded emails |
| `SEND_EMAIL_HOOK_SECRET` | server | verify Supabase email hook |
| `RP_ID`, `RP_ORIGIN` | server | passkey relying-party (defaults to request host) |

### 5. Memphis PD scanner
- Default: a one-tap popup of the official **Broadcastify feed 215** player ("Memphis Police & Shelby County Sheriff").
- For seamless **inline** audio, set `VITE_BROADCASTIFY_STREAM_URL` to a Broadcastify Premium / relay direct stream (CORS is open on the stream).

---

## Local development

```bash
npm install
npm run dev          # Vite dev server (SPA only)
```

The `/api` functions run on Vercel. To exercise them locally use the Vercel CLI:

```bash
npm i -g vercel
vercel dev           # serves the SPA + /api functions together
```

`npm run build` runs `tsc -b && vite build`. Type-check the serverless functions separately with `npx tsc -p api/tsconfig.json --noEmit`.

> **⚠️ ESM gotcha (`/api`):** because `package.json` has `"type": "module"`, Vercel runs the compiled functions as **native ESM** — so **every relative import inside `/api` must include the `.js` extension** (`from './_lib/http.js'`, not `'./_lib/http'`). Without it the build still passes (`api/tsconfig.json` uses Bundler resolution) but every function throws `ERR_MODULE_NOT_FOUND` → `500` at runtime.

---

## Deploy (Vercel)

1. Import the repo into Vercel (framework preset: **Vite**).
2. Add every variable from the table above (client + server) for Production.
3. Deploy. [`vercel.json`](./vercel.json) wires the SPA fallback rewrite and the `/api` function runtime.

---

## Project structure

```
api/                         Vercel serverless functions
  _lib/                      auth, supabase admin, emails, webauthn, http helpers
  auth/email-hook.ts         Supabase Send-Email hook → Resend (branded)
  realtime/session.ts        OpenAI Realtime ephemeral token
  transcribe.ts              tap-to-speak → OpenAI transcription
  reports/extract.ts         transcript → structured report
  officers/invite.ts         admin invites an officer
  passkeys/                  WebAuthn register + auth (options/verify)
src/
  context/                   Auth, Profile, Alert (reports), Radio, Theme
  pages/                     LoginPage, AuthCallback, AccountPage, Officer/Admin portals
  components/                Dashboard UI, PoliceScanner, PasskeyManager, auth guards, officer/*
  hooks/useBusinesses.ts     businesses (DB when connected, mock in demo)
  lib/                       supabase, api, passkeys, realtime clients
supabase/migrations/         schema + RLS
```

## Security notes
- The service-role key lives only in serverless functions; the browser uses the anon key under RLS.
- Roles can't be self-escalated (a Postgres trigger blocks non-admin role changes).
- Magic links are single-use and expire in 60 minutes; passkey assertions are verified server-side and challenges are one-time.
- The email hook verifies the Standard-Webhooks signature before sending.

## Changelog
See [CHANGELOG.md](./CHANGELOG.md).
