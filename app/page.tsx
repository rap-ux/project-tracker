export const dynamic = 'force-dynamic';
import { redirect }     from "next/navigation";
import { auth }          from "@/auth";
import db                from "@/lib/db";
import Navbar            from "@/components/Navbar";
import HomeClient        from "@/components/HomeClient";
import { calcIncentive } from "@/lib/incentive";

const MILESTONES = [
  { key: "underground_start", pct: 0.10 },
  { key: "rough_start",       pct: 0.25 },
  { key: "rough_completion",  pct: 0.25 },
  { key: "finish_start",      pct: 0.30 },
  { key: "finish_completion", pct: 0.10 },
] as const;

function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d;
}

export default async function Home() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  // ── Active projects with incentive/status ──────────────────────────────────
  const projectsRaw = db.prepare(`
    SELECT p.*,
           COALESCE(pi.blended_hourly_wage, 37) AS blended_hourly_wage
    FROM projects p
    LEFT JOIN project_inputs pi ON pi.project_id = p.id
    WHERE p.is_pipeline = 0
  `).all() as any[];

  const stages = db.prepare(`
    SELECT project_id, stage, start_date, end_date FROM project_stages
  `).all() as any[];
  const stageMap: Record<number, Record<string, { start: string | null; end: string | null }>> = {};
  for (const s of stages) {
    if (!stageMap[s.project_id]) stageMap[s.project_id] = {};
    stageMap[s.project_id][s.stage] = { start: s.start_date, end: s.end_date };
  }

  const projects = projectsRaw.map(p => {
    const effMat   = (p.actual_materials ?? 0) + (p.unrecorded_materials ?? 0);
    const effHours = (p.actual_total_hours ?? 0) + (p.unrecorded_hours ?? 0);
    return {
      ...p,
      effectiveMaterials: effMat,
      effectiveHours:     effHours,
      matPct: p.est_materials_budget > 0 ? effMat / p.est_materials_budget : 0,
      incentive: calcIncentive(
        p.goal_hours, effHours, p.contract_value, p.stage, p.stage_completion,
        p.rough_hours_allowed  ?? 0, p.rough_hours_actual   ?? 0,
        p.finish_hours_allowed ?? 0, p.finish_hours_actual  ?? 0,
      ),
    };
  });

  const flagged = projects.filter(p =>
    p.incentive.projectStatus.key === "critical" ||
    p.incentive.projectStatus.key === "at-risk"
  );
  const watch   = projects.filter(p => p.incentive.projectStatus.key === "watch");
  const onTrack = projects.filter(p =>
    p.incentive.projectStatus.key === "on-track" ||
    p.incentive.projectStatus.key === "ahead"
  );

  // ── Upcoming cash (next 30 days) via milestones from Timeline ──────────────
  const today      = new Date();
  const horizon    = addDays(today, 30);
  let upcomingCash = 0;
  const upcomingMilestones: Array<{ name: string; milestone: string; receiveDate: Date; amount: number }> = [];

  for (const p of projects) {
    const st = stageMap[p.id] ?? {};
    const milestoneDates = {
      underground_start: st["Underground"]?.start,
      rough_start:       st["Rough"]?.start,
      rough_completion:  st["Rough"]?.end,
      finish_start:      st["Finish"]?.start,
      finish_completion: st["Finish"]?.end,
    };
    for (const m of MILESTONES) {
      const d = (milestoneDates as any)[m.key];
      if (!d) continue;
      const msDate = new Date(d + "T00:00:00");
      const receive = addDays(msDate, 30); // +30 day receipt delay
      if (receive > today && receive <= horizon) {
        const amt = (p.contract_value ?? 0) * m.pct;
        upcomingCash += amt;
        upcomingMilestones.push({
          name:      p.name,
          milestone: m.key.replace(/_/g, " "),
          receiveDate: receive,
          amount: amt,
        });
      }
    }
  }

  upcomingMilestones.sort((a, b) => a.receiveDate.getTime() - b.receiveDate.getTime());

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totalContractValue = projects.reduce((s, p) => s + (p.contract_value ?? 0), 0);
  const totalInvoiced      = projects.reduce((s, p) => s + (p.total_invoiced  ?? 0), 0);
  const avgMatBurn = projects.length > 0
    ? projects.reduce((s, p) => s + (p.matPct || 0), 0) / projects.length
    : 0;
  const avgHoursVsGoal = (() => {
    const relevant = projects.filter(p => (p.goal_hours ?? 0) > 0);
    if (relevant.length === 0) return 0;
    return relevant.reduce((s, p) => s + ((p.effectiveHours - p.goal_hours) / p.goal_hours), 0) / relevant.length;
  })();

  // ── Recent activity ────────────────────────────────────────────────────────
  const recentActivity = db.prepare(`
    SELECT a.id, a.user_name, a.action, a.details, a.created_at,
           p.name AS project_name
    FROM project_activity a
    JOIN projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC
    LIMIT 10
  `).all() as Array<{ id: number; user_name: string; action: string; details: string | null; created_at: string; project_name: string }>;

  // ── @mentions for current user ─────────────────────────────────────────────
  const userName  = session.user?.name ?? "";
  const firstName = userName.split(" ")[0] ?? "";
  const mentions = (firstName
    ? db.prepare(`
        SELECT c.id, c.body, c.user_name, c.created_at, p.name AS project_name
        FROM project_comments c
        JOIN projects p ON p.id = c.project_id
        WHERE ',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?
           OR ',' || REPLACE(c.mentions, ', ', ',') || ',' LIKE ?
        ORDER BY c.created_at DESC LIMIT 5
      `).all(`%,${firstName},%`, `%,${userName},%`)
    : []) as Array<{ id: number; body: string; user_name: string; created_at: string; project_name: string }>;

  // ── QBO staleness ──────────────────────────────────────────────────────────
  const latestUpload = db.prepare(
    "SELECT uploaded_at FROM uploads ORDER BY uploaded_at DESC LIMIT 1"
  ).get() as { uploaded_at: string } | undefined;
  const qboDays = latestUpload
    ? Math.floor((Date.now() - new Date(latestUpload.uploaded_at.replace(" ", "T") + "Z").getTime()) / 86400000)
    : null;

  const data = {
    userName,
    totals: {
      flagged:           flagged.length,
      watch:             watch.length,
      onTrack:           onTrack.length,
      activeProjects:    projects.length,
      totalContractValue,
      totalInvoiced,
      upcomingCash,
      avgMatBurn,
      avgHoursVsGoal,
      qboDays,
    },
    flaggedList: flagged.slice(0, 5).map(p => ({
      id:       p.id,
      name:     p.name,
      foreman:  p.foreman,
      status:   p.incentive.projectStatus,
      highlight:p.incentive.highlight,
    })),
    upcomingMilestones: upcomingMilestones.slice(0, 5).map(m => ({
      ...m,
      receiveDate: m.receiveDate.toISOString().slice(0, 10),
    })),
    recentActivity,
    mentions,
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <HomeClient data={data} />
    </div>
  );
}
