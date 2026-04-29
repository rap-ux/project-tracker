export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { deriveBudgets } from "@/lib/budgets";
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

  // ── Auto-snapshot finish_hours_actual ───────────────────────────────────────
  // Fires exactly once, when project_completion crosses from <100% to 100%.
  // Triggers: stage moves to Extras, or Finish stage_completion hits 100%.
  // Same guard pattern as rough — manual value wins; never overwrites.
  const wasNotComplete    = (current.project_completion ?? 0) < 1.0;
  const nowComplete       = (body.project_completion ?? 0) >= 1.0;
  const finishNotRecorded = !current.finish_hours_actual || current.finish_hours_actual === 0;

  if (wasNotComplete && nowComplete && finishNotRecorded && body.finish_hours_actual == null) {
    const roughActual = body.rough_hours_actual ?? current.rough_hours_actual ?? 0;
    const totalActual = body.actual_total_hours ?? current.actual_total_hours ?? 0;
    body.finish_hours_actual = Math.max(0, totalActual - roughActual);
  }

  // ── Auto-derive hour budgets from inputs (matches spreadsheet formulas) ─────
  // est_total_hours, rough/finish_hours_allowed, goal_hours all recompute
  // whenever a driving field changes (contract, stage, stage_completion).
  // Explicit body values still win — user can override via the edit form.
  const driverChanged =
       body.contract_value    !== undefined
    || body.stage              !== undefined
    || body.stage_completion   !== undefined;

  if (driverChanged) {
    const inputs = db.prepare("SELECT * FROM project_inputs WHERE project_id = ?")
      .get(parseInt(id)) as any;
    const merged = {
      contract_value:   body.contract_value   ?? current.contract_value,
      stage:            body.stage            ?? current.stage,
      stage_completion: body.stage_completion ?? current.stage_completion,
    };
    const derived = deriveBudgets(merged, inputs);
    if (body.est_total_hours      == null) body.est_total_hours      = derived.est_total_hours;
    if (body.rough_hours_allowed  == null) body.rough_hours_allowed  = derived.rough_hours_allowed;
    if (body.finish_hours_allowed == null) body.finish_hours_allowed = derived.finish_hours_allowed;
    if (body.goal_hours           == null) body.goal_hours           = derived.goal_hours;
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
