import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.stage, p.contract_value, p.project_completion,
           COALESCE(fp.designation,       'S')  AS designation,
           fp.underground_start,
           fp.rough_start,
           fp.rough_completion,
           fp.finish_start,
           fp.finish_completion,
           fp.payment_notes,
           COALESCE(fp.remaining_value, p.contract_value - p.total_invoiced) AS remaining_value
    FROM projects p
    LEFT JOIN forecast_projects fp ON fp.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all();

  return Response.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    project_id:       number;
    designation:      string;
    underground_start?: string;
    rough_start?:      string;
    rough_completion?: string;
    finish_start?:     string;
    finish_completion?: string;
    payment_notes?:    string;
    remaining_value?:  number;
  };

  db.prepare(`
    INSERT INTO forecast_projects
      (project_id, designation, underground_start, rough_start, rough_completion,
       finish_start, finish_completion, payment_notes, remaining_value)
    VALUES
      (@project_id, @designation, @underground_start, @rough_start, @rough_completion,
       @finish_start, @finish_completion, @payment_notes, @remaining_value)
    ON CONFLICT(project_id) DO UPDATE SET
      designation       = excluded.designation,
      underground_start = excluded.underground_start,
      rough_start       = excluded.rough_start,
      rough_completion  = excluded.rough_completion,
      finish_start      = excluded.finish_start,
      finish_completion = excluded.finish_completion,
      payment_notes     = excluded.payment_notes,
      remaining_value   = excluded.remaining_value,
      updated_at        = datetime('now')
  `).run({
    project_id:        body.project_id,
    designation:       body.designation      ?? "S",
    underground_start: body.underground_start ?? null,
    rough_start:       body.rough_start       ?? null,
    rough_completion:  body.rough_completion  ?? null,
    finish_start:      body.finish_start      ?? null,
    finish_completion: body.finish_completion ?? null,
    payment_notes:     body.payment_notes     ?? null,
    remaining_value:   body.remaining_value   ?? 0,
  });

  return Response.json({ ok: true });
}
