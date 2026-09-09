export const dynamic = 'force-dynamic';
import { auth }            from "@/auth";
import db                   from "@/lib/db";
import { applyStagedChanges, type StagedChangeRow } from "@/lib/importer";
import { postStageReport }  from "@/lib/stageReport";
import { NextRequest }      from "next/server";

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
  `).all(...changeIds, batchId) as StagedChangeRow[];

  if (changes.length === 0) {
    return Response.json({ error: "No valid changes found" }, { status: 400 });
  }

  // Apply updates (creates staged new projects first; see lib/importer.ts)
  let result: { projectIds: number[]; created: string[] };
  try {
    result = applyStagedChanges(batchId, changes, session.user?.name ?? "Unknown");
  } catch (e: any) {
    return Response.json({ error: e.message ?? "Apply failed" }, { status: 500 });
  }

  db.transaction(() => {
    // Mark batch applied
    db.prepare(
      "UPDATE import_batches SET status = 'applied', applied_at = datetime('now') WHERE id = ?"
    ).run(batchId);

    // Backward-compat: log to uploads table
    db.prepare("INSERT INTO uploads (filename, uploaded_by, rows_updated) VALUES (?, ?, ?)")
      .run(batch.filename, batch.uploaded_by, result.projectIds.length);
  })();

  // The DB just changed — post a per-stage snapshot scoped to the projects that
  // moved in this sync (best-effort; never blocks the apply).
  postStageReport(result.projectIds).catch(() => {});

  return Response.json({ ok: true, applied: changes.length, projects: result.projectIds.length, created: result.created });
}
