export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import { auth }      from "@/auth";
import db            from "@/lib/db";
import Navbar        from "@/components/Navbar";
import TimelineClient from "@/components/TimelineClient";

export default async function TimelinePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  const projects = db.prepare(`
    SELECT p.*,
           fp.underground_start, fp.rough_start, fp.rough_completion,
           fp.finish_start, fp.finish_completion
    FROM projects p
    LEFT JOIN forecast_projects fp ON fp.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all() as any[];

  // Fetch all project_stages rows, keyed by project_id
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

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} />
      <TimelineClient projects={projects} stagesByProject={stagesByProject} />
    </div>
  );
}
