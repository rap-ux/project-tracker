export const dynamic = 'force-dynamic';
import { redirect }   from "next/navigation";
import { auth }        from "@/auth";
import db              from "@/lib/db";
import Navbar          from "@/components/Navbar";
import BonusesClient   from "@/components/BonusesClient";
import { calcIncentive, getBonusTier } from "@/lib/incentive";

export default async function BonusesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  const projectsRaw = db.prepare(`
    SELECT id, name, foreman, stage, stage_completion, project_completion,
           contract_value, goal_hours, actual_total_hours, unrecorded_hours,
           rough_hours_allowed, rough_hours_actual,
           finish_hours_allowed, finish_hours_actual,
           is_pipeline
    FROM projects
    WHERE is_pipeline = 0
    ORDER BY foreman, name
  `).all() as any[];

  const projects = projectsRaw.map(p => {
    const effHours = (p.actual_total_hours ?? 0) + (p.unrecorded_hours ?? 0);
    const inc = calcIncentive(
      p.goal_hours, effHours, p.contract_value, p.stage, p.stage_completion,
      p.rough_hours_allowed  ?? 0, p.rough_hours_actual   ?? 0,
      p.finish_hours_allowed ?? 0, p.finish_hours_actual  ?? 0,
    );
    return {
      id:                 p.id,
      name:               p.name,
      foreman:            p.foreman,
      stage:              p.stage,
      stage_completion:   p.stage_completion,
      project_completion: p.project_completion,
      contract_value:     p.contract_value,
      effective_hours:    effHours,
      goal_hours:         p.goal_hours,
      tier:               getBonusTier(p.contract_value ?? 0),
      inc,
    };
  });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <BonusesClient projects={projects} />
    </div>
  );
}
