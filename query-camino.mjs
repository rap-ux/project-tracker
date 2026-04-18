import Database from "better-sqlite3";
import fs from "fs";
const db = new Database("data/projects.db");
const rows = db.prepare(
  "SELECT name, stage, stage_completion, rough_hours_actual, actual_total_hours FROM projects WHERE name LIKE '%Camino%'"
).all();
fs.writeFileSync("query-result.json", JSON.stringify(rows, null, 2));
