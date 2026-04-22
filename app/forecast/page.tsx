export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import { auth }      from "@/auth";
import db            from "@/lib/db";
import Navbar        from "@/components/Navbar";
import ForecastClient from "@/components/ForecastClient";

export default async function ForecastPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  // ── Pull base projects ─────────────────────────────────────────────────────
  const projects = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.stage,
           p.contract_value, p.total_invoiced,
           p.stage_completion, p.project_completion,
           p.is_pipeline,
           COALESCE(fp.designation, 'S')        AS designation,
           fp.underground_start AS ug_override,
           fp.rough_start       AS rs_override,
           fp.rough_completion  AS rc_override,
           fp.finish_start      AS fs_override,
           fp.finish_completion AS fc_override,
           fp.payment_notes,
           fp.remaining_value   AS remaining_override
    FROM projects p
    LEFT JOIN forecast_projects fp ON fp.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all() as any[];

  // ── Pull stage dates from Timeline's project_stages ────────────────────────
  const stages = db.prepare(`
    SELECT project_id, stage, start_date, end_date
    FROM project_stages
  `).all() as any[];

  // Index stage dates by project_id + stage
  const stageMap: Record<number, Record<string, { start: string | null; end: string | null }>> = {};
  for (const s of stages) {
    if (!stageMap[s.project_id]) stageMap[s.project_id] = {};
    stageMap[s.project_id][s.stage] = { start: s.start_date, end: s.end_date };
  }

  // ── Merge: Timeline dates as defaults, forecast_projects overrides if set ──
  const rows = projects.map(p => {
    const st = stageMap[p.id] ?? {};

    // Default from Timeline, override from forecast_projects if present
    const underground_start = p.ug_override ?? st["Underground"]?.start ?? null;
    const rough_start       = p.rs_override ?? st["Rough"]?.start       ?? null;
    const rough_completion  = p.rc_override ?? st["Rough"]?.end         ?? null;
    const finish_start      = p.fs_override ?? st["Finish"]?.start      ?? null;
    const finish_completion = p.fc_override ?? st["Finish"]?.end        ?? null;

    // Which fields were inherited from Timeline (no override)
    const sources = {
      underground_start: p.ug_override ? "override" : st["Underground"]?.start ? "timeline" : null,
      rough_start:       p.rs_override ? "override" : st["Rough"]?.start       ? "timeline" : null,
      rough_completion:  p.rc_override ? "override" : st["Rough"]?.end         ? "timeline" : null,
      finish_start:      p.fs_override ? "override" : st["Finish"]?.start      ? "timeline" : null,
      finish_completion: p.fc_override ? "override" : st["Finish"]?.end        ? "timeline" : null,
    };

    const remaining_value =
      p.remaining_override != null
        ? p.remaining_override
        : (p.contract_value ?? 0) - (p.total_invoiced ?? 0);

    return {
      id:                 p.id,
      name:               p.name,
      foreman:            p.foreman,
      stage:              p.stage,
      contract_value:     p.contract_value,
      total_invoiced:     p.total_invoiced,
      stage_completion:   p.stage_completion,
      project_completion: p.project_completion,
      is_pipeline:        p.is_pipeline,
      designation:        p.designation,
      payment_notes:      p.payment_notes,
      remaining_value,
      underground_start,
      rough_start,
      rough_completion,
      finish_start,
      finish_completion,
      sources,
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <ForecastClient rows={rows} role={role} />
    </div>
  );
}
