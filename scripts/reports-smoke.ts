// Smoke test for the Daily Reports data layer (no API key, no auth needed).
// Usage: npx tsx scripts/reports-smoke.ts [--keep]
import db from "../lib/db";
import { findProject, resolveProject, listProjects } from "../lib/reports/projects";
import { rebuildFacts, searchFacts } from "../lib/reports/facts";
import { getReport, confirmedForDate, confirmedForProject, draftReports } from "../lib/reports/queries";
import { digestText, reportText, todayISO } from "../lib/reports/schema";

const keep = process.argv.includes("--keep");
const ok = (label: string, cond: unknown) => { console.log(cond ? "  ok  " : "  FAIL", label); if (!cond) process.exitCode = 1; };

console.log("projects:", listProjects().length, "today:", todayISO());
ok("findProject('Pyramid') exact", findProject("Pyramid")?.name === "Pyramid");
ok("findProject('the Pyramid job') normalizes", findProject("the Pyramid job")?.name === "Pyramid");
ok("findProject('Sherwood') ambiguous -> null", findProject("Sherwood") === null);
ok("findProject('sherwood 38') unique partial", findProject("sherwood 38")?.name === "Sherwood Lot 38");
ok("findProject('Monte Mar') ambiguous -> null", findProject("Monte Mar") === null);

const pyramid = findProject("Pyramid")!;
const link = resolveProject(null, "Pyramid house");
ok("resolveProject learns alias", link.project_id === pyramid.id && findProject("Pyramid house")?.id === pyramid.id);

const now = new Date().toISOString();
const ins = db.prepare(`INSERT INTO daily_reports
  (project_id, job_name, work_date, call_date, reporter, caller, source, transcript, status,
   accomplished, next_steps, blockers, materials, people, summary, extraction_notes, created_by, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const r1 = ins.run(pyramid.id, "Pyramid house", "2026-08-04", "2026-08-04", "TEST LEAD Carlos", "Cole", "paste",
  "[test transcript] Cole: how'd it go? Carlos: we hung the chandelier in the foyer, Saul helped. Tomorrow we trim the kitchen.",
  "confirmed",
  JSON.stringify(["Installed foyer chandelier (Carlos, Saul)"]), JSON.stringify(["Trim kitchen"]),
  "[]", JSON.stringify(["Need 4 more 6in cans"]), JSON.stringify(["Carlos","Saul"]),
  "Chandelier hung in foyer; kitchen trim tomorrow.", "", "smoke-test", now, now);
const r2 = ins.run(null, "Woods Drive", todayISO(), todayISO(), "TEST LEAD Fernando", "Taimez", "paste",
  "[test transcript] draft awaiting review", "draft", "[]","[]","[]","[]","[]", "", "Job \"Woods Drive\" did not match a Switchboard project. Pick one on this page before confirming.", "smoke-test", now, now);
const id1 = Number(r1.lastInsertRowid), id2 = Number(r2.lastInsertRowid);

rebuildFacts(getReport(id1)!);
rebuildFacts(getReport(id2)!);
const factCount = (db.prepare(`SELECT COUNT(*) c FROM daily_report_facts WHERE report_id = ?`).get(id1) as { c: number }).c;
ok("facts rebuilt for confirmed (3)", factCount === 3);
ok("no facts for draft", (db.prepare(`SELECT COUNT(*) c FROM daily_report_facts WHERE report_id = ?`).get(id2) as { c: number }).c === 0);

const hits = searchFacts("Did we ever install that chandelier at Pyramid?");
ok("FTS finds chandelier fact", hits.some((f) => f.report_id === id1 && /chandelier/i.test(f.text)));
ok("FTS people column searchable", searchFacts("what did Saul do").some((f) => f.report_id === id1));
ok("draft appears in inbox", draftReports().some((r) => r.id === id2));
ok("confirmedForDate", confirmedForDate("2026-08-04").some((r) => r.id === id1));
ok("confirmedForProject", confirmedForProject(pyramid.id).some((r) => r.id === id1));
console.log("\n--- reportText ---\n" + reportText(getReport(id1)!));
console.log("\n--- digest ---\n" + digestText("2026-08-04", confirmedForDate("2026-08-04")));

// unconfirm -> facts removed
db.prepare(`UPDATE daily_reports SET status='draft' WHERE id=?`).run(id1);
rebuildFacts(getReport(id1)!);
ok("facts removed on unconfirm", (db.prepare(`SELECT COUNT(*) c FROM daily_report_facts WHERE report_id = ?`).get(id1) as { c: number }).c === 0);
db.prepare(`UPDATE daily_reports SET status='confirmed' WHERE id=?`).run(id1);
rebuildFacts(getReport(id1)!);

if (!keep) {
  db.prepare(`DELETE FROM daily_reports WHERE created_by='smoke-test'`).run();
  ok("cascade deleted facts", (db.prepare(`SELECT COUNT(*) c FROM daily_report_facts`).get() as { c: number }).c === 0);
  db.prepare(`UPDATE projects SET aliases='[]' WHERE id=?`).run(pyramid.id);
  console.log("cleaned up");
} else {
  console.log(`kept test reports #${id1} (confirmed, Pyramid 2026-08-04) and #${id2} (draft, unlinked)`);
}
