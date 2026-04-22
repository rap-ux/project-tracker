export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

function calcProjectCompletion(stage: string, sc: number): number {
  const s = Math.min(1, Math.max(0, sc ?? 0));
  if (stage === "Rough" || stage === "Underground") return s * 0.70;
  if (stage === "Finish")  return 0.70 + s * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0;
}

// PATCH — foreman quick-update (stage_completion + optional stage)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id }  = await ctx.params;
  const body    = await req.json();
  const role    = (session.user as any).role;
  const foremanName = (session.user as any).foremanName as string | undefined;

  const project = db.prepare("SELECT * FROM projects WHERE id = ?")
    .get(parseInt(id)) as any;
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  // Owners/admins can edit anything; foremen can only edit their own projects
  const isOwner   = role === "owner" || role === "admin";
  const isAssigned = foremanName && project.foreman?.toLowerCase().includes(foremanName.toLowerCase());
  if (!isOwner && !isAssigned) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Foreman can only update stage_completion (0-100 input → 0-1 stored)
  const rawPct     = Number(body.stage_completion);
  if (isNaN(rawPct)) return Response.json({ error: "Invalid stage_completion" }, { status: 400 });

  const stagePct   = Math.min(1, Math.max(0, rawPct / 100));
  const stage      = body.stage ?? project.stage;
  const projComp   = calcProjectCompletion(stage, stagePct);

  db.prepare(`
    UPDATE projects
    SET stage_completion = ?, stage = ?, project_completion = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(stagePct, stage, projComp, parseInt(id));

  // Log activity
  const details = `Stage: ${stage} · Completion: ${Math.round((project.stage_completion ?? 0) * 100)}% → ${Math.round(stagePct * 100)}%`;
  db.prepare(`
    INSERT INTO project_activity (project_id, user_name, action, details)
    VALUES (?, ?, ?, ?)
  `).run(parseInt(id), session.user?.name ?? "Unknown", "Quick Update", details);

  return Response.json({ ok: true, stage_completion: stagePct, project_completion: projComp });
}
