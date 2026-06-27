export const dynamic = 'force-dynamic';
import { redirect }    from "next/navigation";
import { auth }         from "@/auth";
import db               from "@/lib/db";
import { calcIncentive } from "@/lib/incentive";
import Navbar           from "@/components/Navbar";
import DashboardClient  from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  // Active = has QBO financial data; pipeline = upcoming / pre-contract
  const activeRaw   = db.prepare("SELECT * FROM projects WHERE is_pipeline = 0 ORDER BY foreman, name").all() as any[];
  const pipelineRaw = db.prepare("SELECT * FROM projects WHERE is_pipeline = 1 ORDER BY foreman, name").all() as any[];

  // project_inputs for profitability calc (blended_hourly_wage, gross_margin)
  const inputsRaw = db.prepare("SELECT * FROM project_inputs").all() as any[];
  const inputsByProject: Record<number, any> = {};
  for (const pi of inputsRaw) inputsByProject[pi.project_id] = pi;
  const uploads     = db.prepare("SELECT * FROM uploads ORDER BY uploaded_at DESC LIMIT 5").all() as any[];

  // Stage data keyed by project_id
  const stagesRaw = db.prepare(`
    SELECT project_id, stage, start_date, end_date, status, notes
    FROM project_stages
    ORDER BY project_id,
      CASE stage
        WHEN 'Contracting Phase' THEN 1
        WHEN 'Underground'       THEN 2
        WHEN 'Rough'             THEN 3
        WHEN 'Finish'            THEN 4
        WHEN 'Extras'            THEN 5
        ELSE 6
      END
  `).all() as any[];
  const stagesByProject: Record<number, any[]> = {};
  for (const s of stagesRaw) {
    if (!stagesByProject[s.project_id]) stagesByProject[s.project_id] = [];
    stagesByProject[s.project_id].push(s);
  }

  // KPIs from active projects only
  // "effective" totals include manually-entered off-book values
  const totalContractValue = activeRaw.reduce((s, p) => s + (p.contract_value     || 0), 0);
  const totalInvoiced      = activeRaw.reduce((s, p) => s + (p.total_invoiced      || 0), 0);
  const totalActualMat     = activeRaw.reduce((s, p) => s + (p.actual_materials || 0) + (p.unrecorded_materials || 0), 0);
  const totalEstMat        = activeRaw.reduce((s, p) => s + (p.est_materials_budget || 0), 0);
  const totalActualHours   = activeRaw.reduce((s, p) => s + (p.actual_total_hours || 0) + (p.unrecorded_hours || 0), 0);
  const totalEstHours      = activeRaw.reduce((s, p) => s + (p.est_total_hours      || 0), 0);

  const projectsWithIncentive = activeRaw.map(p => {
    const effectiveMaterials = (p.actual_materials   || 0) + (p.unrecorded_materials || 0);
    const effectiveHours     = (p.actual_total_hours || 0) + (p.unrecorded_hours     || 0);
    const pi = inputsByProject[p.id];
    return {
      ...p,
      effectiveMaterials,
      effectiveHours,
      blended_hourly_wage: pi?.blended_hourly_wage ?? 37,
      incentive: calcIncentive(
        p.goal_hours,
        effectiveHours,
        p.contract_value,
        p.stage,
        p.stage_completion,
        p.rough_hours_allowed  ?? 0,
        p.rough_hours_actual   ?? 0,
        p.finish_hours_allowed ?? 0,
        p.finish_hours_actual  ?? 0,
      ),
    };
  });

  const flaggedProjects = projectsWithIncentive.filter(p =>
    p.incentive.projectStatus.key === "critical" ||
    p.incentive.projectStatus.key === "at-risk"
  );

  const kpis = { totalContractValue, totalInvoiced, totalActualMat, totalEstMat, totalActualHours, totalEstHours };

  // When the financial data was last refreshed (latest applied sync, else latest upload).
  const lastSyncRow = db.prepare(`
    SELECT MAX(ts) AS ts FROM (
      SELECT applied_at AS ts FROM import_batches WHERE status = 'applied'
      UNION ALL
      SELECT uploaded_at AS ts FROM uploads
    )
  `).get() as { ts: string | null };
  const lastSync = lastSyncRow?.ts ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-bg theme-fade">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <DashboardClient
        projects={projectsWithIncentive}
        pipeline={pipelineRaw}
        kpis={kpis}
        flagged={flaggedProjects}
        uploads={uploads}
        role={role}
        userEmail={session.user?.email ?? undefined}
        stagesByProject={stagesByProject}
        lastSync={lastSync}
      />
    </div>
  );
}
