export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import { buildStageReport } from "@/lib/stageReport";
import { notifySlack, slackConfigured } from "@/lib/slack";
import type { NextRequest } from "next/server";

// Per-stage profitability snapshot (Project · Stage · allotted · progress ·
// allotted-by-progress · actual). Normally fires automatically when a sync is
// applied; this endpoint lets an owner — or a secret-bearing scheduler — send
// one on demand. Auth: ?secret=<BACKUP_SECRET> or an owner/admin session.
export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get("secret");
  const expected = process.env.BACKUP_SECRET;
  const secretOk = !!expected && provided === expected;
  if (!secretOk) {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (role !== "owner" && role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!slackConfigured()) {
    return Response.json({ error: "Slack not configured (set SLACK_WEBHOOK_URL)." }, { status: 503 });
  }

  const msg = buildStageReport();
  if (!msg) {
    return Response.json({ ok: false, error: "No projects with an active tracked stage." });
  }

  await notifySlack(msg);
  return Response.json({ ok: true });
}
