export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// ── Calculated fields ─────────────────────────────────────────────────────────
// Rough = 70% of project, Finish = 30%.
// Underground is lumped into Rough. Extras = after finish (100%).
function calcProjectCompletion(stage: string, stageCompletion: number): number {
  const sc = Math.min(1, Math.max(0, stageCompletion ?? 0));
  if (stage === "Rough" || stage === "Underground") return sc * 0.70;
  if (stage === "Finish")  return 0.70 + sc * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0; // Contracting Phase, Pre-Construction, etc.
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id }  = await ctx.params;
  const body    = await req.json();

  // Read current project state so we can do derived calculations
  const current = db.prepare("SELECT * FROM projects WHERE id = ?")
    .get(parseInt(id)) as any;

  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  // Effective values after this update
  const newStage            = body.stage            ?? current.stage;
  const newStageCompletion  = body.stage_completion ?? current.stage_completion;

  // ── Calculated: project_completion ──────────────────────────────────────────
  body.project_completion = calcProjectCompletion(newStage, newStageCompletion);

  // ── Auto-snapshot rough_hours_actual ────────────────────────────────────────
  // Fires exactly once, on the real transition. Two triggers:
  //   a) Stage changes from Rough/Underground → Finish or Extras
  //   b) stage_completion crosses from <100% to 100% while still in Rough
  // Guards:
  //   • notYetRecorded  — never overwrite an existing permanent record
  //   • body guard      — caller explicitly setting the field always wins
  const wasRough       = current.stage === "Rough" || current.stage === "Underground";
  const nowFinish      = newStage === "Finish" || newStage === "Extras";
  const crossingMax    = wasRough
                           && newStage === current.stage          // stage not changing
                           && newStageCompletion >= 1.0           // new value is 100%
                           && (current.stage_completion ?? 0) < 1.0; // was below 100%
  const notYetRecorded = !current.rough_hours_actual || current.rough_hours_actual === 0;

  if (wasRough && (nowFinish || crossingMax) && notYetRecorded && body.rough_hours_actual == null) {
    body.rough_hours_actual = body.actual_total_hours ?? current.actual_total_hours ?? 0;
  }

  const fields  = Object.keys(body)
    .filter(k => k !== "id")
    .map(k => `${k} = @${k}`)
    .join(", ");

  if (!fields) return Response.json({ error: "No fields to update" }, { status: 400 });

  db.prepare(`UPDATE projects SET ${fields}, updated_at = datetime('now') WHERE id = @id`)
    .run({ ...body, id: parseInt(id) });

  // ── Activity log ────────────────────────────────────────────────────────────
  const TRACKED = ["stage", "stage_completion", "actual_total_hours", "actual_materials",
                   "contract_value", "total_invoiced", "foreman"];
  const changes: string[] = [];
  for (const f of TRACKED) {
    if (body[f] !== undefined && body[f] !== current[f]) {
      const oldV = f === "stage_completion" ? `${Math.round((current[f] ?? 0) * 100)}%`
                  : current[f] ?? "—";
      const newV = f === "stage_completion" ? `${Math.round((body[f] ?? 0) * 100)}%`
                  : body[f] ?? "—";
      changes.push(`${f}: ${oldV} → ${newV}`);
    }
  }
  if (changes.length > 0) {
    db.prepare(`
      INSERT INTO project_activity (project_id, user_name, action, details)
      VALUES (?, ?, ?, ?)
    `).run(parseInt(id), (session.user as any).name ?? "Unknown", "Edited", changes.join(" · "));
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  return Response.json({ ok: true });
}
