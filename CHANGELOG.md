# Changelog

All notable changes to the Core Downtown Memphis Safety Dashboard. Format follows
[Keep a Changelog](https://keepachangelog.com/); newest first.

## [0.4.10] — 2026-10-10 — The Safety Dashboard in 30 seconds

> No migration. Deploy as usual (`vercel --prod` from `main`).

### Added
- **A 30-second film: [/in-30-seconds](https://www.901safety.com/in-30-seconds).** The three films
  in one fast cut:
  - report what you see, by voice, with the guided form or with a quick alert;
  - officers respond, and you get updates;
  - nearby alerts and the Lookout board;
  - the public live map;
  - registering with only a work email, then "Scan the code to join".

  It is in light mode, with the same narrator and the same rules as the other films: "a
  self-regulated safety dashboard", no AI wording, and the S Main St sample report. It was made in
  `~/videos/dmc-safety-in-30-seconds`.
- **In the landing page hero, on the right.** The film fills the hero's empty right half, so it is
  the first thing a visitor sees (`src/film/HeroFilm.tsx`).
  - On a wide screen it starts at once, muted and on a loop, with the captions on. It does not
    start by itself with reduced motion or a data saver set.
  - "Watch with sound" plays it from the start, with sound and the browser's controls.
  - A pause button stops the loop, and the loop pauses while the hero is off screen.
  - On a phone it sits below the hero text, behind its poster with a play button.
  - The poster goes through the image service; the captions use the site's type.
  - Beside the film, the headline steps down (42 px at `lg`, 50 px at `xl`), so "Downtown
    Memphis," keeps one line.
  - The footer has "In 30 seconds · 0:30".
- **Its own page** (`in-30-seconds.html`), with chapters, a transcript, captions, VideoObject
  JSON-LD and a share card (`public/video/in-30-seconds/og-image.png`).
- **Script support for the fourth film:** `scripts/film-data.mjs --film in-30-seconds` and
  `scripts/og-images.mjs` now handle it.

## [0.4.9] — 2026-10-09 — Paced invitations: brakes and no repeats

> **Before deploying:** apply `supabase/migrations/0008_invite_queue_brakes.sql` (it only adds
> columns; the previous app keeps working). Check that `CRON_SECRET` in Vercel → Production has at
> least 16 characters — a shorter one now stops the cron (503).

### Fixed
- **Pause and Cancel stop what hasn't started — mid-run too.** A run now claims one row at a time
  (`claim_queued_invites(1)`, up to the per-run count) and re-reads the pause switch before each
  claim. Right before an email goes out it re-checks, in one statement, that the row is still being
  sent and not cancelled, and stamps the new `emailing_at`. Cancel also takes rows a run has claimed
  whose email hasn't started; a pause puts such a row back in the queue. A rate limit on a row that
  was cancelled meanwhile leaves it cancelled. Only an email already on its way finishes — the card
  now says exactly that.
- **Re-pasting never re-invites.** `add` skips anyone already invited — a list invitation that went
  out, an open invitation, or an existing account — and reports them ("already invited") in the
  result and the card. **Invite again people who were already invited** (`reinvite: true`) sends a
  second invitation on purpose.
- **No double send after a stuck run.** Recovery puts a stuck row back in the queue only if its
  email never started; one stuck after `emailing_at` is marked failed — "May have gone out — check
  before inviting again" — and never sent again. Each queued email carries the row id as Resend's
  idempotency key (Invite someone's emails are unchanged). No answer at all from the email service
  counts as "may have gone out".
- **One run per quarter hour.** A check-and-set on `invite_queue_settings.last_slot` makes a
  duplicate delivery of the cron do nothing, so it can't double the pace.
- **The confirm step's "starting about HH:MM" is never in the past**, and it's fresh: the card
  checks the list with the server (`dryRun`) when you review it, so the counts are exact.
- A rate limit now ends the run (the row waits for the next one) instead of being retried at once.

### Changed
- **Lists are for member businesses only.** The role picker is gone; the server refuses officer and
  administrator lists — invite those one at a time with Invite someone. A non-business row queued
  earlier is cancelled, not sent.
- **The email limit pauses the queue.** When the email service reports its daily or monthly sending
  limit, the queue pauses itself (`pause_reason`, `queue.paused` by System in Activity), the row
  goes back unsent, and the card says "Paused: the daily email limit was reached". Resume clears it.
- **Last run.** Each run records `last_run_at` and what it did; the card shows "Last run HH:MM" and
  warns when invitations are waiting but nothing has run for over 20 minutes.
- `CRON_SECRET` must be at least 16 characters (shorter: logged, 503).

### Verified
- API harness 307/307 (279 before; the queue's checks updated for one-row claims and business-only
  lists, plus new ones for each fix: pause and cancel mid-run, the check right before the email, a
  rate limit on a cancelled row, the daily and monthly limit, re-pasting and Invite again, the dry
  run, stuck rows after `emailing_at`, no answer from the email service, duplicate deliveries,
  the idempotency key, the last run, a short `CRON_SECRET`, and a start time never in the past).
- `supabase/tests/0008_invite_queue_brakes.test.sql`: 15 checks on plain Postgres — the slot
  check-and-set, the one-row claim, the stamp right before the email, cancel of claimed rows,
  recovery, grants, and 0006 + 0008 applied again.
- The API and the cron also ran end to end against PostgREST 16 on Postgres 17 with 0001–0008.

## [0.4.8] — 2026-10-09 — Private report fields stay private

### Security
- **Other members' private report fields no longer reach a business's browser.** Every signed-in
  member could read every community report in full — the reporter's contact phone, the voice
  interview transcript, the reporter's account id, photo paths and internal fields — over the REST
  API and Realtime. The app showed only a summary, but the rest was in the payload. Now
  `reports` is readable only by the reporter (their own reports, every field) and by officers and
  admins (every report).
- **Member businesses read other members' reports from `community_reports`** (migration
  `0007_community_report_privacy.sql`): a copy of each community report with only what the
  business screens show — headline, category, priority, status, address and exact spot, when it
  was reported and happened, the happening-now / weapon / injuries flags, the description, the
  people and vehicles to look out for (description fields only), the storefront that filed it
  (never a person's name), the officer working it, and how many photos it has and how many
  businesses marked it as seen. Never the reporter's account, contact phone or email, transcript,
  photos, internal notes, assignment id, summary, lookout link or who marked it as seen.
- **A member reads only their own storefront.** The business directory — contact names, phones,
  emails — is for officers and admins (the Ops Center map, Admin). Members' screens never used it.
- Still visible to a reporter on their own reports: `acknowledged_by`, the account ids of members
  who marked them as seen. Members can no longer look those ids up (profiles and storefronts are
  their own only).

### Added
- `community_reports`, kept in step by triggers on `reports`: new community reports, every
  change members can see, a report shared or un-shared with the community (copy added or
  removed), and deletes. A copy is rewritten only when something members see changed, so edits
  to private fields send nothing. Backfilled; signed-in members may only read it; in the Realtime
  publication.
- `my_seen_report_ids()`: which community alerts the caller marked as seen ("Marked as seen" and
  "N nearby businesses have seen this" work as before).
- Admin → System: a **Private report fields** check and a "Run migration 0007" notice until it's
  applied.
- `supabase/tests/0007_community_report_privacy.test.sql`: 45 checks on plain Postgres (who reads
  what, the triggers, a re-run of 0007).

### Changed
- Member businesses' dashboards load their own reports from `reports` and everyone else's from
  `community_reports`, both live through Realtime on one channel, subscribed before the first read
  (a member's own new report is never announced to them as a nearby alert). A report shared with
  the community later joins the list quietly, as before — it doesn't ring as a new alert. Nearby
  alerts, Your block, spoken nearby alerts, the home page and the Lookout board work as before.
  Officers and admins are unchanged; demo mode is unchanged.
- Nearby cards and the report sheet take the photo and "seen" counts from the copy; the sheet
  says "Photos are only visible to officers and the reporter", as before.
- A member without a storefront shows as "Downtown business" on other members' screens (it
  showed their display name or the start of their email).

### Deploy
- **Order: deploy the app first, then run `supabase/migrations/0007_community_report_privacy.sql`
  in the Supabase SQL editor.** The new app works on either side of the migration: until 0007
  runs, members read `reports` as before; open dashboards look for 0007 every two minutes (and
  when the tab comes back) and switch over by themselves. Running 0007 before the deploy would
  leave the old app showing members no nearby alerts until the deploy.
- Before running it, reload member dashboards that stay open all day (a front-desk screen or
  tablet): a screen still on the previous version keeps its list but gets no new alerts from other
  members until it reloads. The `/tv` wall display isn't affected. Safe to run more than once.

### Verified
- SQL test 45/45 on PostgreSQL 17 with a Supabase stand-in, and three deliberately broken
  versions of 0007 each caught.
- API harness 279/279 (21 new: the dashboard reads exactly the columns 0007 creates and none is
  private; the copy mapping; the member list rules — your own report never announced to you, a
  report shared later never rings as new, rows left from before the switch-over replaced;
  `/api/display` never selects private columns).
- The real app against the scratch database through PostgREST: a member's browser received no
  one else's phone, transcript, photo path, summary, account id or email in any response; nearby
  alerts, the sheet and "Mark as seen" worked; an officer still received everything. With the app
  deployed before 0007, an open member dashboard switched over by itself when 0007 was applied.
  Demo mode unchanged.

## [0.4.7] — 2026-10-09 — Paced invitations

> **Before first use:** apply `supabase/migrations/0006_invite_queue.sql`, set `CRON_SECRET` in
> Vercel → Production, then deploy (`vercel --prod`).

### Added
- **Admin → Team → Invite a list.** Paste the addresses from a meeting list — one per line; `Name
  <email>`, `"Last, First" <email>`, spreadsheet columns and stray commas or semicolons all work —
  pick the role (Member business by default, with the same hints as Invite someone; a warning for
  officer and administrator lists) and an optional label ("Safety Meeting · Mar 11"). The paste is
  counted as you type, repeats are left out and lines that aren't addresses are listed with their
  line numbers. A confirm step says "N invitations will go out 5 every 15 minutes, starting about
  HH:MM. You can pause any time.", when the last should go out, and how many are already waiting.
- **The queue, on the same card:** counts (queued · sent · skipped · failed · cancelled), "Next 5 at
  HH:MM", the next batch (each one can be cancelled), recent results with status chips and readable
  outcomes, **Pause / Resume** and **Cancel the rest** (with a confirm). It reloads about 30 seconds
  after each run while invitations are waiting. Light and dark, phone widths, and sample data in
  demo mode.
- **`/api/cron/invites`**, a Vercel Cron every 15 minutes (`vercel.json`). It answers only to
  `Authorization: Bearer $CRON_SECRET` (401 otherwise) and fails closed (503) while the secret is
  unset. Paused: nothing happens. Otherwise it puts rows stuck in "sending" for 30 minutes back in
  the queue (failed after 3 tries), claims up to the per-run count (5) and invites each one about
  600 ms apart — the same invitation Invite someone sends, from the administrator who queued it,
  with their name in the email. People who have already signed in are skipped ("Already a
  member"); someone invited before who never signed in gets the invitation again. Each row ends
  sent, skipped, failed or cancelled with a readable outcome, and one failure never stops the
  others. A rate limit puts the row back for the next run; a run starts no new send after 20 s.
- **`/api/admin/invite-queue`** (administrators only; every change audited): `add` (counts added,
  duplicates, invalid and skipped — addresses already waiting are skipped, also when two
  administrators queue the same address at once), `list`, `pause`, `resume`, and `cancel` (one
  invitation, a label's, or all still waiting).
- **Migration `0006_invite_queue.sql`** (additive, idempotent): `invite_queue` (one live row per
  address while queued or sending), the one-row `invite_queue_settings` (`paused`, `per_run` 1–10,
  default 5), and `claim_queued_invites(n)`, which hands each row to exactly one run (`FOR UPDATE
  SKIP LOCKED`) and only the service role may call. RLS on, no policies, no browser access.
- Activity shows the queue's entries — queued invitations, paused / resumed, cancelled — and marks
  invitations sent from a list.

### Changed
- One invitation, one code path: `api/_lib/invite.ts` does for one address what
  `/api/officers/invite` did (never-lower, the open-invite rows, the role-specific email, the audit
  entry); the endpoint and the list both use it. Invite someone answers and audits exactly as before.

### Verified
- API harness 258/258 (63 new): administrator-only access; parsing, de-duplication and invalid
  lines; skipping addresses already queued; cron auth (none or wrong → 401, unset secret → 503);
  paused runs send nothing; exactly the per-run count claimed, oldest first, ~600 ms apart; two
  runs at once never send a row twice; one failure doesn't stop the others; rate limits and stuck
  rows; the already-a-member skip; a queuer who's no longer an administrator; the time budget;
  cancel; audit entries; the inviter's name in the email; a queued invitation is byte-for-byte the
  email Invite someone sends, and Invite someone's answer and audit entry are unchanged.
- Migration 0006 applied twice to Postgres 17 after 0001–0005: claims are atomic and disjoint under
  two concurrent sessions, and anon / authenticated can't read the tables or run the claim. The API
  and the cron also ran end to end against PostgREST on that database.

## [0.4.6] — 2026-10-09 — Email from 901safety.com, replies relayed

### Added
- **Every email now comes from `safety@901safety.com`** (the domain is verified in Resend).
- **A hidden reply relay** (`/api/inbound-email`): a reply to any email reaches the team's inbox
  (`INBOUND_FORWARD_TO`), and the team's answer goes back from `safety@901safety.com` — their own
  address never shows, even in quoted text. Signed webhooks only; loops and automatic replies are
  dropped; failed sends are retried by Resend. 15 harness checks (195 total).
- `EMAIL_REPLY_TO` (optional, from #12) for a plain reply-to when the relay is off.

## [0.4.5] — 2026-10-09 — Role-specific invitation emails

### Added
- **Invitation emails written for the role.** Member businesses, Public Safety officers and
  administrators each get their own email: what they're joining (a self-regulated safety
  dashboard for the core of Downtown Memphis — businesses report what they see, public-safety
  officers respond, the block stays in the loop), who invited them and as what, what that role
  can do in the app's own words, numbered first steps, safety (911 first, never approach) and
  privacy, how sign-in works, and the three films — "How to join and take part", "How to report
  an incident" and "How the Safety Dashboard works" — ordered for the role, with chapter links
  (`?t=`) to the parts that matter (businesses: reporting and the Lookout board; officers: the
  Ops Center, the district map, triage, spoken alerts; administrators: Manage the team).
- One builder, `api/_lib/invitations.ts`, for every way in: an administrator's invite, an access
  code, an approved request to join, and invitations Supabase sends itself (the email hook reads
  the invited role). New addresses get **Accept your invitation** / **Finish joining**; existing
  accounts get **Sign in to the dashboard** with a "You're now …" or "Your access is ready"
  version.
- The film list in one place, `api/_lib/films.ts` (titles, lengths, chapter starts, posters),
  all three checked against the film pages — "How to join and take part" (3:08) included, with
  chapter links for each role.
- Admin → Team → **Invite someone**: invite a **member business**, a Public Safety officer or an
  administrator, with a hint for each role. The picker starts on the least access.
- Email craft: tables and inline styles for Gmail, Outlook and Apple Mail; a full-width button
  and smaller film stills on phones; dark-mode colours where the client supports them; readable
  with images off (film stills carry alt text); a plain-text part; ~35 KB, well under Gmail's
  clipping limit.
- `scripts/email-previews.ts` writes every variant as HTML + text to look at in a browser.

### Changed
- `/api/officers/invite` accepts `business` as well as `officer` and `admin`, and a missing or
  unknown role is a 400 (it used to default to officer). It **never lowers anyone**: an existing
  account that already has the role or a higher one keeps it (`status: "unchanged"`) and gets the
  guide for the role it has; an open invitation is raised in place or kept — no longer deleted and
  re-made, so a business re-invite can't replace a pending officer invite. Before, an invitation
  set an account's role outright — inviting an administrator as an officer demoted them.
- One never-lower rule for every way in (`grantRole` / `standingOf` in `api/_lib/membership.ts`),
  and every email describes the role the address actually has: an approval or code redemption
  that keeps a higher role says so; a **repeat** code redemption describes the account as it is
  now, not what the code did the first time.
- An account that has never signed in (its first invite unopened) gets the invitation again —
  "Accept your invitation", "Register your storefront" — not "Already a member".
- Invitations Supabase sends itself take the role from the profile first (the sign-up trigger
  has written it by then), then the open invite, then member business.
- Every lookup and write on these paths is checked: a failure stops the request (5xx) before any
  email goes out.

### Fixed
- Admin → Team → **Pending invites** labelled business invitations "Public Safety", and revoking
  one said they "won't be made a Public Safety officer".
- Invited administrators with an existing account were told "You're now a Public Safety officer".

### Verified
- API harness 178/178 (68 new: every role × way in × account — 54 emails — has no AI, vendor or
  "person" wording, links all three films and the sign-in link, says 911 first and how long the
  link lasts, escapes names, stays small; role-specific subjects, headings, buttons and chapter
  links; business invites through the admin API; never-lower for accounts and open invitations;
  repeat code redemptions; never-signed-in accounts; failed lookups and writes send nothing;
  Supabase-sent invitations from the profile, a stale invite, the open invite or nothing; the film
  list matches the film pages).
- Screenshots of all 15 variants at 600 px and 375 px, plus desktop, dark mode and images off.

## [0.4.4] — 2026-10-09 — "How to join" film, the sample report on South Main, a new Main Street picture

### Added
- **https://www.901safety.com/how-to-join** — a 3:08 how-to for Downtown businesses and local
  stakeholders, in light mode, 3Blue1Brown style, narrated in Eleven v4 to ASD-STE100: who can
  join, register a business with only an email, join with an access code, set up the storefront
  and a passkey, take part every day (nearby alerts, your block, spoken alerts, my reports), the
  Lookout board and a sighting, and the public live map. Eight chapters, a transcript, captions,
  `?t=` deep links, VideoObject JSON-LD and its own share card.
- Links to it: the landing page's hero and footer ("How to join · 3:08"), the sign-in page ("New
  here? Watch how to join") and `/join`. Like the other films' links, they show only once the
  film's length is set.

### Changed
- **The sample report is on South Main.** Report DT-0119 is now "Man trying car door handles on S
  Main St", from Ortega's Corner Market, 254 S Main St (it was on S 2nd St, from Gayoso Corner
  Market), heading north toward Beale St; the guided form's example text follows. Both published
  films were re-cut with it: "How it works" (5:53) and "How to report" (3:08), whose caller line
  and real voice call were redone.
- **A new Main Street picture** — the trolley under the Orpheum sign, supplied by the owner —
  replaces the old trolley picture on the sign-in and join pages and in the landing page's "Built
  for downtown" card (also in PR #10).

## [0.4.3] — 2026-10-09 — Wall display for the office TV

### Added
- **`/tv` — a wall display** for a TV on an office wall: the live map (dark, sized for a room)
  beside the latest reports, with counts (new · open · P1–P2 open · last 24 h · lookouts), a
  clock, a gold "New" mark for a report's first ten minutes, and the happening-now / weapon /
  hurt flags. It refreshes every 15 seconds and keeps the last picture up while it reconnects. It
  keeps the screen awake, hides the cursor, and scales from 1080p to 4K (4K draws 512-px map
  tiles so street names stay readable).
- **Private, revocable display links** — Admin → Access → *Wall displays*: name a screen, copy
  its link once (`/tv#key=…`), see when it was last on screen, revoke it. Creating and revoking
  are audited.
- `GET /api/display` (key in `X-Display-Key`): open reports of any age plus the last 24 hours,
  sending only what a wall shows. It never sends the reporter, contact details, descriptions,
  people, photos, transcripts or notes. Rate-limited to 40 requests a minute per address.
- Migration `0005_display_links.sql`: `display_links` (label, SHA-256 of the key, who made it,
  last seen, revoked) with RLS on and no policies — only the server reads it.
- API harness: 22 new checks (110 total).

## [0.4.2] — 2026-10-09 — "How to report" film

### Added
- **https://www.901safety.com/how-to-report** — a 3:08 how-to film in light mode, 3Blue1Brown
  style, narrated in Eleven v4 to ASD-STE100: before you report (911 first), report by voice,
  the guided form, a quick alert, review and send, follow the status in My reports, and how
  officers respond (acknowledge, responding, notes, BOLO, resolve). The voice chapter is a real
  call on the voice line; its first lines play in their own voices.
- Seven chapters, a clickable transcript (the call's lines are labelled "Interviewer:" and
  "Caller:"), `?t=` deep links, captions, a VideoObject with one Clip per chapter, and its own
  share card (`public/video/how-to-report/og-image.png`). Each chapter's QR code in the film
  opens the page at that chapter; the cover and end card open `/report`.
- Links to it from the landing page (hero and footer), the "Report an incident" page, and the
  first film's page (which it links back to).

### Changed
- The film page is shared: `FilmPage` takes the film and its words as props, each film page is
  its own small entry, and `scripts/film-data.mjs --film <id>` brings in either film.
- The voice screen's call line names the voice (`voice "George"`) instead of the engine
  ("Eleven v4"), so no vendor wording shows to callers.

## [0.4.1] — 2026-10-09 — Voice interviews in an Eleven v4 voice

### Changed
- **The voice interviewer now speaks with ElevenLabs Eleven v4.** It runs as an ElevenLabs
  agent: speech recognition (Downtown street names boosted), turn-taking, interruptions and
  the voice are ElevenLabs'; the interview script, the 9-1-1 and fairness rules and the report
  fields are unchanged. The agent fills the draft through a client tool in the browser, says
  "filing that now" first, reads back what it filed, files again when the caller adds a
  detail, and hangs up after goodbye. Callers hear the voice they picked for spoken alerts
  (George by default).
- `/api/voice-session` mints a one-time conversation token for signed-in members (the
  ElevenLabs key stays on the server; 6 call starts per 10 minutes per member) and passes who
  is calling, from the database. `scripts/voice-agent.ts` creates or updates the agent from
  `api/_lib/voiceAgent.ts`; production's agent is `agent_4701m4fyz1bnetha6v752mnr1710`.
- Without `ELEVENLABS_AGENT_ID`, the OpenAI GPT-Live line takes the call, as before.
- Admin → System shows which voice engine is live.

### Fixed
- **"Voice interviews aren't configured on this deployment yet (OPENAI_API_KEY)"** appeared
  whenever the voice check failed — an expired sign-in or a network error read as a missing
  key. The page now says what happened ("sign in again", or "couldn't reach the voice line"
  with Try again), and Start waits for the check.

### Privacy
- The agent is private (a token from our server is required), records no audio, and deletes
  transcripts after 30 days.

### Verified
- A real call in a browser against the live agent, with a recorded caller as the microphone:
  greeting, 9-1-1 guidance, one question at a time, the report filed (Suspicious Person · P2 ·
  Main St and Gayoso Ave · the person's description) and updated, then the agent hung up.
  Voice starts ≈2.1–2.6 s after the caller stops (≈1.8–2.2 s with `eleven_v4_turbo`).
- API harness 66/66 (new: `/api/voice-session` — engine choice, token minting, caller context,
  rejected key, rate limit).

## [0.4.0] — 2026-10-09 — Access codes, invite-only sign-up, public live map

Membership tools ported from the login-link-passkey kit onto this app's own auth (Supabase
magic links + passkeys — the auth engine is unchanged), and a public map so anyone can follow
what's being reported downtown. **Needs migration `0004_membership_and_public_map.sql`** —
applied to production on 2026-10-09 (safe to run more than once; 39/39 scenarios locally, a
rolled-back smoke test in production). The Supabase **Before User Created** hook is enabled in
production; sign-up stays open until an admin turns on invite-only.

### Added
- **Access codes** (Admin → Access). One code, many seats (default 10, up to 1,000); joins as
  a member business or a public-safety officer (officer codes start at 1 seat, with a
  warning); optional expiry (24 hours to 90 days); a random `XXXX-XXXX` code without
  look-alike characters, or your own. Copy the invite link, show or print a **QR card**,
  revoke it, and see who used it. Seats can't be oversold, each address takes one seat per
  code, and a code only ever raises a role — never lowers it.
- **`/join`** (public). Enter the code and a work email: a new address gets an invitation
  link, an existing account gets its access raised and a sign-in link. `?code=` fills the
  code in (the QR card and invite link use it). The page answers the same whether or not the
  address has an account; it's rate-limited and has a honeypot.
- **Invite-only sign-up** (Admin → Access → Who can join). When it's on, the database refuses
  new accounts without an invitation or a code; members already in can always sign in. The
  sign-in page explains it and links to `/join`, where people without a code can **ask to
  join** — admins approve a request as a business or an officer (the invitation email goes
  out) or dismiss it.
- **Activity** (Admin → Activity): an append-only record of codes created, used and revoked,
  invitations, role changes, passkey removals and setup links, decisions on requests and
  settings changes. Admins only; nobody can edit or delete entries.
- **Passkeys per member** (Admin → Team → key icon): each device with when it was added and
  last used; remove one, or **email a setup link** that opens on the member's own phone or
  computer on a one-tap "Add a passkey" prompt (`/account?passkey=setup`).
- **Public live map at `/live`** — no sign-in. Community reports from the last 6 hours,
  24 hours, 48 hours or 7 days: the type of report, its priority, its status and an
  approximate spot (about a block). Never text, people, vehicles, photos, the reporter or an
  address; officers-only and closed-as-unfounded reports never appear. Refreshes every
  minute. Admins can pause the map or delay new reports by 15 minutes to 2 hours. The landing
  page links to it.
- **Link-preview cards** for `/join` and `/live` (each with a QR code to the page); both pages
  are extra HTML entries of the same app.

### Security
- `redeem_access_code()` runs only from the server (service role), the sign-up hook only as
  Supabase Auth, and `public_incidents()` is the one new thing the public can call — a fixed,
  sanitized column list.
- In invite-only mode a refused sign-up tells that person their address has no account yet —
  that is what gating sign-up means. Open mode, `/join` and requests to join reveal nothing.

### Verified
- API harness 75/75 (new: `/api/join`, `/api/admin/members`); SQL scenarios 39/39.
- 48 headless-browser checks — `/live`, `/join`, the sign-in page and the admin Access,
  Activity and Team tabs, at desktop and 390 px phone widths, light and dark, in demo mode and
  against the production database (read-only).
- The sign-up hook end to end in production: open mode creates the account; invite-only
  refuses the sign-in page's request with HTTP 403 and the message it shows; a pending
  invitation lets the account through and is claimed. Production was put back to open mode
  and every test account, invitation and audit row removed.

## [0.3.1] — 2026-10-08 — Security + correctness review of the redesign

A full review of 0.3.0 (API/RLS security, frontend correctness, voice integrations) after it
went live. **Needs migration `0003_write_guards.sql`** (safe to run more than once; tested
against production in a rolled-back transaction — 15/15 scenarios).

### Added
- **"How it works" film at `/how-it-works`** — a 5:53 3Blue1Brown-style walkthrough of the
  Safety Dashboard and the Ops Center (14 chapters, real screens from the demo, narration
  written ~80% to ASD-STE100, a natural voice, a QR code per chapter, designed cover and end
  card, OpenStreetMap credited). The page has its own HTML entry so link previews show the
  video (`og:type` video.other, `og:video`, cover image) and search engines get a
  `VideoObject` with one `Clip` per chapter; chapters and every transcript sentence are
  timestamp links, and `?t=` deep links (`89`, `1:29`, `1m29s`) open the film there. The
  landing page links to it. `scripts/film-data.mjs` brings a new cut in from the film
  project (`~/videos/dmc-safety-how-it-works`).

### Security
- **Passkey sign-in could take over any account, including the admin** (present since the
  June build). `/api/passkeys/auth/verify` minted a session for `profiles.email`, which every
  member could rewrite. It now signs in by the email on the passkey owner's auth account
  (`auth.admin.getUserById`). In the database, members can update only `display_name`
  (admins: `role`) — hotfixed in production on 2026-10-08, recorded in `0003`.
- **Reports can't be forged** (`0003`): the database stamps `reporter_id`, `source` and the
  member's own storefront name on every report a member files; status, priority,
  assignment and timestamps stay officer-only (a member's only change to a report is
  marking it seen); timeline entries from members are plain notes in their own name (the
  "Report received …" receipt excepted). The insert policy no longer accepts reports
  without a reporter.
- The Supabase email hook **fails closed** without `SEND_EMAIL_HOOK_SECRET` and refuses
  signatures older or newer than 5 minutes (replays).
- Photos only render from our own storage (or inline images) — no outside URLs or tracking
  pixels; signed photo URLs are forgotten on sign-out; a malformed description in a report
  no longer crashes the officer's view.
- `mark_report_seen()` is no longer executable by `anon`.

### Fixed
- **Maps showed no streets in production.** CARTO basemaps now need a key — without one
  every tile is an "API KEY REQUIRED" watermark (served with HTTP 200). CARTO Voyager /
  Dark Matter is used only when `VITE_CARTO_KEY` is set (free key:
  carto.com/basemaps/apikey); otherwise the standard OpenStreetMap tiles (darkened in dark
  mode) keep every map working.
- **Coming back to the tab no longer reloads everything or signs officers out of their
  role**: `user` stays the same object while the account is the same, and a failed profile /
  report / lookout / storefront read keeps what is on screen.
- **"Organize my notes"** (was "Organize with AI") fills only what the reporter left empty
  and never clears a ticked weapon / injury / happening-now flag; an unreadable or keyless
  answer saves the text only instead of posing as "Suspicious Activity · P3".
- A note that fails to save stays in the box with a "Note not saved" message.
- The voice transcript survives Back from the review step.
- Reports aren't filed in the legacy shape before the schema check finishes; a check
  violation no longer switches the session to legacy writes.
- Businesses see a lookout disappear when it's cleared (they can read it for a day after);
  a sighting only counts against an active lookout.
- Inviting an existing account as officer/admin actually sets the role (the role guard
  reverted server-side changes).
- The voice interview doesn't greet over a caller who speaks first; the report tool has room
  for a full report (`max_output_tokens` 500 → 1200); backend failures are logged.
- Upstream calls (OpenAI, ElevenLabs) time out with a clear message instead of Vercel's
  30-second error page; cut-off model answers are retried (JSON) or end on a whole sentence
  (briefings); text over 2,000 characters skips Text to Dialogue (its cap).
- Dictation stops on its own at 3 minutes (64 kbps) and the transcription limit fits under
  Vercel's 4.5 MB request cap.
- A late address lookup no longer moves the pin back; the storefront skeleton shows while it
  loads; the landing page no longer scrolls sideways on phones.

### Changed
- **Custom domain: https://www.901safety.com** (the bare `901safety.com` redirects to `www`). `dmc-safety-dashboard.vercel.app` 308-redirects there, path and query kept, except `/api/*`. Passkeys: `RP_ID=901safety.com`, `RP_ORIGIN` lists both origins (now a comma-separated list) — passkeys made on the old domain must be added again once. `SITE_URL` / `VITE_SITE_URL`, the Supabase Site URL, redirect allow-list and email-hook address, canonical / Open Graph URLs and the film's QR codes all use the new domain.
- **New link-preview cards** for the site and the film page: Downtown Memphis at blue hour (artwork generated with Higgsfield, no text in it) with the name, the self-regulated promise, the features, the 911 line and a real QR code to 901safety.com drawn on top (`scripts/og-images.mjs`).
- The landing and business-home skyline is now a photograph of Downtown Memphis (`public/brand/memphis-skyline.jpg`) instead of a generated picture on a third-party CDN.
- **No "AI" in the product's words.** It is presented as *a self-regulated safety
  dashboard*: "Report by voice" (an automated voice interview), "Organize my notes",
  "Filled in from your notes", "Summarized from the last N hours"; vendor names left the
  public pages (they stay in the admin System panel).
- API test harness: 45 → 53 checks (Text to Dialogue cap, unreadable / cut-off model
  answers, email-hook fail-closed, replay and signature).

## [0.3.0] — 2026-10-08 — Downtown Safety Dashboard redesign 🏙️

A ground-up rebuild around one job: **local businesses report what they see, and Downtown
public-safety officers see it instantly.** New information architecture, design system,
incident model, voice stack and imagery.

### Added
- **Report Center** for businesses and officers with three paths:
  - **Voice interview (OpenAI GPT-Live)** — a two-way interviewer with a business persona
    (knows the caller's storefront from the database) and an officer persona; asks one
    question at a time, tells anyone in danger to call 9-1-1, answers Spanish callers in
    Spanish, and files a structured report through the `file_incident_report` tool on its
    Responses backend. Live transcript, voice orb, mute, and a review step before sending.
  - **Guided form** — what / where / when / who / details, with a location picker (your
    storefront, GPS, search or a draggable pin), people and vehicle editors, photos (compressed,
    private bucket), dictation, **"Organize with AI"**, and optional spoken prompts.
  - **Quick alert** — category + location in two taps.
  - A review screen with a suggested priority, share-with-community / contact toggles, and a
    confirmation that is read back in an ElevenLabs voice.
- **Operations Center** for officers: live P1–P4 queue with new-report flashes, filters and
  search, district map with heat / BOLO / business layers, activity stream, KPIs, report
  detail with acknowledge → responding → resolved (with outcome), priority, assignment,
  internal or public notes, directions, "Listen", and one-click BOLOs.
- **Spoken alerts (ElevenLabs Eleven v4)** for new reports above a per-user priority
  threshold, plus an AI **shift briefing** (`/api/briefing`) read aloud.
- **`/api/tts`** — Eleven v4 via the Text to Dialogue API, falling back to text-to-speech and
  then `ELEVENLABS_FALLBACK_MODEL`; voice list from the account (or a curated set); per-user
  voice choice; browser speech as the last resort.
- **Lookout board** (BOLOs with sightings), **Insights** (trends, categories, hot spots,
  response times), redesigned **Administration** and **Settings** (voice + alert preferences).
- **Business home**: my reports with live status, nearby community alerts, storefront map.
- **Migration `0002_incidents_bolos.sql`** — incident fields (title, priority, flags, subjects,
  vehicles, photos, assignment, visibility, contact), the `report_updates` timeline with
  internal notes, `bolos` + sightings, the private `report-media` bucket, RLS, and Realtime.
- **Schema detection** so the new UI keeps writing legacy-format reports until `0002` runs.
- **Demo mode** rebuilt: realistic downtown dataset, role switcher, simulated incoming reports.
- **Higgsfield imagery** (skyline hero, Main Street, spot illustrations) served through Vercel
  Image Optimization (`vercel.json` → `images`).
- `npm run test:api` — mocked-upstream harness for the TTS, live-session, briefing and
  extraction functions.

### Changed
- New design system (navy + gold tokens, light/dark, Inter + JetBrains Mono), app shell with
  desktop sidebar and phone bottom tabs with a centre Report button, toasts, dialogs, sheets.
- Expanded taxonomy: 16 categories in four groups with default priorities.
- `/api/reports/extract` returns structured people, vehicles and flags; `/api/transcribe` is
  open to businesses; `/api/live-session` serves both personas.
- Stale-chunk guard reloads an open tab once after a redeploy.

### Removed
- The old single-page dashboard, officer portal, alert context and mock data (replaced by the
  pages and contexts above). `/officer` now redirects to `/report`.

## [0.2.1] — 2026-09-10 — Voice on OpenAI GPT-Live-1 (raw full duplex) 🎙️

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
