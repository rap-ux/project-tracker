export const dynamic = 'force-dynamic';
import { auth }          from "@/auth";
import db                 from "@/lib/db";
import { calcIncentive }  from "@/lib/incentive";
import type { IncentiveResult } from "@/lib/incentive";
import { rollupDivision } from "@/lib/qboSync";
import { redirect }       from "next/navigation";
import Navbar             from "@/components/Navbar";
import InsightsReport     from "@/components/InsightsReport";

export interface ProjectData {
  id: number; name: string; foreman: string; stage: string;
  stage_completion: number; project_completion: number;
  contract_value: number; total_invoiced: number;
  est_materials_budget: number; actual_materials: number; unrecorded_materials: number;
  est_total_hours: number; actual_total_hours: number; unrecorded_hours: number;
  goal_hours: number;
  rough_hours_allowed: number; rough_hours_actual: number;
  finish_hours_allowed: number; finish_hours_actual: number;
  is_async: number;
  // computed
  effectiveMaterials: number; effectiveHours: number;
  outsideLaborHours: number;
  avRevenue: number; electricRevenue: number; unknownRevenue: number;
  invoicedPct: number; materialsPct: number; materialsRemaining: number;
  hoursTobudgetPct: number; varianceHours: number; variancePct: number;
  hoursRemainingProject: number;
  incentive: IncentiveResult;
}

export interface PortfolioData {
  totalProjects: number;
  totalContractValue: number; totalInvoiced: number;
  totalEstMaterials: number; totalActualMaterials: number;
  totalEstHours: number; totalActualHours: number;
  underBudgetCount: number; overBudgetCount: number;
  earlyCount: number; roughCompleteCount: number; inFinishCount: number;
}

export default async function ReportPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role  = (session.user as any).role;
  const email = session.user?.email ?? "";
  // Report page is restricted to Rafael only
  if (email !== "rap@totallywiredelectric.com") redirect("/");
  if (role !== "owner" && role !== "admin") redirect("/dashboard");

  const raw = db.prepare(
    "SELECT * FROM projects WHERE is_pipeline = 0 ORDER BY foreman, name"
  ).all() as any[];

  // QBO enrichments: outside-labor hours from outsource-vendor bills, and the
  // AV/electric revenue split from tagged estimates (+ orphan invoices).
  const outsideByProject = new Map<number, number>();
  for (const r of db.prepare(`
    SELECT project_id, SUM(derived_hours) AS hrs
    FROM qbo_bills WHERE is_outside_labor = 1 AND project_id IS NOT NULL
    GROUP BY project_id
  `).all() as any[]) outsideByProject.set(r.project_id, r.hrs || 0);

  const estByProject = new Map<number, any[]>();
  for (const r of db.prepare(
    "SELECT project_id, total, division, division_override, av_pct, electric_pct FROM qbo_estimates WHERE project_id IS NOT NULL"
  ).all() as any[]) {
    (estByProject.get(r.project_id) ?? estByProject.set(r.project_id, []).get(r.project_id)!).push(r);
  }
  const invByProject = new Map<number, any[]>();
  for (const r of db.prepare(
    "SELECT project_id, total, division, division_override, av_pct, electric_pct, linked_estimate_qbo_id FROM qbo_invoices WHERE project_id IS NOT NULL"
  ).all() as any[]) {
    (invByProject.get(r.project_id) ?? invByProject.set(r.project_id, []).get(r.project_id)!).push(r);
  }

  const projects: ProjectData[] = raw.map(p => {
    const effectiveMaterials = (p.actual_materials || 0) + (p.unrecorded_materials || 0);
    const effectiveHours     = (p.actual_total_hours || 0) + (p.unrecorded_hours || 0);
    const outsideLaborHours  = outsideByProject.get(p.id) ?? 0;
    const split = rollupDivision(estByProject.get(p.id) ?? [], invByProject.get(p.id) ?? []);
    const incentive = calcIncentive(
      p.goal_hours || 0, effectiveHours, p.contract_value || 0,
      p.stage, p.stage_completion || 0,
      p.rough_hours_allowed || 0, p.rough_hours_actual || 0,
      p.finish_hours_allowed || 0, p.finish_hours_actual || 0,
    );
    return {
      ...p, effectiveMaterials, effectiveHours, outsideLaborHours,
      avRevenue: split.av, electricRevenue: split.electric, unknownRevenue: split.unknown,
      invoicedPct:          p.contract_value > 0         ? (p.total_invoiced || 0) / p.contract_value : 0,
      materialsPct:         p.est_materials_budget > 0   ? effectiveMaterials / p.est_materials_budget : 0,
      materialsRemaining:   (p.est_materials_budget || 0) - effectiveMaterials,
      hoursTobudgetPct:     p.est_total_hours > 0        ? effectiveHours / p.est_total_hours : 0,
      varianceHours:        p.goal_hours > 0             ? (p.goal_hours || 0) - effectiveHours : 0,
      variancePct:          p.goal_hours > 0             ? ((p.goal_hours || 0) - effectiveHours) / p.goal_hours : 0,
      hoursRemainingProject:(p.est_total_hours || 0) - effectiveHours,
      incentive,
    };
  });

  const early      = (p: ProjectData) => p.incentive.rough.status === "too-early" || p.stage === "Contracting Phase";
  // Async-flagged jobs (AV/electric phases out of sync, e.g. Jim Bridger) are
  // excluded from over/under judgment — their hours-vs-progress ratio lies.
  const assessable = projects.filter(p => !early(p) && !p.is_async);

  const portfolio: PortfolioData = {
    totalProjects:      projects.length,
    totalContractValue: projects.reduce((s, p) => s + (p.contract_value || 0), 0),
    totalInvoiced:      projects.reduce((s, p) => s + (p.total_invoiced || 0), 0),
    totalEstMaterials:  projects.reduce((s, p) => s + (p.est_materials_budget || 0), 0),
    totalActualMaterials: projects.reduce((s, p) => s + p.effectiveMaterials, 0),
    totalEstHours:      projects.reduce((s, p) => s + (p.est_total_hours || 0), 0),
    totalActualHours:   projects.reduce((s, p) => s + p.effectiveHours, 0),
    underBudgetCount:   assessable.filter(p => p.variancePct >= 0).length,
    overBudgetCount:    assessable.filter(p => p.variancePct < 0).length,
    earlyCount:         projects.filter(early).length,
    roughCompleteCount: projects.filter(p => p.stage === "Finish" || p.stage === "Extras" || (p.stage === "Rough" && p.stage_completion >= 1)).length,
    inFinishCount:      projects.filter(p => p.stage === "Finish" || p.stage === "Extras").length,
  };

  return (
    <div className="min-h-screen flex flex-col bg-surface-2 print:bg-surface">
      <div className="print:hidden">
        <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      </div>
      <InsightsReport
        projects={projects}
        portfolio={portfolio}
        generatedAt={new Date().toISOString()}
        userName={session.user?.name ?? "Rap"}
      />
    </div>
  );
}
