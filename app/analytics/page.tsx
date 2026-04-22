export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import { auth }      from "@/auth";
import db            from "@/lib/db";
import Navbar        from "@/components/Navbar";
import AnalyticsClient from "@/components/AnalyticsClient";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  // Active projects with inputs for blended wage
  const projects = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.stage, p.stage_completion, p.project_completion,
           p.contract_value, p.total_invoiced,
           p.actual_materials, p.unrecorded_materials, p.est_materials_budget,
           p.actual_total_hours, p.unrecorded_hours, p.goal_hours, p.est_total_hours,
           p.updated_at, p.builder,
           COALESCE(pi.blended_hourly_wage, 37) AS blended_hourly_wage,
           COALESCE(pi.gross_margin, 0.575)     AS gross_margin
    FROM projects p
    LEFT JOIN project_inputs pi ON pi.project_id = p.id
    WHERE p.is_pipeline = 0
  `).all() as any[];

  // Completed project_stages for finish date sorting
  const completionStages = db.prepare(`
    SELECT project_id, end_date FROM project_stages
    WHERE stage = 'Finish' AND status = 'Complete' AND end_date IS NOT NULL
  `).all() as any[];

  const finishDateByProject: Record<number, string> = {};
  for (const s of completionStages) finishDateByProject[s.project_id] = s.end_date;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} />
      <AnalyticsClient projects={projects} finishDateByProject={finishDateByProject} />
    </div>
  );
}
