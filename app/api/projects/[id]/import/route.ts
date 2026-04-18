export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";
import ExcelJS         from "exceljs";

type Ctx = { params: Promise<{ id: string }> };

// ── Field map: row label → DB column ─────────────────────────────────────────
const ROW_MAP: Record<string, string> = {
  // ── Custom profitability summary ──────────────────────────────────────────
  "total contract value":                   "contract_value",
  "total contract value*":                  "contract_value",
  "total invoiced":                         "total_invoiced",
  "estimated materials budget":             "est_materials_budget",
  "actual materials":                       "actual_materials",
  "estimated total labor hours":            "est_total_hours",
  "actual total labor hours":               "actual_total_hours",
  "goal hours to budget (based on stage)":  "goal_hours",
  "rough hours allowed":                    "rough_hours_allowed",
  "rough hours actual":                     "rough_hours_actual",
  "finish hours allowed":                   "finish_hours_allowed",
  "finish hours actual":                    "finish_hours_actual",
  "stage completion":                       "stage_completion",
  "stage completion estimate":              "stage_completion",
  // ── QBO Project Profitability Report ─────────────────────────────────────
  "total income":                           "total_invoiced",
  "total revenue":                          "total_invoiced",
  "job materials":                          "actual_materials",
  "reimbursed job materials":               "actual_materials",
  "66800 reimbursed job materials":         "actual_materials",
  "50000 job materials":                    "actual_materials",
  "50100 job materials":                    "actual_materials",
  // ── Common shorthand ──────────────────────────────────────────────────────
  "contract value":                         "contract_value",
  "invoiced":                               "total_invoiced",
  "materials budget":                       "est_materials_budget",
  "materials actual":                       "actual_materials",
  "est hours":                              "est_total_hours",
  "actual hours":                           "actual_total_hours",
  "goal hours":                             "goal_hours",
  "rough allowed":                          "rough_hours_allowed",
  "rough actual":                           "rough_hours_actual",
  "finish allowed":                         "finish_hours_allowed",
  "finish actual":                          "finish_hours_actual",
};

const PCT_FIELDS = new Set(["stage_completion"]);

// ── ExcelJS cell value → plain value ─────────────────────────────────────────
function xlCellValue(v: any): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string")  return v;
  if (typeof v === "number")  return v;
  if (typeof v === "boolean") return String(v);
  if (v instanceof Date)      return v.toLocaleDateString("en-US");
  // Formula / shared-formula object: { formula, result, date1904 }
  if (v?.formula !== undefined || v?.sharedFormula !== undefined) {
    const r = v.result;
    if (r === null || r === undefined) return null; // uncached — caller falls back to cell.text
    if (typeof r === "number") return r;
    if (typeof r === "string") return r;
    if (r instanceof Date)     return r.toLocaleDateString("en-US");
    if (r?.error)              return null;          // e.g. #DIV/0!
    return null;
  }
  if (v?.result !== undefined) return xlCellValue(v.result);
  if (Array.isArray(v?.richText)) return v.richText.map((r: any) => r.text ?? "").join("");
  if (v?.text !== undefined)   return String(v.text);
  return null; // unknown object — don't return "[object Object]"
}

