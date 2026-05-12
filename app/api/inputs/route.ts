export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { deriveBudgets } from "@/lib/budgets";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const inputs = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.contract_value,
           COALESCE(pi.gross_margin,        0.575) AS gross_margin,
           COALESCE(pi.materials_share,     0.225) AS materials_share,
           COALESCE(pi.wages_share,         0.20)  AS wages_share,
           COALESCE(pi.blended_hourly_rate, 125)   AS blended_hourly_rate,
           COALESCE(pi.blended_hourly_wage, 37)    AS blended_hourly_wage,
           -- See app/inputs/page.tsx for rationale: planned totals via 70/30
           -- split of est_total_hours, not the dynamic to-date allowed.
           COALESCE(pi.rough_hours_est,     ROUND(p.est_total_hours * 0.70, 2)) AS rough_hours_est,
           COALESCE(pi.finish_hours_est,    ROUND(p.est_total_hours * 0.30, 2)) AS finish_hours_est
    FROM projects p
    LEFT JOIN project_inputs pi ON pi.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all();

  return Response.json(inputs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    project_id: number;
    gross_margin: number;
    materials_share: number;
    wages_share: number;
    blended_hourly_rate: number;
    blended_hourly_wage: number;
    rough_hours_est: number;
    finish_hours_est: number;
  };

  db.prepare(`
    INSERT INTO project_inputs
      (project_id, gross_margin, materials_share, wages_share,
       blended_hourly_rate, blended_hourly_wage, rough_hours_est, finish_hours_est)
    VALUES
      (@project_id, @gross_margin, @materials_share, @wages_share,
       @blended_hourly_rate, @blended_hourly_wage, @rough_hours_est, @finish_hours_est)
    ON CONFLICT(project_id) DO UPDATE SET
      gross_margin        = excluded.gross_margin,
      materials_share     = excluded.materials_share,
      wages_share         = excluded.wages_share,
      blended_hourly_rate = excluded.blended_hourly_rate,
      blended_hourly_wage = excluded.blended_hourly_wage,
      rough_hours_est     = excluded.rough_hours_est,
      finish_hours_est    = excluded.finish_hours_est,
      updated_at          = datetime('now')
  `).run(body);

  // Propagate derived budgets to the projects table so reads stay consistent.
  const project = db.prepare(
    "SELECT contract_value, stage, stage_completion FROM projects WHERE id = ?"
  ).get(body.project_id) as any;
  if (project) {
    const derived = deriveBudgets(project, body);
    db.prepare(`
      UPDATE projects SET
        est_total_hours      = @est_total_hours,
        rough_hours_allowed  = @rough_hours_allowed,
        finish_hours_allowed = @finish_hours_allowed,
        goal_hours           = @goal_hours,
        updated_at           = datetime('now')
      WHERE id = @id
    `).run({ ...derived, id: body.project_id });
  }

  return Response.json({ ok: true });
}
