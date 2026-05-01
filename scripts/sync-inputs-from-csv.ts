// Run with: npx tsx scripts/sync-inputs-from-csv.ts [csv-path]
//
// Reads the "Project List and Inputs" Google Sheets export and upserts each project's
// planned hours and financial assumptions into project_inputs, then re-derives downstream
// budgets in the projects table (matches what POST /api/inputs does for a single row).
//
// Default CSV path: ./data/project-list-and-inputs.csv
// Override:         npx tsx scripts/sync-inputs-from-csv.ts ~/Downloads/foo.csv

import path     from "path";
import fs       from "fs";
import Papa     from "papaparse";
import db       from "../lib/db";   // ensures schema (CREATE TABLE IF NOT EXISTS) is run
import { deriveBudgets } from "../lib/budgets";

const csvPath = process.argv[2] ?? path.join(process.cwd(), "data", "project-list-and-inputs.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const csv = fs.readFileSync(csvPath, "utf8");
const parsed = Papa.parse<string[]>(csv, { skipEmptyLines: false }).data;

const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function findRowByLabel(label: string): string[] | undefined {
  const want = norm(label);
  return parsed.find(r => norm(r?.[0] ?? "") === want);
}

function findHeaderRow(): string[] | undefined {
  // The project-name row is the first one with several non-empty cells past column 0
  // and no recognised metric label in column 0.
  for (const r of parsed) {
    const cellsFilled = r.slice(1).filter(c => (c ?? "").trim() !== "").length;
    if (cellsFilled >= 3 && norm(r?.[0] ?? "") === "") return r;
  }
  return undefined;
}

const projectRow     = findHeaderRow();
const grossMarginRow = findRowByLabel("Gross Margin");
const materialsRow   = findRowByLabel("Materials Share of Contract Value");
const wagesRow       = findRowByLabel("Wages Share");
const rateRow        = findRowByLabel("Est Blended Avg Hourly Rate");
const wageRow        = findRowByLabel("Est Blended Avg Hourly Wage Expense");
const roughRow       = findRowByLabel("Rough Hours Estimated");
const finishRow      = findRowByLabel("Finish Hours Estimated");

if (!projectRow || !roughRow || !finishRow) {
  console.error("Could not locate required rows in CSV.");
  console.error(`  project header row: ${projectRow ? "found" : "MISSING"}`);
  console.error(`  Rough Hours Estimated:  ${roughRow ? "found" : "MISSING"}`);
  console.error(`  Finish Hours Estimated: ${finishRow ? "found" : "MISSING"}`);
  process.exit(1);
}

function parsePct(s: string | undefined): number | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const isPct = trimmed.endsWith("%");
  const cleaned = trimmed.replace(/[$,%\s"]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  return isPct ? n / 100 : (n > 1 ? n / 100 : n);
}
function parseNum(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[$,\s"]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

const upsertInputs = db.prepare(`
  INSERT INTO project_inputs
    (project_id, gross_margin, materials_share, wages_share,
     blended_hourly_rate, blended_hourly_wage, rough_hours_est, finish_hours_est)
  VALUES
    (@project_id, @gross_margin, @materials_share, @wages_share,
     @blended_hourly_rate, @blended_hourly_wage, @rough_hours_est, @finish_hours_est)
  ON CONFLICT(project_id) DO UPDATE SET
    gross_margin        = excluded.gross_margin,
    materials_share     = excluded.materials_share,
    wages_share         = excluded.wages_share,
    blended_hourly_rate = excluded.blended_hourly_rate,
    blended_hourly_wage = excluded.blended_hourly_wage,
    rough_hours_est     = excluded.rough_hours_est,
    finish_hours_est    = excluded.finish_hours_est,
    updated_at          = datetime('now')
`);

const updateProject = db.prepare(`
  UPDATE projects SET
    est_total_hours      = @est_total_hours,
    rough_hours_allowed  = @rough_hours_allowed,
    finish_hours_allowed = @finish_hours_allowed,
    goal_hours           = @goal_hours,
    updated_at           = datetime('now')
  WHERE id = @id
`);

const findProjectExact = db.prepare(`
  SELECT id, name, contract_value, stage, stage_completion
  FROM projects
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
`);
const findProjectLike = db.prepare(`
  SELECT id, name, contract_value, stage, stage_completion
  FROM projects
  WHERE LOWER(TRIM(name)) LIKE LOWER(TRIM(?))
  LIMIT 1
`);

type Result = { csvName: string; status: "updated" | "skipped" | "missing"; dbName?: string; note?: string };
const results: Result[] = [];

for (let i = 1; i < projectRow.length; i++) {
  const csvName = (projectRow[i] ?? "").trim();
  if (!csvName) continue;

  let project = findProjectExact.get(csvName) as any;
  if (!project) project = findProjectLike.get(`%${csvName}%`) as any;
  if (!project) {
    results.push({ csvName, status: "missing" });
    continue;
  }

  const rough  = parseNum(roughRow[i]);
  const finish = parseNum(finishRow[i]);
  if (rough == null || finish == null || (rough === 0 && finish === 0)) {
    results.push({ csvName, dbName: project.name, status: "skipped", note: "no hours in CSV" });
    continue;
  }

  const inputs = {
    project_id:          project.id,
    gross_margin:        parsePct(grossMarginRow?.[i]) ?? 0.575,
    materials_share:     parsePct(materialsRow?.[i])   ?? 0.225,
    wages_share:         parsePct(wagesRow?.[i])       ?? 0.20,
    blended_hourly_rate: parseNum(rateRow?.[i])        ?? 125,
    blended_hourly_wage: parseNum(wageRow?.[i])        ?? 37,
    rough_hours_est:     rough,
    finish_hours_est:    finish,
  };

  upsertInputs.run(inputs);

  const derived = deriveBudgets(
    { contract_value: project.contract_value, stage: project.stage, stage_completion: project.stage_completion },
    inputs,
  );
  updateProject.run({ ...derived, id: project.id });

  results.push({ csvName, dbName: project.name, status: "updated" });
}

console.log(`\nSync from: ${csvPath}\n`);
for (const r of results) {
  const tag = r.status === "updated" ? "OK " : r.status === "skipped" ? "-- " : "?? ";
  const map = r.dbName && r.dbName !== r.csvName ? `  →  ${r.dbName}` : "";
  const note = r.note ? `  (${r.note})` : r.status === "missing" ? "  (not in DB — skipped)" : "";
  console.log(`  ${tag}${r.csvName}${map}${note}`);
}
const updated = results.filter(r => r.status === "updated").length;
const missing = results.filter(r => r.status === "missing").length;
console.log(`\n${updated} updated, ${missing} not found in DB.`);
