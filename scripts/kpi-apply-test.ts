// End-to-end test of new-project creation via the sync path, on the LOCAL db.
// Stages the KPI csv, applies every row, verifies, then reverts + deletes the
// created projects so the local db is left as it was. Usage:
//   npx tsx scripts/kpi-apply-test.ts "<KPIs csv>"
import fs from "fs";
import Papa from "papaparse";
import db from "../lib/db";
import { applyStagedChanges, createBatch, stageColumnGrid, type StagedChangeRow } from "../lib/importer";

const ok = (label: string, cond: unknown, extra = "") => { console.log(cond ? "  ok  " : "  FAIL", label, extra); if (!cond) process.exitCode = 1; };
const grid = Papa.parse<string[]>(fs.readFileSync(process.argv[2], "utf8"), { skipEmptyLines: false }).data;

const before = (db.prepare("SELECT COUNT(*) c FROM projects").get() as { c: number }).c;
const snapshot = db.prepare("SELECT * FROM projects").all() as any[];

const staged = stageColumnGrid(grid);
console.log(`staged ${staged.changes.length} changes; new: ${staged.newProjects.length}; activated: ${staged.activated.join(", ")}`);
ok("7 new projects staged", staged.newProjects.length === 7, staged.newProjects.join(", "));
ok("2 activations staged", staged.activated.length === 2);
const creates = staged.changes.filter(c => c.field === "__create__");
ok("one __create__ row per new project", creates.length === 7 && new Set(creates.map(c => c.project_id)).size === 7);
ok("placeholders are negative", creates.every(c => c.project_id < 0));
const homewood = staged.changes.filter(c => c.project_name === "12618 Homewood Way");
ok("new project carries its numbers", homewood.some(c => c.field === "contract_value" && Math.abs(parseFloat(c.new_value) - 99686.88) < 0.01));
ok("new project carries foreman + stage", homewood.some(c => c.field === "foreman" && c.new_value === "Damon") && homewood.some(c => c.field === "stage"));
ok("anita has no foreman row (blank in sheet)", !staged.changes.some(c => c.project_name === "209 1st Anita" && c.field === "foreman"));
ok("620 El Medio foreman Cole -> Damon staged", staged.changes.some(c => c.project_id === 36 && c.field === "foreman" && c.old_value === "Cole" && c.new_value === "Damon"));
ok("is_pipeline 1 -> 0 staged for #24", staged.changes.some(c => c.project_id === 24 && c.field === "is_pipeline" && c.old_value === "1" && c.new_value === "0"));

const batchId = createBatch("kpi-apply-test", "bulk", 0, staged.changes);
const rows = db.prepare("SELECT * FROM import_staged_changes WHERE batch_id = ?").all(batchId) as StagedChangeRow[];
// Simulate a reviewer unchecking one create row but keeping its fields: project must still be created.
const selected = rows.filter(r => !(r.field === "__create__" && r.project_name === "Oceano"));
const result = applyStagedChanges(batchId, selected, "kpi-apply-test");
console.log("created:", result.created.join(", "));
ok("7 projects created", result.created.length === 7);
ok("project count +7", (db.prepare("SELECT COUNT(*) c FROM projects").get() as { c: number }).c === before + 7);
const oce = db.prepare("SELECT * FROM projects WHERE name = 'Oceano'").get() as any;
ok("Oceano created even with create row unchecked", !!oce && oce.is_pipeline === 0 && oce.foreman === "Damon" && Math.abs(oce.contract_value - 86047.5) < 0.01, JSON.stringify({ stage: oce?.stage, sc: oce?.stage_completion, hrs: oce?.actual_total_hours }));
const hw = db.prepare("SELECT * FROM projects WHERE name = '12618 Homewood Way'").get() as any;
ok("Homewood numbers applied", hw && hw.actual_total_hours === 637 && hw.stage_completion === 1 && Math.abs(hw.project_completion - 0.7) < 0.001 && hw.rough_hours_actual === 637);
ok("placeholder ids rewritten in batch", !(db.prepare("SELECT COUNT(*) c FROM import_staged_changes WHERE batch_id = ? AND project_id < 0").get(batchId) as any).c);
ok("#24 activated", (db.prepare("SELECT is_pipeline FROM projects WHERE id = 24").get() as any).is_pipeline === 0);
ok("#36 activated + foreman Damon", (() => { const r = db.prepare("SELECT is_pipeline, foreman FROM projects WHERE id = 36").get() as any; return r.is_pipeline === 0 && r.foreman === "Damon"; })());
ok("activity logged for created", (db.prepare("SELECT COUNT(*) c FROM project_activity WHERE user_name = 'kpi-apply-test' AND action = 'Created'").get() as any).c === 7);
ok("re-stage after apply finds no new projects", stageColumnGrid(grid).newProjects.length === 0);

// ── Cleanup: restore local db exactly ──
db.transaction(() => {
  db.prepare("DELETE FROM project_activity WHERE user_name = 'kpi-apply-test'").run();
  db.prepare("DELETE FROM import_staged_changes WHERE batch_id = ?").run(batchId);
  db.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);
  const ids = snapshot.map(p => p.id);
  db.prepare(`DELETE FROM projects WHERE id NOT IN (${ids.map(() => "?").join(",")})`).run(...ids);
  const cols = Object.keys(snapshot[0]).filter(k => k !== "id");
  const upd = db.prepare(`UPDATE projects SET ${cols.map(c => `${c} = @${c}`).join(", ")} WHERE id = @id`);
  for (const p of snapshot) upd.run(p);
})();
ok("local db restored", (db.prepare("SELECT COUNT(*) c FROM projects").get() as { c: number }).c === before);
