# Switchboard — HANDOFF

Internal project-coordination app for Totally Wired Electric (TWE).
Builder: Rafael Rivera (rap@totallywiredelectric.com). Owner/primary user: Cole Dixon.
Repo: github.com/rap-ux/project-tracker. Hosted on Railway with a persistent volume at `data/`.

This file is the running state of the app for whoever picks it up next (person or Claude
session). CONVERSATION-LOG.md is the dated record of decisions. Both started 2026-09-08;
earlier history is only in git.

## Stack
Next.js 16 (App Router, Turbopack), React 19, Tailwind 4 with semantic tokens in
`app/globals.css`, better-sqlite3 (schema + migrations inline in `lib/db.ts`, run at
startup), Auth.js v5 credentials login (`auth.ts`, roles owner/admin/foreman, super-admin
allow-list in `lib/auth-roles.ts`), route guard in `proxy.ts`. Integrations: QuickBooks
Online (`lib/qbo*.ts`), Slack (`lib/slack.ts`), Google Sheet sync, nodemailer.

Run locally: `npm run dev -- -p 3100` (3000 is taken by another app on Rafael's machine).
`.claude/launch.json` at the repo parent starts it for the in-app browser.

## Sections
Dashboard, per-project pages, Foreman view, Forecast, Analytics, Bonuses, Clients,
Timeline, Inputs, Sync (uploads), Report, Access log, Help. Plus **Operations Log** (below).

## Sync (KPIs sheet -> staged batch -> apply)
Source of truth for numbers is Nicole's "Project Profitability Summary" Google Sheet, tab
"SUMMARY_Project KPIs" (column per project). Three ways in, all through
`lib/importer.ts::stageColumnGrid`: file upload on /uploads, the Sync button
(`/api/upload/sheet-sync`, service-account read), and the sheet's Apps Script push
(`/api/upload/sheet-receive`, `?secret=`). Everything lands as a pending batch that an
owner reviews row by row and applies.

Matching rule (unchanged): exact name, else first-word prefix (so sheet "480 Lake Sherwood"
matches "480 Lake Sherwood - Metzinger"). Keep sheet names and Switchboard names aligned
on the first word, and for word-only names ("Oceano") identical.

**New since 2026-09-10 — projects are created by the sync.** A sheet column with no match
is staged as a `__create__` row plus one row per value, under a negative placeholder
project_id unique to the batch. On apply, `applyStagedChanges` inserts the project
(tracked, not pipeline), rewrites the placeholder to the real id, logs "Created" in
project_activity, and applies the values. A pipeline ("minor") project that appears in the
sheet is staged as `is_pipeline 1 -> 0` and becomes tracked on apply. Unchecking the
`__create__` row while keeping its values still creates the project (the values need a
row). Revert restores numbers and pipeline flags but does not delete created projects.
The sync never touches `project_inputs` (wage rate, planned hours): set those on /inputs
or run `scripts/sync-inputs-from-csv.ts` with the "Project List and Inputs" export.

Dev tools: `npx tsx scripts/kpi-dry-run.ts <KPIs.csv>` shows how each column would match
and what would be staged (no writes). `npx tsx scripts/kpi-apply-test.ts <KPIs.csv>`
stages, applies, verifies, then restores the LOCAL db.

## Volta (assistant, added 2026-09-11)
Read-only assistant over everything in the DB, scoped to the asking user. Widget bottom-right
(`components/VoltaWidget.tsx`), Slack bot (`/api/slack/volta`), HTTP API for standalone
clients (`/api/volta/chat` with `VOLTA_SERVICE_TOKEN`). Core in `lib/volta/`. Full
architecture, Slack install steps, and the standalone design: **docs/VOLTA.md**.
Audit log: `volta_messages`. Test without a key: `npx tsx scripts/volta-smoke.ts`.
Needs `ANTHROPIC_API_KEY`; Slack needs `SLACK_SIGNING_SECRET` + `SLACK_BOT_TOKEN`.

---

## Operations Log — daily reports (added 2026-09-08, beta)

User-facing name is **Operations Log** (Rafael, 2026-09-11); routes stay under `/reports`
and code keeps the `daily_reports` / `lib/reports` names.

### What it is
Cole (owner) and Taimez (field manager) phone each job lead at the end of every day.
Calls are recorded and transcribed. Transcript in -> brief, tactical daily report out ->
stored against the Switchboard project -> answerable later in plain English
("Did we ever install that chandelier at Pyramid?" -> "Per the 8/4 report, yes ...").
Cole texts the daily digest to Damon Riggs (operations) and Jared Vandagriff (field PM).
Prototyped in `../TWE Daily Helper/app` (kept as the sandbox for prompt work and the
RingCentral poller); ported here because Switchboard already holds the project registry.

### Data model (all in `lib/db.ts`, "Daily Reports" section; additive)
- `projects.aliases` TEXT JSON string[] — loose names heard on calls ("Pyramid house").
  The project row IS the job; no separate jobs table. Aliases are learned whenever a
  report is saved with a job name that differs from the project name.
- `daily_reports` — one per call. `project_id` -> projects (nullable until linked;
  confirming REQUIRES a link). Fields: job_name (as heard), work_date, call_date,
  reporter (job lead), caller (Cole/Taimez), source (paste|audio|ringcentral),
  transcript, audio_path, status (draft|confirmed), accomplished / next_steps /
  blockers / materials / people (JSON string[]), summary, extraction_notes,
  created_by, timestamps.
- `daily_report_facts` — one row per bullet of a CONFIRMED report, category
  done|next|blocked|needs, with `daily_report_facts_fts` (FTS5 over text, job_name,
  people). Rebuilt on every save (`lib/reports/facts.ts`). Ask searches facts first and
  sends only matching reports to the model, so cost stays flat as the archive grows.
- Audio files: `DATA_DIR/audio/` (DATA_DIR defaults to `./data`, i.e. the Railway
  volume). Served only via `/api/reports/audio/[id]` to allow-listed users.
  **Backups (`/api/admin/backup*`) copy `projects.db`, which now contains transcripts;
  the audio files are on the volume next to it and are NOT in the .db backup.**

### Code map
- `lib/reports/access.ts`   — allow-list gate (`REPORTS_ALLOWED_EMAILS`), `requireReportsUser()`
- `lib/reports/schema.ts`   — types, DATA_DIR/AUDIO_DIR, list helpers, `reportText`, `digestText`
- `lib/reports/projects.ts` — job-name -> project resolution, alias learning (never creates projects)
- `lib/reports/queries.ts`  — reads
- `lib/reports/extract.ts`  — transcript -> report via Claude (`claude-opus-5`, zodOutputFormat,
                              effort medium, cached system prompt, handles `refusal`). **Prompt is v0,
                              written without real transcripts.**
- `lib/reports/facts.ts`    — rebuildFacts, searchFacts (FTS5, OR'd terms, bm25)
- `lib/reports/ask.ts`      — Q&A over confirmed reports with `[#id]` citations
- `lib/reports/transcribe.ts` — STT stub (provider not chosen; paste required)
- `lib/reports/actions.ts`  — server actions: createReport, saveReport, unconfirmReport, deleteReport
- `app/reports/layout.tsx`  — gate + Navbar + sub-nav. Tabs (2026-09-11): **Uploads** (every
                              transcript/recording as stored, text preview, drafts flagged),
                              **Journal** (confirmed reports as a diary, month -> day, filter by job,
                              copy-day), **Ask**. Older routes still work: `inbox` -> uploads?filter=drafts,
                              `new`, `[id]`, `today`, `jobs`, `jobs/[id]`, `no-access`
- `components/reports/*`    — ProjectPicker (alias-aware), IntakeForm, ReviewForm, ReportCard, CopyButton, ReportsSubnav
- `app/api/reports/access`  — boolean for the Navbar link; `app/api/reports/audio/[id]` — recording stream
- `components/Navbar.tsx`   — "Daily Reports" link shown to allow-listed users of any role
- `scripts/reports-smoke.ts` — data-layer smoke test (`npx tsx scripts/reports-smoke.ts [--keep]`)

### Drop box (added 2026-09-11)
`https://<app>/drop/<REPORTS_DROP_TOKEN>` is a public, write-only page for Cole: paste a
transcript or attach a recording from the phone, no login. It inserts a draft with
`created_by = drop:<caller>` and `extraction_notes` starting with NOT_EXTRACTED; the review
page shows **Run extraction** to build the bullets when an API key is present. Rotate the
token by changing the env var. Do not share the link outside the managers.

### Accepted files
Uploads tab and drop box take `.txt/.md/.vtt/.srt` as-is, `.docx` via mammoth, `.pdf` via
pdf-parse (`lib/reports/extractText.ts`), and audio (stored, not transcribed). Scanned PDFs
with no text layer are rejected with a message. Old `.doc` is not supported.

### Where the data lives
- Transcripts: `daily_reports.transcript` in `data/projects.db` (Railway volume). Bullets in
  the same row; searchable facts in `daily_report_facts`.
- Recordings: files under `DATA_DIR/audio/` on the same volume, path in
  `daily_reports.audio_path`, served only via `/api/reports/audio/[id]`.
- Nothing goes to Basecamp, Drive, or a third-party host. The `.db` backup includes
  transcripts; the audio files must be backed up from the volume separately.

### Access and privacy
- Gate: `REPORTS_ALLOWED_EMAILS` (comma list), separate from the general login. Fails
  closed when unset. Initial list: Rafael, Cole, Damon, Jared, Taimez. Damon/Taimez are
  entered with their current seed logins (`damon@twe.com`, `taimez@twe.com`) — confirm the
  production addresses. **Jared has no Switchboard account yet.**
- Transcripts/audio are recordings of employees and customers. Only allow-listed users
  can read them; the audio endpoint checks the list per request.
- TODO retention: none yet. Cole owes answers on recording-consent practice and how long
  recordings/transcripts are kept.

### Env
```
ANTHROPIC_API_KEY=            # required for extraction + Ask
REPORTS_ALLOWED_EMAILS=...    # see above
DATA_DIR=                     # optional; Railway volume path in prod (default ./data)
REPORTS_TIMEZONE=             # optional; default America/Los_Angeles
```

### Status (2026-09-08)
- Built and typechecked; data layer smoke-tested (alias matching, facts rebuild, FTS,
  digest). Pages compile and redirect to login when signed out.
- **Not yet exercised end to end**: no ANTHROPIC_API_KEY on this machine, so extraction
  and Ask have not run against the model. UI not clicked through in a signed-in session.
- Two test rows left in the local DB (created_by = `smoke-test`): report #1 confirmed
  (Pyramid, 2026-08-04) and #2 draft (unlinked "Woods Drive"). Delete from the report
  page, or `npx tsx scripts/reports-smoke.ts` (without --keep) removes them.
- RingCentral intake: NOT built, NOT approved. Do not touch RingCentral (production,
  real recordings) without Rafael's explicit go-ahead.

### Next steps
1. Rafael: `ANTHROPIC_API_KEY` in `.env.local` (and Railway). Run one real transcript
   through `/reports/new`.
2. Cole (via Rafael): ~5 sample transcripts. Rework the extraction prompt against them
   ("more brief and more tactical"; accomplished vs next steps).
3. Confirm production emails for Damon, Taimez; create Jared's account; set
   `REPORTS_ALLOWED_EMAILS` on Railway.
4. Pick a speech-to-text provider; implement `lib/reports/transcribe.ts`.
5. RingCentral: read-only recording check on Cole's/Taimez's extensions, then a poller
   that creates drafts with source `ringcentral`. Needs go-ahead.
6. Slack posting of the daily digest (manual copy/text for now).
7. Idea (Rafael, 2026-09-08): a bot in the managers' RingCentral SMS group chat that
   answers "hey helper, what happened at X on the 21st?" from the reports. Feasible via
   RingCentral SMS webhooks + `askReports()`; see CONVERSATION-LOG for the assessment.
8. Cole: consent practice and retention rule.
