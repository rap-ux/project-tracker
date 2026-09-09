// Facts: one row per bullet of a confirmed report, indexed with FTS5.
// Rebuilt every time a report is saved, so edits on the review page flow through.
// Ask searches facts first, then sends only the matching reports to the model.
import db from "@/lib/db";
import { parseList, type Fact, type FactCategory, type Report } from "./schema";

export function rebuildFacts(r: Report): void {
  const del = db.prepare(`DELETE FROM daily_report_facts WHERE report_id = ?`);
  const ins = db.prepare(
    `INSERT INTO daily_report_facts (report_id, project_id, job_name, work_date, category, text, people)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const jobName = r.project_name || r.job_name;
  db.transaction(() => {
    del.run(r.id);
    if (r.status !== "confirmed") return;
    const push = (category: FactCategory, s: string) => {
      for (const text of parseList(s)) ins.run(r.id, r.project_id, jobName, r.work_date, category, text, r.people);
    };
    push("done", r.accomplished);
    push("next", r.next_steps);
    push("blocked", r.blockers);
    push("needs", r.materials);
  })();
}

const STOP = new Set(
  (
    "a an the and or of to in on at for we did ever is was were be been do does have has had that this those these it its " +
    "our us they them with by from about what when where who how any some there here get got yet still already job jobs " +
    "report reports day today yesterday week last"
  ).split(" "),
);

/** Full-text search over facts. Terms are OR'd so loose questions still hit; bm25 ranks. */
export function searchFacts(question: string, limit = 80): Fact[] {
  const terms = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 2 && !STOP.has(t)),
    ),
  );
  if (!terms.length) return [];
  const query = terms.map((t) => `"${t}"*`).join(" OR ");
  const ids = db
    .prepare(`SELECT rowid FROM daily_report_facts_fts WHERE daily_report_facts_fts MATCH ? ORDER BY bm25(daily_report_facts_fts) LIMIT ?`)
    .all(query, limit) as { rowid: number }[];
  if (!ids.length) return [];
  const list = ids.map((r) => r.rowid);
  const rows = db
    .prepare(`SELECT * FROM daily_report_facts WHERE id IN (${list.map(() => "?").join(",")})`)
    .all(...list) as Fact[];
  // keep bm25 order
  const rank = new Map(list.map((id, i) => [id, i]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
}
