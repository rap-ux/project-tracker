export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

const OVERRIDE_COLS = [
  "underground_start_pct",    "underground_start_amount",
  "rough_start_pct",          "rough_start_amount",
  "rough_completion_pct",     "rough_completion_amount",
  "finish_start_pct",         "finish_start_amount",
  "finish_completion_pct",    "finish_completion_amount",
] as const;

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
           COALESCE(fp.remaining_value, p.contract_value - p.total_invoiced) AS remaining_value,
           fp.underground_start_pct,    fp.underground_start_amount,
           fp.rough_start_pct,          fp.rough_start_amount,
           fp.rough_completion_pct,     fp.rough_completion_amount,
           fp.finish_start_pct,         fp.finish_start_amount,
           fp.finish_completion_pct,    fp.finish_completion_amount
    FROM projects p
    LEFT JOIN forecast_projects fp ON fp.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all();

  return Response.json(rows);
}

// Coerce "" / undefined / "null" / non-finite into SQLite NULL so empty inputs clear the override.
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as Record<string, any>;

  const params: Record<string, any> = {
    project_id:        body.project_id,
    designation:       body.designation      ?? "S",
    underground_start: body.underground_start ?? null,
    rough_start:       body.rough_start       ?? null,
    rough_completion:  body.rough_completion  ?? null,
    finish_start:      body.finish_start      ?? null,
    finish_completion: body.finish_completion ?? null,
    payment_notes:     body.payment_notes     ?? null,
    remaining_value:   body.remaining_value   ?? 0,
  };
  for (const c of OVERRIDE_COLS) params[c] = num(body[c]);

  db.prepare(`
    INSERT INTO forecast_projects
      (project_id, designation, underground_start, rough_start, rough_completion,
       finish_start, finish_completion, payment_notes, remaining_value,
       underground_start_pct, underground_start_amount,
       rough_start_pct,       rough_start_amount,
       rough_completion_pct,  rough_completion_amount,
       finish_start_pct,      finish_start_amount,
       finish_completion_pct, finish_completion_amount)
    VALUES
      (@project_id, @designation, @underground_start, @rough_start, @rough_completion,
       @finish_start, @finish_completion, @payment_notes, @remaining_value,
       @underground_start_pct, @underground_start_amount,
       @rough_start_pct,       @rough_start_amount,
       @rough_completion_pct,  @rough_completion_amount,
       @finish_start_pct,      @finish_start_amount,
       @finish_completion_pct, @finish_completion_amount)
    ON CONFLICT(project_id) DO UPDATE SET
      designation       = excluded.designation,
      underground_start = excluded.underground_start,
      rough_start       = excluded.rough_start,
      rough_completion  = excluded.rough_completion,
      finish_start      = excluded.finish_start,
      finish_completion = excluded.finish_completion,
      payment_notes     = excluded.payment_notes,
      remaining_value   = excluded.remaining_value,
      underground_start_pct     = excluded.underground_start_pct,
      underground_start_amount  = excluded.underground_start_amount,
      rough_start_pct           = excluded.rough_start_pct,
      rough_start_amount        = excluded.rough_start_amount,
      rough_completion_pct      = excluded.rough_completion_pct,
      rough_completion_amount   = excluded.rough_completion_amount,
      finish_start_pct          = excluded.finish_start_pct,
      finish_start_amount       = excluded.finish_start_amount,
      finish_completion_pct     = excluded.finish_completion_pct,
      finish_completion_amount  = excluded.finish_completion_amount,
      updated_at        = datetime('now')
  `).run(params);

  return Response.json({ ok: true });
}
