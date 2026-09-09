// Job resolution: loose names heard on calls -> a Switchboard `projects` row.
// The projects table is the job registry; `projects.aliases` (JSON string[])
// remembers each loose spelling so it resolves next time. Never creates projects.
import db from "@/lib/db";
import { parseList } from "./schema";

export interface ProjectOption {
  id: number;
  name: string;
  foreman: string;
  stage: string;
  is_pipeline: number;
  aliases: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(the|job|project|house|residence|site|lot)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function listProjects(): ProjectOption[] {
  const rows = db
    .prepare(`SELECT id, name, foreman, stage, is_pipeline, aliases FROM projects ORDER BY is_pipeline, name`)
    .all() as Array<Omit<ProjectOption, "aliases"> & { aliases: string }>;
  return rows.map((r) => ({ ...r, aliases: parseList(r.aliases) }));
}

/**
 * Find a project by canonical name or alias. Exact normalized match first,
 * then a unique "contains" match (so "Pyramid" finds "Pyramid" but "Sherwood"
 * does not pick one of five Sherwood lots). Returns null when ambiguous.
 */
export function findProject(name: string): ProjectOption | null {
  const n = norm(name);
  if (!n) return null;
  const all = listProjects();
  for (const p of all) {
    if (norm(p.name) === n) return p;
    if (p.aliases.some((a) => norm(a) === n)) return p;
  }
  const partial = all.filter(
    (p) => norm(p.name).includes(n) || p.aliases.some((a) => norm(a).includes(n)),
  );
  return partial.length === 1 ? partial[0] : null;
}

/** Remember a loose spelling on the project so it resolves next time. */
export function addAlias(projectId: number, heard: string): void {
  const h = heard.trim();
  if (!h) return;
  const row = db.prepare(`SELECT name, aliases FROM projects WHERE id = ?`).get(projectId) as
    | { name: string; aliases: string }
    | undefined;
  if (!row) return;
  if (norm(row.name) === norm(h)) return;
  const aliases = parseList(row.aliases);
  if (aliases.some((a) => norm(a) === norm(h))) return;
  db.prepare(`UPDATE projects SET aliases = ? WHERE id = ?`).run(JSON.stringify([...aliases, h]), projectId);
}

/**
 * Resolve the intake form's (projectId?, jobName) pair.
 * - projectId given: link to it and learn jobName as an alias.
 * - else: try to match jobName; if unique match, link and learn; else unlinked.
 */
export function resolveProject(projectId: number | null, jobName: string): { project_id: number | null; project_name: string | null } {
  if (projectId) {
    addAlias(projectId, jobName);
    const row = db.prepare(`SELECT name FROM projects WHERE id = ?`).get(projectId) as { name: string } | undefined;
    return { project_id: row ? projectId : null, project_name: row?.name ?? null };
  }
  const found = findProject(jobName);
  if (found) {
    addAlias(found.id, jobName);
    return { project_id: found.id, project_name: found.name };
  }
  return { project_id: null, project_name: null };
}
