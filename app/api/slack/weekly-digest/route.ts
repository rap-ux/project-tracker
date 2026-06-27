export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import db from "@/lib/db";
import { calcIncentive } from "@/lib/incentive";
import { notifySlack, slackConfigured, appUrl } from "@/lib/slack";
import type { NextRequest } from "next/server";

const fmt$  = (n: number) => "$" + Math.round(n ?? 0).toLocaleString("en-US");
const fmt$k = (n: number) => Math.abs(n) >= 1000 ? "$" + Math.round(n / 1000) + "k" : "$" + Math.round(n);

// Weekly Slack digest mirroring the /report page. Trigger Mondays via a
// scheduler hitting ?secret=<BACKUP_SECRET>, or open it as an owner in-browser.
export async function POST(req: NextRequest) {
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

  const raw = db.prepare("SELECT * FROM projects WHERE is_pipeline = 0 ORDER BY foreman, name").all() as any[];

  const projects = raw.map(p => {
    const effHours = (p.actual_total_hours || 0) + (p.unrecorded_hours || 0);
    const inc = calcIncentive(
      p.goal_hours || 0, effHours, p.contract_value || 0, p.stage, p.stage_completion || 0,
      p.rough_hours_allowed || 0, p.rough_hours_actual || 0,
      p.finish_hours_allowed || 0, p.finish_hours_actual || 0,
    );
    return { name: p.name, foreman: p.foreman, contract: p.contract_value || 0,
      invoiced: p.total_invoiced || 0, inc, varianceHours: inc.varianceHours };
  });

  const totalContract = projects.reduce((s, p) => s + p.contract, 0);
  const totalInvoiced = projects.reduce((s, p) => s + p.invoiced, 0);
  const totalEarned   = projects.reduce((s, p) => s + (p.inc.totalEarned || 0), 0);
  const billedPct     = totalContract > 0 ? Math.round((totalInvoiced / totalContract) * 100) : 0;

  const flagged = projects
    .filter(p => p.inc.projectStatus.key === "critical" || p.inc.projectStatus.key === "at-risk")
    .sort((a, b) => a.varianceHours - b.varianceHours);
  const watch = projects.filter(p => p.inc.projectStatus.key === "watch").length;
  const healthy = projects.length - flagged.length - watch;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

  let msg = `📊 *Weekly digest — ${today}*\n\n`;
  msg += `*Portfolio:* ${projects.length} tracked · ${fmt$k(totalContract)} contract · ${fmt$k(totalInvoiced)} invoiced (${billedPct}% billed)\n`;
  msg += `*Health:* ✅ ${healthy} on/under budget · ⚠️ ${watch} watch · 🚨 ${flagged.length} over budget\n`;
  if (totalEarned > 0) msg += `*Bonuses earned to date:* ${fmt$(totalEarned)}\n`;

  if (flagged.length > 0) {
    msg += `\n*Needs attention:*\n`;
    for (const p of flagged.slice(0, 8)) {
      const over = Math.abs(Math.round(p.varianceHours));
      msg += `• ${p.name} (${p.foreman}) — ${over} hrs over\n`;
    }
    if (flagged.length > 8) msg += `…and ${flagged.length - 8} more\n`;
  } else {
    msg += `\nNo projects over budget this week. 🎉\n`;
  }

  msg += `\nOpen Switchboard: ${appUrl("/dashboard")}`;

  await notifySlack(msg);
  return Response.json({ ok: true, flagged: flagged.length, projects: projects.length });
}