// ── ExcelJS Cell object → plain value (uses cell.text as fallback) ────────────
function xlCell(cell: any): string | number | null {
  const fromValue = xlCellValue(cell?.value ?? cell);
  if (fromValue !== null) return fromValue;
  // cell.text is the formatted display string (e.g. "$12,345.00") — works even when
  // formula results aren't cached in the file
  const t = cell?.text;
  return (t && t !== "") ? t : null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalise(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[*]/g, "").trim();
}
// Strip leading QBO account numbers like "50000 " or "66800 " so we can also
// match the bare label (e.g. "50000 job materials" AND "job materials" both hit the map)
function normalisedVariants(s: string): string[] {
  const base = normalise(s);
  const noAcct = base.replace(/^\d{4,6}\s+/, "");
  return noAcct !== base ? [base, noAcct] : [base];
}
function parseVal(raw: string | number | null | undefined, field: string): number | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "not found" || s.startsWith("#")) return null;
  const isPercent = s.endsWith("%");
  const cleaned   = s.replace(/[$,%\s]/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (isNaN(n)) return null;
  if (isPercent && PCT_FIELDS.has(field)) return n / 100;
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

// ── Route ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const projectId = parseInt(id);

  const current = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as any;
  if (!current) return Response.json({ error: "Project not found" }, { status: 404 });

  // ── Parse input (pasted text or file) ────────────────────────────────────
  const formData = await req.formData();
  const pastedText = formData.get("text") as string | null;
  const file       = formData.get("file") as File | null;

  let rows: (string | number | null)[][] = [];
  let sourceName = "pasted-text";

  if (pastedText) {
    // ── Pasted text from QBO browser (tab-separated) ──────────────────────
    sourceName = "pasted-text";
    for (const line of pastedText.split(/\r?\n/)) {
      const parts = line.split("\t").map(p => p.trim());
      if (parts.every(p => !p)) continue; // skip blank lines
      // Label = first non-empty part, value = last non-empty part (may equal label if only 1 col)
      const label = parts[0] ?? "";
      const value = parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
      rows.push([label, value !== label ? value : ""]);
    }
  } else if (file) {
    // ── File upload ───────────────────────────────────────────────────────
    sourceName = file.name;
    const buf = await file.arrayBuffer();
    try {
      const wb = new ExcelJS.Workbook();
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx")
                  || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (isXlsx) {
        await wb.xlsx.load(buf);
        const ws = wb.worksheets[0];
        ws.eachRow(row => {
          const cells: (string | number | null)[] = [];
          for (let ci = 1; ci <= row.cellCount; ci++) {
            const cell = row.getCell(ci);
            cells.push(xlCell(cell));
          }
          rows.push(cells);
        });
      } else {
        // CSV — parse as plain text, no ExcelJS needed
        const csvText = Buffer.from(buf).toString("utf-8");
        for (const line of csvText.split(/\r?\n/)) {
          if (!line.trim()) continue;
          rows.push(line.split(",").map(c => c.replace(/^"|"$/g, "").trim()));
        }
      }
    } catch {
      return Response.json({ error: "Could not parse file." }, { status: 400 });
    }
  } else {
    return Response.json({ error: "No file or text provided" }, { status: 400 });
  }

  if (rows.length < 2) return Response.json({ error: "No data found — make sure to copy the full report." }, { status: 400 });

  // ── Format detection ──────────────────────────────────────────────────────
  const updates: Record<string, number> = {};
  const firstCellNorm = normalise(String(rows[0]?.[0] ?? ""));
  const isColumnFormat = firstCellNorm === "last update"
    || rows.some(r => normalise(String(r[0] ?? "")) === "project");

  if (isColumnFormat) {
    const projectRow = rows.find(r => normalise(String(r[0] ?? "")) === "project");
    if (!projectRow) return Response.json({ error: "No 'Project' row found" }, { status: 400 });

    let colIdx = -1;
    for (let ci = 1; ci < projectRow.length; ci++) {
      const cell = String(projectRow[ci] ?? "").trim().toLowerCase();
      if (cell === current.name.trim().toLowerCase()) { colIdx = ci; break; }
    }
    if (colIdx === -1) {
      const firstName = current.name.split(" ")[0].toLowerCase();
      for (let ci = 1; ci < projectRow.length; ci++) {
        if (String(projectRow[ci] ?? "").trim().toLowerCase().startsWith(firstName)) { colIdx = ci; break; }
      }
    }
    if (colIdx === -1) {
      return Response.json({ error: `"${current.name}" not found in this file.` }, { status: 400 });
    }

    for (const row of rows) {
      const variants = normalisedVariants(String(row[0] ?? ""));
      const dbField  = variants.map(v => ROW_MAP[v]).find(Boolean);
      if (!dbField) continue;
      const val = parseVal(row[colIdx], dbField);
      if (val !== null) updates[dbField] = (updates[dbField] ?? 0) + val;
    }
  } else {
    const startRow = isNaN(Number(String(rows[0]?.[1] ?? "").replace(/[$,%]/g, ""))) ? 1 : 0;
    for (let i = startRow; i < rows.length; i++) {
      const variants = normalisedVariants(String(rows[i]?.[0] ?? ""));
      const dbField  = variants.map(v => ROW_MAP[v]).find(Boolean);
      if (!dbField) continue;
      const val = parseVal(rows[i]?.[1], dbField);
      if (val !== null) updates[dbField] = (updates[dbField] ?? 0) + val;
    }
  }

  if (Object.keys(updates).length === 0) {
    // Debug: show matched labels + what value was found in each column for them
    const debugRows = rows
      .filter(r => normalisedVariants(String(r[0] ?? "")).some(v => ROW_MAP[v]))
      .slice(0, 10)
      .map(r => ({ label: String(r[0]), cols: r.slice(0, 6) }));
    return Response.json({
      error: "No recognised fields found in this file.",
      debug_matched_rows: debugRows,
      debug_all_labels: rows.slice(0, 30).map(r => String(r[0] ?? "")).filter(Boolean),
    }, { status: 400 });
  }

  // ── Apply calculated fields ───────────────────────────────────────────────
  const newStageCompletion = updates.stage_completion ?? current.stage_completion;
  updates.project_completion = calcProjectCompletion(current.stage, newStageCompletion);

  const wasRough       = current.stage === "Rough" || current.stage === "Underground";
  const crossingMax    = wasRough && newStageCompletion >= 1.0 && (current.stage_completion ?? 0) < 1.0;
  const notYetRecorded = !current.rough_hours_actual || current.rough_hours_actual === 0;
  if (wasRough && crossingMax && notYetRecorded && !("rough_hours_actual" in updates)) {
    updates.rough_hours_actual = updates.actual_total_hours ?? current.actual_total_hours ?? 0;
  }

  // ── Compute diff ──────────────────────────────────────────────────────────
  const stagedChanges: {
    project_id: number; project_name: string;
    field: string; old_value: string | null; new_value: string;
  }[] = [];

  for (const [field, newVal] of Object.entries(updates)) {
    const oldRaw = current[field];
    const oldNum = (oldRaw !== null && oldRaw !== undefined) ? parseFloat(String(oldRaw)) : null;
    const diff   = oldNum === null ? true : Math.abs(oldNum - newVal) > 0.001;
    if (diff) {
      stagedChanges.push({
        project_id:   projectId,
        project_name: current.name,
        field,
        old_value:    oldNum !== null ? String(oldNum) : null,
        new_value:    String(newVal),
      });
    }
  }

  if (stagedChanges.length === 0) {
    return Response.json({ ok: false, error: "No changes detected — file values match what's already in the database." });
  }

  // ── Create batch + staged changes ─────────────────────────────────────────
  const userId  = (session.user as any).id ?? null;
  const batchId = (db.prepare(`
    INSERT INTO import_batches (filename, source, project_id, uploaded_by, change_count)
    VALUES (?, 'project', ?, ?, ?)
  `).run(sourceName, projectId, userId, stagedChanges.length).lastInsertRowid) as number;

  const insChange = db.prepare(`
    INSERT INTO import_staged_changes (batch_id, project_id, project_name, field, old_value, new_value)
    VALUES (@batch_id, @project_id, @project_name, @field, @old_value, @new_value)
  `);

  db.transaction((changes: typeof stagedChanges) => {
    for (const c of changes) insChange.run({ batch_id: batchId, ...c });
  })(stagedChanges);

  return Response.json({
    ok:           true,
    batchId,
    changeCount:  stagedChanges.length,
    staged:       true,
  });
}
