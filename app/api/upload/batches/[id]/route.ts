import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/upload/batches/[id] — load batch + its changes
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const batchId = parseInt(id);

  const batch = db.prepare(`
    SELECT b.*, p.name AS project_name
    FROM import_batches b
    LEFT JOIN projects p ON b.project_id = p.id
    WHERE b.id = ?
  `).get(batchId);

  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  const changes = db.prepare(
    "SELECT * FROM import_staged_changes WHERE batch_id = ? ORDER BY project_name, field"
  ).all(batchId);

  return Response.json({ ok: true, batch, changes });
}

// DELETE /api/upload/batches/[id] — discard a pending batch
export async function DELETE(_req: NextRequest, ctx: Ctx) {
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
    return Response.json({ error: "Only pending batches can be discarded" }, { status: 400 });
  }

  db.prepare("UPDATE import_batches SET status = 'discarded' WHERE id = ?").run(batchId);

  return Response.json({ ok: true });
}
