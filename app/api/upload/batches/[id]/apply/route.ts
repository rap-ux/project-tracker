import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const batchId = parseInt(id);

  const batch = db.prepare("SELECT * FROM import_batches WHERE id = ?").get(batchId) as any;
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });
  if (batch.status !== "pending") {
    return Response.json({ error: "Batch is not pending" }, { status: 400 });
  }

  // changeIds: which staged_changes rows to apply (subset the user approved)
  const body       = await req.json() as { changeIds: number[] };
  const changeIds  = body.changeIds ?? [];

  if (changeIds.length === 0) {
    return Response.json({ error: "No changes selected" }, { status: 400 });
  }

  // Load the selected changes (validate they belong to this batch)
  const placeholders = changeIds.map(() => "?").join(",");
  const changes = db.prepare(`
    SELECT * FROM import_staged_changes
    WHERE id IN (${placeholders}) AND batch_id = ?
  `).all(...changeIds, batchId) as any[];

  if (changes.length === 0) {
    return Response.json({ error: "No valid changes found" }, { status: 400 });
  }

  // Group updates by project_id
  const byProject = new Map<number, Array<{ field: string; newValue: number }>>();
  for (const c of changes) {
    if (!byProject.has(c.project_id)) byProject.set(c.project_id, []);
    byProject.get(c.project_id)!.push({ field: c.field, newValue: parseFloat(c.new_value) });
  }

  // Apply updates
  db.transaction(() => {
    for (const [projectId, fields] of byProject) {
      const setClause = fields.map(f => `${f.field} = @${f.field}`).join(", ");
      const vals      = Object.fromEntries(fields.map(f => [f.field, f.newValue]));
      db.prepare(`UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
        .run({ ...vals, id: projectId });
    }

    // Mark batch applied
    db.prepare(
      "UPDATE import_batches SET status = 'applied', applied_at = datetime('now') WHERE id = ?"
    ).run(batchId);

    // Backward-compat: log to uploads table
    db.prepare("INSERT INTO uploads (filename, uploaded_by, rows_updated) VALUES (?, ?, ?)")
      .run(batch.filename, batch.uploaded_by, byProject.size);
  })();

  return Response.json({ ok: true, applied: changes.length, projects: byProject.size });
}
