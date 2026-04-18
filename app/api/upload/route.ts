export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";
import ExcelJS         from "exceljs";

// ── Row-oriented QBO column mapping ───────────────────────────────────────────
const COL_MAP: Record<string, string> = {
  "project":          "name",
  "invoice total":    "total_invoiced",
  "materials total":  "actual_materials",
  "hours total":      "actual_total_hours",
  "total income":     "total_invoiced",
  "materials cost":   "actual_materials",
  "material cost":    "actual_materials",
  "labor hours":      "actual_total_hours",
  "actual hours":     "actual_total_hours",
  "job":              "name",
  "job name":         "name",
};

// ── Column-oriented row-label → DB field ──────────────────────────────────────
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
  // ── QBO Project Profitability Report ────────────────────────────────────
  "total income":                          "total_invoiced",
  "total revenue":                         "total_invoiced",
  "job materials":                         "actual_materials",
  "reimbursed job materials":              "actual_materials",
  "66800 reimbursed job materials":        "actual_materials",
  "50000 job materials":                   "actual_materials",
  "50100 job materials":                   "actual_materials",
};

const PCT_FIELDS = new Set(["stage_completion", "project_completion"]);

// ── Helpers ───────────────────────────────────────────────────────────────────
function normaliseHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z ]/g, "").trim();
}
function normaliseRowLabel(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[*]/g, "").trim();
}
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current); current = "";
    } else { current += ch; }
  }
  result.push(current);
  return result;
}
function parseNum(val: string): number | null {
  const cleaned = val.replace(/[$,\s]/g, "");
  if (!cleaned || cleaned.toLowerCase() === "not found") return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
function parseColVal(val: string, field: string): number | null {
  if (!val) return null;
  const v = val.trim();
  if (!v || v.toLowerCase() === "not found" || v.startsWith("#")) return null;
  const isPercent = v.endsWith("%");
  const cleaned   = v.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  if (isPercent && PCT_FIELDS.has(field)) return n / 100;
  return n;
}
function parseUploadDate(s: string): string | null {
  const MONTHS: Record<string, number> = {
    January: 1, February: 2, March: 3, April: 4,
    May: 5, June: 6, July: 7, August: 8,
    September: 9, October: 10, November: 11, December: 12,
  };
  const m = s.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[1]];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${String(m[2]).padStart(2, "0")} 00:00:00`;
}

// ── ExcelJS cell → plain string ───────────────────────────────────────────────
function xlCell(c: any): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string")  return c;
  if (typeof c === "number")  return String(c);
  if (typeof c === "boolean") return String(c);
  if (c instanceof Date)      return c.toLocaleDateString("en-US");
  if (c?.result !== undefined) return xlCell(c.result);   // formula
  if (Array.isArray(c?.richText)) return c.richText.map((r: any) => r.text ?? "").join(""); // rich text
  if (c?.text !== undefined)   return String(c.text);     // hyperlink
  return String(c);
}

// ── Calculated field helpers ──────────────────────────────────────────────────
function calcProjectCompletion(stage: string, sc: number): number {
  const v = Math.min(1, Math.max(0, sc ?? 0));
  if (stage === "Rough" || stage === "Underground") return v * 0.70;
  if (stage === "Finish")  return 0.70 + v * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0;
}

// ── Compute diff between current DB values and proposed updates ───────────────
interface StagedChange {
  project_id:   number;
  project_name: string;
  field:        string;
  old_value:    string | null;
  new_value:    string;
}

function computeDiff(
  projectId:   number,
  projectName: string,
  current:     Record<string, any>,
  updates:     Record<string, number>,
): StagedChange[] {
  // Apply calculated fields
  const stage = current.stage as string;
  const newSC = updates.stage_completion ?? (current.stage_completion as number ?? 0);

  // Recalc project_completion whenever stage_completion or actual_total_hours changes
  if ("stage_completion" in updates || "actual_total_hours" in updates) {
    updates.project_completion = calcProjectCompletion(stage, newSC);
  }

  // Auto-snapshot rough_hours_actual
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
      changes.push({
        project_id:   projectId,
        project_name: projectName,
        field,
        old_value:    oldNum !== null ? String(oldNum) : null,
        new_value:    String(newVal),
      });
    }
  }
  return changes;
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file     = formData.get("file") as File | null;
  if (!file) return Response.json({ error: "No file provided" }, { status: 400 });

  // ── Normalise xlsx → CSV ──────────────────────────────────────────────────
  let text: string;
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx")
               || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  if (isXlsx) {
    try {
      const buf = await file.arrayBuffer();
      const wb  = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws  = wb.worksheets[0];
      const csvRows: string[] = [];
      ws.eachRow(row => {
        const cells = (row.values as any[]).slice(1);
        csvRows.push(cells.map((c: any) => {
          const s = xlCell(c);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(","));
      });
      text = csvRows.join("\n");
    } catch {
      return Response.json({ error: "Could not parse .xlsx file." }, { status: 400 });
    }
  } else {
    text = await file.text();
  }

  const lines = text.split(/\r?\n/).filter(l => l.trim().replace(/,/g, "").trim());
  if (lines.length < 2) return Response.json({ error: "File appears empty" }, { status: 400 });

  const userId   = (session.user as any).id ?? 0;
  const firstRow = parseCSVLine(lines[0]);

  let allChanges: StagedChange[] = [];
  const errors: string[] = [];

  // ── Column-oriented format ────────────────────────────────────────────────
  if (firstRow[0]?.trim().toLowerCase() === "last update") {
    const grid     = lines.map(l => parseCSVLine(l));
    const rawDate  = grid[0]?.[1]?.trim() ?? "";

    const projectRow = grid.find(r => r[0]?.trim().toLowerCase() === "project");
    if (!projectRow) return Response.json({ error: "Could not find 'Project' row in CSV" }, { status: 400 });

    const projectNames = projectRow.slice(1);
    const fieldData: Record<string, string[]> = {};
    for (const row of grid) {
      const label   = normaliseRowLabel(row[0] ?? "");
      const dbField = ROW_MAP[label];
      if (dbField) fieldData[dbField] = row.slice(1);
    }

    if (Object.keys(fieldData).length === 0) {
      return Response.json({ error: "No recognised data rows found." }, { status: 400 });
    }

    for (let ci = 0; ci < projectNames.length; ci++) {
      const name = projectNames[ci]?.trim();
      if (!name) continue;

      const proj = db.prepare(
        "SELECT * FROM projects WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1"
      ).get(name) as Record<string, any> | undefined;

      if (!proj) { errors.push(`"${name}" not found — skipped`); continue; }

      const updates: Record<string, number> = {};
      for (const [dbField, vals] of Object.entries(fieldData)) {
        const num = parseColVal(vals[ci] ?? "", dbField);
        if (num !== null) updates[dbField] = num;
      }
      if (Object.keys(updates).length === 0) continue;

      allChanges.push(...computeDiff(proj.id, proj.name, proj, updates));
    }
  } else {
    // ── Row-oriented format ────────────────────────────────────────────────
    const rawHeaders = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim());
    const headers    = rawHeaders.map(normaliseHeader);
    const nameColIdx = headers.findIndex(h => COL_MAP[h] === "name");

    if (nameColIdx === -1) {
      return Response.json({
        error: "Could not find project name column. Expected 'Project' as first column.",
      }, { status: 400 });
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)
        ?.map(v => v.replace(/^"|"$/g, "").trim()) ?? lines[i].split(",").map(v => v.trim());

      const projectName = values[nameColIdx]?.replace(/[$,\s"]/g, " ").trim();
      if (!projectName) continue;

      const proj = (
        db.prepare("SELECT * FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1").get(projectName) ??
        db.prepare("SELECT * FROM projects WHERE LOWER(name) LIKE LOWER(?) LIMIT 1").get(`%${projectName.split(" ")[0]}%`)
      ) as Record<string, any> | undefined;

      if (!proj) { errors.push(`Row ${i + 1}: "${projectName}" not found — skipped`); continue; }

      const updates: Record<string, number> = {};
      headers.forEach((h, idx) => {
        const dbField = COL_MAP[h];
        if (!dbField || dbField === "name") return;
        const num = parseNum(values[idx] ?? "");
        if (num !== null) updates[dbField] = num;
      });

      if (Object.keys(updates).length === 0) continue;
      allChanges.push(...computeDiff(proj.id, proj.name, proj, updates));
    }
  }

  if (allChanges.length === 0) {
    return Response.json({
      ok: false,
      error: errors.length > 0
        ? `No changes detected. ${errors.length} project(s) not found.`
        : "No changes detected — file values match what's already in the database.",
      errors,
    });
  }

  // ── Create batch + staged changes ─────────────────────────────────────────
  const uniqueProjects = new Set(allChanges.map(c => c.project_id)).size;

  const batchId = (db.prepare(`
    INSERT INTO import_batches (filename, source, uploaded_by, change_count)
    VALUES (?, 'bulk', ?, ?)
  `).run(file.name, userId, allChanges.length).lastInsertRowid) as number;

  const insChange = db.prepare(`
    INSERT INTO import_staged_changes (batch_id, project_id, project_name, field, old_value, new_value)
    VALUES (@batch_id, @project_id, @project_name, @field, @old_value, @new_value)
  `);

  db.transaction((changes: StagedChange[]) => {
    for (const c of changes) insChange.run({ batch_id: batchId, ...c });
  })(allChanges);

  return Response.json({
    ok:           true,
    batchId,
    projectCount: uniqueProjects,
    changeCount:  allChanges.length,
    errors,
  });
}
