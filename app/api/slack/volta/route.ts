export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
// Volta as a Slack bot (Events API). Handles @mentions in channels and DMs.
// Slack needs a 200 within 3 seconds, so the answer is produced in `after()`
// and posted with chat.postMessage. Self-authenticates with the Slack signing
// secret; listed in proxy.ts so no session cookie is required.
//
// Env: SLACK_SIGNING_SECRET, SLACK_BOT_TOKEN (xoxb-…). Scopes: app_mentions:read,
// chat:write, im:history, im:read, users:read, users:read.email, channels:history
// (only if you want it to read thread context in public channels).
import crypto from "crypto";
import { after, NextRequest } from "next/server";
import { logExchange, runVolta, type VoltaMessage } from "@/lib/volta/agent";
import { voltaUserFromEmail } from "@/lib/volta/access";

const seen = new Map<string, number>(); // event_id -> ts, Slack retries on slow acks

function verify(req: NextRequest, raw: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const mac = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${ts}:${raw}`).digest("hex");
  return mac.length === sig.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(sig));
}

async function slack(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function emailForSlackUser(userId: string): Promise<string | null> {
  const r = await slack("users.info", { user: userId });
  return (r.user as { profile?: { email?: string } } | undefined)?.profile?.email ?? null;
}

/** Prior turns in the thread, as Volta/user pairs (best-effort). */
async function threadHistory(channel: string, threadTs: string, botUserId: string): Promise<VoltaMessage[]> {
  const r = await slack("conversations.replies", { channel, ts: threadTs, limit: 30 });
  const msgs = (r.messages as Array<{ user?: string; bot_id?: string; text?: string; ts: string }> | undefined) ?? [];
  return msgs
    .filter((m) => m.text)
    .map((m) => ({ role: m.user === botUserId || m.bot_id ? "assistant" : "user", content: (m.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim() }) as VoltaMessage)
    .filter((m) => m.content);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

  // Slack's one-time URL verification when you save the Events URL.
  if (payload.type === "url_verification") {
    if (!verify(req, raw)) return new Response("bad signature", { status: 401 });
    return Response.json({ challenge: payload.challenge });
  }
  if (!verify(req, raw)) return new Response("bad signature", { status: 401 });
  if (!process.env.SLACK_BOT_TOKEN) return new Response("bot token missing", { status: 503 });

  const event = payload.event as Record<string, unknown> | undefined;
  const eventId = String(payload.event_id ?? "");
  if (!event || !eventId) return new Response("ok");

  // Dedupe retries; forget ids after ten minutes.
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 600_000) seen.delete(k);
  if (seen.has(eventId)) return new Response("ok");
  seen.set(eventId, now);

  const type = String(event.type);
  const isDm = type === "message" && event.channel_type === "im" && !event.bot_id && !event.subtype;
  const isMention = type === "app_mention";
  if (!isDm && !isMention) return new Response("ok");

  const channel = String(event.channel);
  const userId = String(event.user ?? "");
  const text = String(event.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim();
  const threadTs = String(event.thread_ts ?? event.ts);
  const botUserId = String((payload.authorizations as Array<{ user_id?: string }> | undefined)?.[0]?.user_id ?? "");

  after(async () => {
    const post = (t: string) => slack("chat.postMessage", { channel, text: t, thread_ts: isMention ? threadTs : undefined, unfurl_links: false });
    try {
      const email = await emailForSlackUser(userId);
      const user = voltaUserFromEmail(email);
      if (!user) { await post("I can only answer people with a Switchboard account. Your Slack email doesn't match one. Ask Rafael to add you."); return; }
      if (!text) { await post("Ask me about a project, the numbers, the schedule, or what happened on a job."); return; }

      let history: VoltaMessage[] = [];
      if (event.thread_ts) { try { history = await threadHistory(channel, threadTs, botUserId); } catch { /* fine */ } }
      if (!history.length || history[history.length - 1].content !== text) history.push({ role: "user", content: text });

      const result = await runVolta({ user, messages: history, channel: "slack" });
      logExchange("slack", user, text, result.text, result.toolsUsed);
      await post(result.text);
    } catch (e) {
      await post(`Volta hit an error: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  return new Response("ok");
}
