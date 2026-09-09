// Read queries for Daily Reports. Writes live in actions.ts / facts.ts.
import db from "@/lib/db";
import type { Report } from "./schema";

const SELECT = `
  SELECT r.*, p.name AS project_name
  FROM daily_reports r
  LEFT JOIN projects p ON p.id = r.project_id
`;

export function getReport(id: number): Report | null {
  return (db.prepare(`${SELECT} WHERE r.id = ?`).get(id) as Report | undefined) ?? null;
}

export function reportsByIds(ids: number[]): Report[] {
  if (!ids.length) return [];
  return db
    .prepare(`${SELECT} WHERE r.id IN (${ids.map(() => "?").join(",")}) ORDER BY r.work_date DESC, r.id DESC`)
    .all(...ids) as Report[];
}

export function draftReports(): Report[] {
  return db.prepare(`${SELECT} WHERE r.status = 'draft' ORDER BY r.call_date DESC, r.id DESC`).all() as Report[];
}

export function recentConfirmed(limit = 30): Report[] {
  return db
    .prepare(`${SELECT} WHERE r.status = 'confirmed' ORDER BY r.work_date DESC, r.id DESC LIMIT ?`)
    .all(limit) as Report[];
}

export function confirmedForDate(date: string): Report[] {
  return db
    .prepare(`${SELECT} WHERE r.status = 'confirmed' AND r.work_date = ? ORDER BY p.name, r.job_name, r.id`)
    .all(date) as Report[];
}

export function confirmedForProject(projectId: number): Report[] {
  return db
    .prepare(`${SELECT} WHERE r.status = 'confirmed' AND r.project_id = ? ORDER BY r.work_date DESC, r.id DESC`)
    .all(projectId) as Report[];
}

/** Dates that have at least one confirmed report, newest first (for the Today picker). */
export function datesWithReports(limit = 30): Array<{ work_date: string; n: number }> {
  return db
    .prepare(
      `SELECT work_date, COUNT(*) AS n FROM daily_reports WHERE status = 'confirmed'
       GROUP BY work_date ORDER BY work_date DESC LIMIT ?`,
    )
    .all(limit) as Array<{ work_date: string; n: number }>;
}

/** Per-project counts for the jobs index. */
export function projectReportCounts(): Array<{ project_id: number; name: string; n: number; last: string }> {
  return db
    .prepare(
      `SELECT r.project_id, p.name, COUNT(*) AS n, MAX(r.work_date) AS last
       FROM daily_reports r JOIN projects p ON p.id = r.project_id
       WHERE r.status = 'confirmed'
       GROUP BY r.project_id ORDER BY last DESC`,
    )
    .all() as Array<{ project_id: number; name: string; n: number; last: string }>;
}

/** Distinct reporter names seen so far, for the intake form's suggestions. */
export function knownReporters(): string[] {
  const seeded = ["Fernando Trinidad", "Donaciano Silva"];
  const rows = db.prepare(`SELECT DISTINCT reporter FROM daily_reports`).all() as { reporter: string }[];
  return Array.from(new Set([...seeded, ...rows.map((r) => r.reporter)])).sort();
}
