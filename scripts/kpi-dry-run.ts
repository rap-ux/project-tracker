// Dry run: what would the Sync do with a SUMMARY_Project KPIs export? No writes.
// Usage: npx tsx scripts/kpi-dry-run.ts "<path to KPIs csv>"
import fs from "fs";
import Papa from "papaparse";
import db from "../lib/db";
import { stageColumnGrid } from "../lib/importer";

const grid = Papa.parse<string[]>(fs.readFileSync(process.argv[2], "utf8"), { skipEmptyLines: false }).data;
const projectRow = grid.find(r => (r[0] ?? "").trim().toLowerCase() === "project")!;
const foremanRow = grid.find(r => (r[0] ?? "").trim().toLowerCase() === "foreman")!;
const stageRow   = grid.find(r => (r[0] ?? "").trim().toLowerCase() === "stage")!;
const cvRow      = grid.find(r => (r[0] ?? "").trim().toLowerCase().startsWith("total contract value"))!;

console.log("Sheet columns -> DB match (same rule as the importer):");
for (let i = 1; i < projectRow.length; i++) {
  const name = (projectRow[i] ?? "").trim(); if (!name) continue;
  const exact = db.prepare("SELECT id,name,is_pipeline,foreman FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1").get(name) as any;
  const loose = exact ?? db.prepare("SELECT id,name,is_pipeline,foreman FROM projects WHERE LOWER(TRIM(name)) LIKE LOWER(?) LIMIT 1").get(`${name.split(" ")[0]}%`) as any;
  const how = exact ? "exact" : loose ? "first-word" : "NONE";
  console.log(`  ${name.padEnd(26)} | ${foremanRow[i].padEnd(13)} | ${stageRow[i].padEnd(6)} | ${cvRow[i].padStart(12)} | ${how.padEnd(10)} -> ${loose ? `#${loose.id} ${loose.name}${loose.is_pipeline ? " (PIPELINE)" : ""}${loose.foreman !== foremanRow[i] ? ` foreman was ${loose.foreman}` : ""}` : ""}`);
}
const { changes, newProjects } = stageColumnGrid(grid);
console.log(`\nStaged changes: ${changes.length} across ${new Set(changes.map(c => c.project_id)).size} projects`);
console.log("New (untracked) names:", newProjects);
