export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const changeOrders = db.prepare(`
    SELECT id, description, amount, status, co_date, created_by, created_at
    FROM change_orders
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(parseInt(id));

  return Response.json({ changeOrders });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id }  = await ctx.params;
  const body    = await req.json();
  const pid     = parseInt(id);

  const result = db.prepare(`
    INSERT INTO change_orders (project_id, description, amount, status, co_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    pid,
    body.description ?? "",
    Number(body.amount) || 0,
    body.status ?? "Quoted",
    body.co_date ?? null,
    session.user?.name ?? "Unknown"
  );

  // Log to activity
  try {
    db.prepare(`
      INSERT INTO project_activity (project_id, user_name, action, details)
      VALUES (?, ?, ?, ?)
    `).run(pid, session.user?.name ?? "Unknown", "Change Order",
      `Added CO: ${body.description} ($${Number(body.amount).toLocaleString()}) · ${body.status}`);
  } catch {}

  return Response.json({ ok: true, id: result.lastInsertRowid });
}
