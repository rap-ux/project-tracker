export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
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
  if (batch.status !== "applied") {
    return Response.json({ error: "Only applied batches can be reverted" }, { status: 400 });
  }

  const changes = db.prepare(
    "SELECT * FROM import_staged_changes WHERE batch_id = ?"
  ).all(batchId) as any[];

  const TEXT_FIELDS = new Set(["stage", "foreman"]);

  // Group by project, only revert fields that have a non-null old_value
  const byProject = new Map<number, Array<{ field: string; oldValue: number | string }>>();
  for (const c of changes) {
    if (c.old_value === null || c.old_value === undefined) continue;
    let oldValue: number | string;
    if (TEXT_FIELDS.has(c.field)) {
      oldValue = String(c.old_value);
    } else {
      const oldNum = parseFloat(c.old_value);
      if (isNaN(oldNum)) continue;
      oldValue = oldNum;
    }
    if (!byProject.has(c.project_id)) byProject.set(c.project_id, []);
    byProject.get(c.project_id)!.push({ field: c.field, oldValue });
  }

  if (byProject.size === 0) {
    return Response.json({ error: "Nothing to revert — no previous values recorded" }, { status: 400 });
  }

  db.transaction(() => {
    for (const [projectId, fields] of byProject) {
      const setClause = fields.map(f => `${f.field} = @${f.field}`).join(", ");
      const vals      = Object.fromEntries(fields.map(f => [f.field, f.oldValue]));
      db.prepare(`UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
        .run({ ...vals, id: projectId });
    }

    db.prepare(
      "UPDATE import_batches SET status = 'reverted', reverted_at = datetime('now') WHERE id = ?"
    ).run(batchId);
  })();

  return Response.json({ ok: true, reverted: changes.length, projects: byProject.size });
}
