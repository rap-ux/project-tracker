export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const activities = db.prepare(`
    SELECT id, user_name, action, details, created_at
    FROM project_activity
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(parseInt(id));

  return Response.json({ activities });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id }  = await ctx.params;
  const body    = await req.json();
  const { action, details } = body;

  if (!action) return Response.json({ error: "action required" }, { status: 400 });

  db.prepare(`
    INSERT INTO project_activity (project_id, user_name, action, details)
    VALUES (?, ?, ?, ?)
  `).run(parseInt(id), session.user?.name ?? "Unknown", action, details ?? null);

  return Response.json({ ok: true });
}
