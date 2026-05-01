// Run with: npx tsx scripts/seed-projects-from-csv.ts [csv-path]
//
// Idempotently creates project rows from the "Project List and Inputs" CSV header row +
// "Total Contract Value" row. Used to bootstrap a fresh local DB so the rest of the app has
// data to display. Skips any project name that already exists in the DB (matched
// case-insensitively). All projects are created with stage='Rough', stage_completion=0,
// foreman='Dean' — adjust manually after seeding.
//
// In production this is unnecessary — projects are created via the UI.

import path from "path";
import fs   from "fs";
import Papa from "papaparse";
import db   from "../lib/db";

const csvPath = process.argv[2] ?? path.join(process.cwd(), "data", "project-list-and-inputs.csv");

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const parsed = Papa.parse<string[]>(fs.readFileSync(csvPath, "utf8"), { skipEmptyLines: false }).data;

const norm = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function findHeaderRow(): string[] | undefined {
  for (const r of parsed) {
    const cellsFilled = r.slice(1).filter(c => (c ?? "").trim() !== "").length;
    if (cellsFilled >= 3 && norm(r?.[0] ?? "") === "") return r;
  }
  return undefined;
}
function findRowByLabel(label: string): string[] | undefined {
  const want = norm(label);
  return parsed.find(r => norm(r?.[0] ?? "") === want);
}
function parseDollar(s: string | undefined): number {
  if (!s) return 0;
  const cleaned = s.replace(/[$,\s"]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

const projectRow      = findHeaderRow();
const contractRow     = findRowByLabel("Total Contract Value");
if (!projectRow) { console.error("Could not find project header row in CSV."); process.exit(1); }

const findByName = db.prepare("SELECT id, name FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))");
const insert = db.prepare(`
  INSERT INTO projects (name, foreman, stage, stage_completion, contract_value)
  VALUES (?, ?, 'Rough', 0, ?)
`);

let created = 0, existed = 0;
for (let i = 1; i < projectRow.length; i++) {
  const name = (projectRow[i] ?? "").trim();
  if (!name) continue;

  const existing = findByName.get(name) as { id: number; name: string } | undefined;
  if (existing) {
    console.log(`  --  ${name}  (already exists)`);
    existed++;
    continue;
  }

  const contract = parseDollar(contractRow?.[i]);
  insert.run(name, "Dean", contract);
  console.log(`  ++  ${name}  ($${contract.toLocaleString()})`);
  created++;
}

console.log(`\n${created} created, ${existed} already existed.`);
