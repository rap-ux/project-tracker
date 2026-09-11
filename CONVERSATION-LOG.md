# CONVERSATION-LOG (Switchboard)

Dated record of decisions and context that is not derivable from the code. Newest at the
bottom of each day. Started 2026-09-08; earlier history lives in git only.

## 2026-09-08 — Daily Reports section added
- Rafael handed over SWITCHBOARD-PROMPT.txt from the Daily Helper prototype repo. Cole
  approved Switchboard as the home for daily reports on this date. Both intake paths
  (manual paste/audio and RingCentral pull) are required; RingCentral is deferred and
  not approved. Cole and Taimez start the calling routine the week of 2026-09-14.
- Claude read the prototype (`../TWE Daily Helper/app`: HANDOFF.md, lib/, app/) and
  Switchboard's `lib/db.ts`, `auth.ts`, `proxy.ts`, `components/Navbar.tsx`, and the
  live local DB (41 projects: 17 active, 24 pipeline; users table has seed logins
  `damon@twe.com`, `taimez@twe.com`; no Jared account).
- Schema mapping chosen (additive):
  - `projects.aliases` JSON column instead of a jobs table.
  - `daily_reports.project_id -> projects.id` (nullable; confirm requires a link).
  - `daily_report_facts` + FTS5 virtual table, rebuilt on save. Named with the
    `daily_report_` prefix to keep clear of Switchboard's existing `/report` page and
    `/api/reports` route (weekly email stub, pre-existing).
  - Drizzle from the prototype dropped; Switchboard uses raw better-sqlite3 everywhere.
  - Server actions used for the forms (prototype pattern); Switchboard's other pages use
    API routes + client components, but the reports section is self-contained.
- Access: separate `REPORTS_ALLOWED_EMAILS` allow-list, fails closed. Navbar shows the
  link to allow-listed users of any role (Damon/Taimez are `foreman` role) by fetching
  `/api/reports/access` once per tab.
- Installed `@anthropic-ai/sdk@0.124` and `zod@4` into Switchboard.
- Verified: typecheck clean; lint clean for new files (one pre-existing `any` in
  `app/api/reports/route.ts` left alone); data-layer smoke test passes; all `/reports/*`
  routes compile and redirect to login when signed out. Not verified: extraction and
  Ask against the model (no API key), signed-in UI walk-through (Claude does not enter
  passwords).
- Rafael asked mid-session whether a bot/phone number in the managers' RingCentral SMS
  group chat could answer "hey helper, what happened at X on the 21st?" Assessment:
  yes, feasible. RingCentral supports SMS on a company number via its API plus webhooks
  for inbound messages; a Switchboard endpoint would receive the group message, detect
  the "hey helper" trigger, call `askReports()`, and reply via the same number. Open
  points: group MMS/SMS behaviour on RingCentral (group texts arrive as MMS and replies
  may need to go to the group thread, not individuals), a dedicated number or bot user,
  answer length limits for SMS, and the same privacy question (answers derived from
  transcripts leaving the app). Not started; RingCentral remains off-limits until
  Rafael says go.
- Open with Rafael: ANTHROPIC_API_KEY, sample transcripts, production emails for
  Damon/Taimez, Jared's account, RingCentral go-ahead, STT provider.

## 2026-09-10 — Sync creates new projects
- Rafael shared the 2026-09-02 exports of the Profitability sheet (KPIs, Baseline
  Revenue Forecasting, Project List and Inputs, Profitability Report dump, Report
  Summary): 26 tracked columns vs 17 active in Switchboard. Daily Reports parked.
- Dry run through the real importer: 7 names with no match (12618 Homewood Way,
  527 Homewood Rd., Oceano, 22244 PCH, 732 Patterson Pl, 209 1st Anita, 24279 Bridle
  Trail Rd) and 2 pipeline rows now in the sheet (480 Lake Sherwood - Metzinger,
  620 El Medio; the latter's foreman moves Cole -> Damon). The sync used to refuse
  unknown names and ask for "+ Add Project" first.
- Rafael chose "auto-create in Sync" over a manual checklist or a Railway script.
- Claude: importer stages creates (placeholder ids) and activations; apply route
  delegates to `applyStagedChanges`; the file-upload route's duplicated column
  parser now calls the shared importer (its extra QBO row labels were folded in);
  Sync UI labels the new rows. End-to-end test on the local db passes and restores it.
- Not done here: deploy. Production update = deploy, then run Sync (or upload the
  KPIs csv) and apply the batch; then set wage rates on /inputs ($39 for the new
  jobs, $40 for Anita and Bridle Trail per the Inputs tab) and add builders/contacts.
  Anita and Bridle Trail have no foreman in the sheet.

## 2026-09-11 — Volta, Operations Log rename, drop box
- Rafael: build "Volta", an assistant bottom-right in Switchboard with access to all data
  (projects, financials, operations, the Operations Log transcripts), plus architecture
  for a standalone install and a Slack bot. Clarified that "Operations Log" is the name
  for the daily-reports/transcripts section; UI renamed, routes unchanged.
- Claude built: `lib/volta/` (access rules, curated read-only tools incl. Operations Log
  search and admin-only SQL, agent loop on claude-opus-5), widget, `/api/volta/chat`
  (session or service token), `/api/slack/volta` (Events API, signature-verified,
  answers in `after()`), `volta_messages` audit table, docs/VOLTA.md. Tool smoke test
  passes; the model itself has not been exercised (no API key on this machine).
- Rafael: Cole struggles to get transcripts to Rafael, so the first useful piece is an
  upload link Cole can use directly. Built `/drop/<token>` (public, write-only, no login)
  and a "Run extraction" button on the review page so intake does not depend on the API
  key or on Cole's tech comfort. Rafael asked where the data is stored: see HANDOFF
  "Where the data lives" (SQLite + audio on the Railway volume, no third parties).
- To go live: set REPORTS_DROP_TOKEN, REPORTS_ALLOWED_EMAILS, ANTHROPIC_API_KEY on
  Railway; send Cole the drop link.
- Rafael: Operations Log should be two sections, Uploads (raw files with text preview) and
  a running journal sectioned by month. Built as tabs Uploads / Journal / Ask with an
  "+ Add transcript" button; inbox folded into Uploads as the "Needs review" filter;
  Journal adds a job filter and per-day copy. Pushed.
