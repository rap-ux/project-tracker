// Shared column-format importer: turns a SUMMARY_Project KPIs grid into staged
// changes. Used by both the file upload (/api/upload) and the Google Sheet sync
// (/api/upload/sheet-sync) so the unrecorded rule, text fields, and new-project
// flagging behave identically no matter where the grid came from.
import db from "@/lib/db";

const ROW_MAP: Record<string, string> = {
  "stage completion estimate":             "stage_completion",
  "project completion estimate":           "project_completion",
  "total contract value*":                 "contract_value",
  "total contract value":                  "contract_value",
  "total invoiced":                        "total_invoiced",
  "estimated materials budget":            "est_materials_budget",
  "actual materials":                      "actual_materials",
  "estimated total labor hours":           "est_total_hours",
  "actual total labor hours":              "actual_total_hours",
  "goal hours to budget (based on stage)": "goal_hours",
  "rough hours allowed":                   "rough_hours_allowed",
  "rough hours actual":                    "rough_hours_actual",
  "finish hours allowed":                  "finish_hours_allowed",
  "finish hours actual":                   "finish_hours_actual",
};
const TEXT_ROW_MAP: Record<string, string> = {
  "stage":   "stage",
  "foreman": "foreman",
};
const PCT_FIELDS = new Set(["stage_completion", "project_completion"]);

export interface StagedChange {
  project_id:   number;
  project_name: string;
  field:        string;
  old_value:    string | null;
  new_value:    string;
}

function normaliseRowLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[*]/g, "").trim();
}
function parseColVal(val: string, field: string): number | null {
  if (!val) return null;
  const v = String(val).trim();
  if (!v || v.toLowerCase() === "not found" || v.startsWith("#")) return null;
  const isPercent = v.endsWith("%");
  const cleaned   = v.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  if (isPercent && PCT_FIELDS.has(field)) return n / 100;
  // KPIs sheet sometimes stores completion as 0–1 already, sometimes 0–100.
  if (PCT_FIELDS.has(field) && n > 1) return n / 100;
  return n;
}
function calcProjectCompletion(stage: string, sc: number): number {
  const v = Math.min(1, Math.max(0, sc ?? 0));
  if (stage === "Rough" || stage === "Underground") return v * 0.70;
  if (stage === "Finish")  return 0.70 + v * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0;
}

function computeDiff(
  projectId: number, projectName: string,
  current: Record<string, any>,
  updates: Record<string, number>,
  textUpdates: Record<string, string>,
): StagedChange[] {
  const stage = (textUpdates.stage ?? current.stage) as string;
  const newSC = updates.stage_completion ?? (current.stage_completion as number ?? 0);

  if ("stage_completion" in updates || "actual_total_hours" in updates) {
    updates.project_completion = calcProjectCompletion(stage, newSC);
  }

  const wasRough       = stage === "Rough" || stage === "Underground";
  const crossingMax    = wasRough && newSC >= 1.0 && (current.stage_completion ?? 0) < 1.0;
  const notYetRecorded = !current.rough_hours_actual || current.rough_hours_actual === 0;
  if (wasRough && crossingMax && notYetRecorded && !("rough_hours_actual" in updates)) {
    updates.rough_hours_actual = updates.actual_total_hours ?? current.actual_total_hours ?? 0;
  }

  const changes: StagedChange[] = [];
  for (const [field, newVal] of Object.entries(updates)) {
    const oldRaw = current[field];
    const oldNum = (oldRaw !== null && oldRaw !== undefined) ? parseFloat(String(oldRaw)) : null;
    const diff   = oldNum === null ? true : Math.abs(oldNum - newVal) > 0.001;
    if (diff) {
      changes.push({ project_id: projectId, project_name: projectName, field,
        old_value: oldNum !== null ? String(oldNum) : null, new_value: String(newVal) });
    }
  }
  for (const [field, newVal] of Object.entries(textUpdates)) {
    const oldRaw = current[field] != null ? String(current[field]).trim() : null;
    if (oldRaw !== newVal.trim()) {
      changes.push({ project_id: projectId, project_name: projectName, field, old_value: oldRaw, new_value: newVal.trim() });
    }
  }
  return changes;
}

// Core: a column-oriented grid (first column = row labels, "Project" row names
// the columns) → staged changes + any names not yet tracked.
export function stageColumnGrid(grid: string[][]): { changes: StagedChange[]; newProjects: string[] } {
  const projectRow = grid.find(r => (r[0] ?? "").trim().toLowerCase() === "project");
  if (!projectRow) throw new Error("Could not find a 'Project' row in the data");

  const projectNames  = projectRow.slice(1);
  const fieldData:     Record<string, string[]> = {};
  const textFieldData: Record<string, string[]> = {};
  for (const row of grid) {
    const label = normaliseRowLabel(row[0] ?? "");
    if (ROW_MAP[label])      fieldData[ROW_MAP[label]]          = row.slice(1);
    if (TEXT_ROW_MAP[label]) textFieldData[TEXT_ROW_MAP[label]] = row.slice(1);
  }

  const changes: StagedChange[] = [];
  const newProjects: string[] = [];

  for (let ci = 0; ci < projectNames.length; ci++) {
    const name = (projectNames[ci] ?? "").trim();
    if (!name) continue;

    const proj = (
      db.prepare("SELECT * FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1").get(name) ??
      db.prepare("SELECT * FROM projects WHERE LOWER(TRIM(name)) LIKE LOWER(?) LIMIT 1").get(`${name.split(" ")[0]}%`)
    ) as Record<string, any> | undefined;

    if (!proj) { newProjects.push(name); continue; }

    const updates: Record<string, number> = {};
    for (const [dbField, vals] of Object.entries(fieldData)) {
      const num = parseColVal(vals[ci] ?? "", dbField);
      if (num !== null) updates[dbField] = num;
    }
    // Unrecorded rule: sheet "Actual TOTAL" includes the app's unrecorded ledger.
    if ("actual_total_hours" in updates) {
      updates.actual_total_hours = Math.max(0, updates.actual_total_hours - (proj.unrecorded_hours || 0));
    }
    if ("actual_materials" in updates) {
      updates.actual_materials = Math.max(0, updates.actual_materials - (proj.unrecorded_materials || 0));
    }

    const textUpdates: Record<string, string> = {};
    for (const [dbField, vals] of Object.entries(textFieldData)) {
      const v = (vals[ci] ?? "").trim();
      if (v) textUpdates[dbField] = v;
    }

    if (Object.keys(updates).length === 0 && Object.keys(textUpdates).length === 0) continue;
    changes.push(...computeDiff(proj.id, proj.name, proj, updates, textUpdates));
  }

  return { changes, newProjects };
}

// Persist a set of staged changes as a pending batch. Returns batch id.
export function createBatch(filename: string, source: string, userId: number, changes: StagedChange[]): number {
  // userId 0 = no logged-in user (webhook/secret path). uploaded_by has a FK to
  // users(id), so store null rather than a non-existent id 0.
  const batchId = (db.prepare(
    "INSERT INTO import_batches (filename, source, uploaded_by, change_count) VALUES (?, ?, ?, ?)"
  ).run(filename, source, userId || null, changes.length).lastInsertRowid) as number;

  const insChange = db.prepare(`
    INSERT INTO import_staged_changes (batch_id, project_id, project_name, field, old_value, new_value)
    VALUES (@batch_id, @project_id, @project_name, @field, @old_value, @new_value)
  `);
  db.transaction((cs: StagedChange[]) => { for (const c of cs) insChange.run({ batch_id: batchId, ...c }); })(changes);
  return batchId;
}
