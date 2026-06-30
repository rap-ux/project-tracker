export const dynamic = 'force-dynamic';
import { redirect }      from "next/navigation";
import { auth }           from "@/auth";
import db                  from "@/lib/db";
import { calcIncentive }   from "@/lib/incentive";
import Navbar              from "@/components/Navbar";
import ProjectDetailClient from "@/components/ProjectDetailClient";

type Ctx = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Ctx) {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  const { id } = await params;
  const projectId = parseInt(id);

  const raw = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
  if (!raw) redirect(role === "foreman" ? "/foreman" : "/dashboard");

  // Foremen can only view their own projects (same matching rule as /foreman).
  const foremanName = (session.user as any).foremanName as string | undefined;
  if (role === "foreman" && foremanName && !String(raw.foreman ?? "").includes(foremanName)) {
    redirect("/foreman");
  }

  const pi = db.prepare("SELECT * FROM project_inputs WHERE project_id = ?").get(projectId) as any;
  const effectiveMaterials = (raw.actual_materials   || 0) + (raw.unrecorded_materials || 0);
  const effectiveHours     = (raw.actual_total_hours || 0) + (raw.unrecorded_hours     || 0);

  const project = {
    ...raw,
    effectiveMaterials,
    effectiveHours,
    blended_hourly_wage: pi?.blended_hourly_wage ?? 37,
    incentive: raw.is_pipeline ? null : calcIncentive(
      raw.goal_hours, effectiveHours, raw.contract_value, raw.stage, raw.stage_completion,
      raw.rough_hours_allowed  ?? 0, raw.rough_hours_actual  ?? 0,
      raw.finish_hours_allowed ?? 0, raw.finish_hours_actual ?? 0,
    ),
  };

  const stages = db.prepare(`
    SELECT project_id, stage, start_date, end_date, status, notes
    FROM project_stages WHERE project_id = ?
    ORDER BY CASE stage
      WHEN 'Contracting Phase' THEN 1 WHEN 'Underground' THEN 2
      WHEN 'Rough' THEN 3 WHEN 'Finish' THEN 4 WHEN 'Extras' THEN 5 ELSE 6
    END
  `).all(projectId) as any[];

  const foremen = db.prepare(
    "SELECT DISTINCT foreman FROM projects WHERE foreman IS NOT NULL AND foreman != ''"
  ).all() as { foreman: string }[];
  const availableUsers = Array.from(new Set([
    ...foremen.map(f => f.foreman), "Rafael", "Cole", "Nicole",
  ])).sort();

  return (
    <div className="min-h-screen flex flex-col bg-bg theme-fade">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <ProjectDetailClient
        project={project}
        stages={stages}
        availableUsers={availableUsers}
        role={role}
        userEmail={session.user?.email ?? undefined}
      />
    </div>
  );
}
