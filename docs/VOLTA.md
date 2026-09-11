# Volta — Switchboard's assistant

Volta answers questions about projects, money, hours, schedules, QuickBooks, the activity
feed, and the Operations Log (daily reports built from call transcripts). It is read-only.
One core, three front doors: the widget inside Switchboard, a Slack bot, and an HTTP API
that a standalone app can call.

```
                ┌──────────────────────────── Switchboard (Railway) ─────────────────────────────┐
                │                                                                                 │
  Widget ──────▶│  POST /api/volta/chat  ──┐                                                      │
  (bottom-right)│   (session cookie)       │     lib/volta/agent.ts        lib/volta/tools.ts     │
                │                          ├──▶  runVolta(user, msgs) ──▶  list_projects …  ──▶ SQLite (data/projects.db)
  Slack ───────▶│  POST /api/slack/volta ──┤     Claude tool-use loop      get_project          │   projects, inputs, stages,
  (Events API)  │   (signing secret)       │     model: claude-opus-5      portfolio_summary    │   forecast, change orders,
                │                          │                               search_activity      │   comments, activity, QBO,
  Standalone ──▶│  POST /api/volta/chat  ──┘                               forecast             │   daily_reports (+FTS)
  app / bot     │   (Bearer VOLTA_SERVICE_TOKEN                            search_operations_log│
                │    + x-volta-user-email)                                 sql_query (admins)   │
                │                                                                                 │
                │  lib/volta/access.ts: who is asking -> what they may see                        │
                │  volta_messages: audit log of every question and answer                         │
                └─────────────────────────────────────────────────────────────────────────────────┘
```

## Access model (`lib/volta/access.ts`)
Volta sees exactly what the asking person could see in the app.

| Who | Projects | SQL | Operations Log |
|---|---|---|---|
| owner / admin | all | read-only SELECT (`sql_query`) | only if on `REPORTS_ALLOWED_EMAILS` |
| foreman | own projects (same LIKE rule as /foreman) | no | only if on `REPORTS_ALLOWED_EMAILS` |
| not a Switchboard user | nothing | | |

`sql_query` opens the database read-only, refuses anything but one SELECT, and blocks
`users`, `qbo_connection`, `login_events`, `user_presence`, `ip_geo_cache`, `alerts_dismissed`,
`volta_messages`, plus the `daily_report*` tables for anyone off the Operations Log list.
Slack and standalone callers are mapped to a Switchboard user by email; no account, no answer.

## 1. Widget in Switchboard
`components/VoltaWidget.tsx`, mounted in `app/layout.tsx`. Floating "Volta" button bottom-right
on every signed-in page (hidden on login, legal pages, and the drop box). Conversation lives in
`sessionStorage` per tab; the server logs each exchange to `volta_messages`.
Needs only `ANTHROPIC_API_KEY`. Optional `VOLTA_MODEL` (default `claude-opus-5`).

## 2. Slack bot
Endpoint: `POST /api/slack/volta` (Events API). Responds to `@Volta …` in channels (replies in
a thread) and to direct messages. Prior turns in a thread are read back as context.
Slack needs a 200 within three seconds, so the answer is generated after the response
(`after()`) and posted with `chat.postMessage`.

### Install (one time, in api.slack.com/apps)
1. Create app "Volta" from scratch in the TWE workspace.
2. OAuth & Permissions → Bot Token Scopes: `app_mentions:read`, `chat:write`, `im:history`,
   `im:read`, `im:write`, `users:read`, `users:read.email`. Add `channels:history` and
   `groups:history` only if Volta should read thread context in channels.
3. Event Subscriptions → enable → Request URL `https://<switchboard>/api/slack/volta`.
   Slack sends a `url_verification` challenge; the route answers it once
   `SLACK_SIGNING_SECRET` is set on Railway. Subscribe to bot events `app_mention` and
   `message.im`.
4. App Home → enable the Messages tab ("Allow users to send Slash commands and messages").
5. Install to workspace → copy the Bot User OAuth Token (`xoxb-…`) to `SLACK_BOT_TOKEN`, and
   Basic Information → Signing Secret to `SLACK_SIGNING_SECRET`. Redeploy.
6. Invite `@Volta` to the managers' channel. Test: `@Volta which projects are over their hours goal?`

People must have a Switchboard account whose email matches their Slack profile email.

## 3. Standalone application
Switchboard owns the data (SQLite on a Railway volume cannot be shared with a second
service), so a standalone Volta is a **client of Switchboard's API**, not a second copy
of the brain.

```
  standalone Volta (desktop/mobile/bot) ──HTTPS──▶ POST https://<switchboard>/api/volta/chat
     Authorization: Bearer $VOLTA_SERVICE_TOKEN
     x-volta-user-email: cole@totallywiredelectric.com     (who the client acts for)
     { "messages": [{ "role": "user", "content": "how is Pyramid doing?" }] }
  ◀── { "text": "...", "toolsUsed": ["get_project"] }
```

Recommended shape:
- **Service**: a small Node app (Railway service "volta", or anywhere) holding the token. It can
  run Slack in Socket Mode (no public URL), a Teams/RingCentral adapter, or a scheduled
  digest. Suggested stack: Node 20, `@slack/bolt` in Socket Mode, `fetch` to Switchboard.
- **Desktop**: install Switchboard as a PWA (it already ships a manifest) and open Volta from
  there; or wrap the widget route in Electron/Tauri if a separate window is wanted. Either way
  it talks to the same endpoint with the user's session, so no extra auth.
- **Identity**: the service maps its own users (Slack ids, phone numbers) to Switchboard
  emails and passes them in `x-volta-user-email`; the access rules above still apply.
- **Token hygiene**: `VOLTA_SERVICE_TOKEN` is a server-to-server secret. Never ship it in a
  browser or mobile binary; put it in the service and let the client authenticate to the
  service instead.

Minimal client:
```ts
const r = await fetch(`${SWITCHBOARD}/api/volta/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, "x-volta-user-email": email },
  body: JSON.stringify({ messages }),
});
const { text } = await r.json();
```

## Env summary
```
ANTHROPIC_API_KEY=        required
VOLTA_MODEL=              optional, default claude-opus-5
SLACK_SIGNING_SECRET=     Slack bot
SLACK_BOT_TOKEN=          Slack bot (xoxb-…)
VOLTA_SERVICE_TOKEN=      standalone clients (openssl rand -hex 32)
REPORTS_ALLOWED_EMAILS=   who may see the Operations Log through Volta
```

## Operating notes
- Cost: one question is usually 2–4 model calls (question, tool results, answer). The system
  prompt is cached. `sql_query` and `get_project` return at most a few KB each.
- Audit: `volta_messages` keeps channel, user, question, answer, and tools used. It is in the
  DB backup.
- Extending: add a tool in `lib/volta/tools.ts` (definition in `toolsFor`, executor in
  `runTool`). Keep tools read-only and scoped through `projectScope`.
- Test without a key: `npx tsx scripts/volta-smoke.ts` exercises every tool and the access rules.
