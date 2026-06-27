export const dynamic = 'force-dynamic';
import { auth } from "@/auth";
import db       from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role        = (session.user as any).role;
  const foremanName = (session.user as any).foremanName as string | undefined;
  const isForeman   = role === "foreman";
  const foremanHref = isForeman ? "/foreman" : "/dashboard";

  const alerts: Array<{
    key:       string;
    severity:  "critical" | "warning" | "info";
    title:     string;
    detail:    string;
    projectId?: number;
    href?:     string;
  }> = [];

  // ── Project thresholds (scoped to foreman's own projects if applicable) ──
  const projectsSql = (isForeman && foremanName)
    ? `SELECT id, name, foreman, stage, stage_completion, project_completion,
              actual_materials, unrecorded_materials, est_materials_budget,
              actual_total_hours, unrecorded_hours, goal_hours,
              contract_value, total_invoiced
       FROM projects
       WHERE is_pipeline = 0 AND foreman LIKE ?`
    : `SELECT id, name, foreman, stage, stage_completion, project_completion,
              actual_materials, unrecorded_materials, est_materials_budget,
              actual_total_hours, unrecorded_hours, goal_hours,
              contract_value, total_invoiced
       FROM projects
       WHERE is_pipeline = 0`;

  const projects = (
    isForeman && foremanName
      ? db.prepare(projectsSql).all(`%${foremanName}%`)
      : db.prepare(projectsSql).all()
  ) as any[];

  for (const p of projects) {
    const effMat   = (p.actual_materials   ?? 0) + (p.unrecorded_materials ?? 0);
    const matPct   = p.est_materials_budget > 0 ? effMat / p.est_materials_budget : 0;
    const effHours = (p.actual_total_hours ?? 0) + (p.unrecorded_hours     ?? 0);
    const hrsPct   = p.goal_hours > 0 ? effHours / p.goal_hours : 0;

    if (matPct > 1) {
      alerts.push({
        key:      `mat_over_${p.id}`,
        severity: "critical",
        title:    `${p.name}: Materials over budget`,
        detail:   `Used ${Math.round(matPct * 100)}% of materials budget`,
        projectId: p.id, href: foremanHref,
      });
    }
    if (hrsPct > 0.9 && (p.stage_completion ?? 0) < 0.8) {
      alerts.push({
        key:      `hrs_risk_${p.id}`,
        severity: "warning",
        title:    `${p.name}: Hours near limit`,
        detail:   `${Math.round(hrsPct * 100)}% of budgeted hours used but stage only ${Math.round((p.stage_completion ?? 0) * 100)}% done`,
        projectId: p.id, href: foremanHref,
      });
    }
    // Invoicing alert is owner-only (foremen don't see billing info)
    if (!isForeman && (p.contract_value ?? 0) > 0 && (p.total_invoiced ?? 0) === 0 && (p.project_completion ?? 0) > 0.1) {
      alerts.push({
        key:      `no_inv_${p.id}`,
        severity: "warning",
        title:    `${p.name}: No invoicing recorded`,
        detail:   `Project is ${Math.round((p.project_completion ?? 0) * 100)}% done but $0 invoiced`,
        projectId: p.id, href: "/dashboard",
      });
    }
  }

  // ── Owner-only ops alerts (QBO stale, missing Timeline dates) ────────────
  if (!isForeman) {
    const latestUpload = db.prepare(
      "SELECT uploaded_at FROM uploads ORDER BY uploaded_at DESC LIMIT 1"
    ).get() as { uploaded_at: string } | undefined;

    if (latestUpload) {
      const lastDate = new Date(latestUpload.uploaded_at.replace(" ", "T") + "Z");
      const days = Math.floor((Date.now() - lastDate.getTime()) / 86400000);
      if (days >= 7) {
        alerts.push({
          key:      "qbo_stale",
          severity: days >= 14 ? "critical" : "warning",
          title:    `QBO data is ${days} days old`,
          detail:   `Last sync: ${lastDate.toLocaleDateString()}. Materials/hours may be out of date.`,
          href:     "/uploads",
        });
      }
    } else {
      alerts.push({
        key:      "qbo_none",
        severity: "info",
        title:    "No data synced yet",
        detail:   "Sync from the Google Sheet to populate materials + hours.",
        href:     "/uploads",
      });
    }

    const missingDates = db.prepare(`
      SELECT p.id, p.name FROM projects p
      WHERE p.is_pipeline = 0
        AND NOT EXISTS (
          SELECT 1 FROM project_stages s
          WHERE s.project_id = p.id AND s.start_date IS NOT NULL AND s.end_date IS NOT NULL
        )
    `).all() as any[];
    if (missingDates.length > 0) {
      alerts.push({
        key:      "no_stages",
        severity: "info",
        title:    `${missingDates.length} tracked project${missingDates.length === 1 ? "" : "s"} missing Timeline dates`,
        detail:   missingDates.slice(0, 3).map(m => m.name).join(", ") + (missingDates.length > 3 ? "…" : ""),
        href:     "/timeline",
      });
    }
  }

  // ── Pending @mentions for this user ───────────────────────────────────────
  const userName  = session.user?.name ?? "";
  const firstName = userName.split(" ")[0] ?? "";
  if (firstName) {
    // Foremen only see mentions on projects they're assigned to
    const mentionSql = (isForeman && foremanName)
      ? `SELECT c.id, c.project_id, c.user_name, c.body, c.created_at, p.name AS project_name
         FROM project_comments c
         JOIN projects p ON p.id = c.project_id
         WHERE p.foreman LIKE ?
           AND (',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?
                OR ',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?)
         ORDER BY c.created_at DESC LIMIT 10`
      : `SELECT c.id, c.project_id, c.user_name, c.body, c.created_at, p.name AS project_name
         FROM project_comments c
         JOIN projects p ON p.id = c.project_id
         WHERE ',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?
            OR ',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?
         ORDER BY c.created_at DESC LIMIT 10`;

    const mentioned = (
      isForeman && foremanName
        ? db.prepare(mentionSql).all(`%${foremanName}%`, `%,${firstName},%`, `%,${userName},%`)
        : db.prepare(mentionSql).all(`%,${firstName},%`, `%,${userName},%`)
    ) as any[];

    for (const m of mentioned) {
      alerts.push({
        key:      `mention_${m.id}`,
        severity: "info",
        title:    `${m.user_name} mentioned you`,
        detail:   `${m.project_name}: ${m.body.length > 60 ? m.body.slice(0, 57) + "…" : m.body}`,
        projectId: m.project_id, href: foremanHref,
      });
    }
  }

  // Exclude dismissed alerts for this user
  const userEmail = session.user?.email ?? "";
  const dismissed = db.prepare(
    "SELECT alert_key FROM alerts_dismissed WHERE user_email = ?"
  ).all(userEmail) as { alert_key: string }[];
  const dismissedSet = new Set(dismissed.map(d => d.alert_key));

  const visible = alerts.filter(a => !dismissedSet.has(a.key));

  return Response.json({ alerts: visible, total: visible.length });
}

export async function POST(req: NextRequest) {
  // Dismiss an alert
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const email = session.user?.email ?? "";
  if (!body.alert_key) return Response.json({ error: "alert_key required" }, { status: 400 });

  db.prepare(`
    INSERT OR IGNORE INTO alerts_dismissed (user_email, alert_key)
    VALUES (?, ?)
  `).run(email, body.alert_key);

  return Response.json({ ok: true });
}
