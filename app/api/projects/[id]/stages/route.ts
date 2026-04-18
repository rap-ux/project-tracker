export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// PUT /api/projects/[id]/stages
// Body: array of { stage, start_date, end_date }
// Upserts each stage row — inserts if missing, updates if exists.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id }   = await ctx.params;
  const projectId = parseInt(id);
  const body      = await req.json() as { stage: string; start_date: string | null; end_date: string | null; status?: string; notes?: string | null }[];

  if (!Array.isArray(body) || body.length === 0) {
    return Response.json({ error: "Expected array of stage objects" }, { status: 400 });
  }

  const upsert = db.prepare(`
    INSERT INTO project_stages (project_id, stage, start_date, end_date, status, notes, updated_at)
    VALUES (@project_id, @stage, @start_date, @end_date, @status, @notes, datetime('now'))
    ON CONFLICT (project_id, stage) DO UPDATE SET
      start_date = excluded.start_date,
      end_date   = excluded.end_date,
      status     = excluded.status,
      notes      = excluded.notes,
      updated_at = excluded.updated_at
  `);

  // project_stages may not have a unique constraint yet — add it safely
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_project_stages ON project_stages(project_id, stage)`);
  } catch { /* already exists */ }

  db.transaction((rows: typeof body) => {
    for (const r of rows) {
      upsert.run({
        project_id: projectId,
        stage:      r.stage,
        start_date: r.start_date || null,
        end_date:   r.end_date   || null,
        status:     r.status     ?? "Pending",
        notes:      r.notes      ?? null,
      });
    }
  })(body);

  return Response.json({ ok: true });
}
