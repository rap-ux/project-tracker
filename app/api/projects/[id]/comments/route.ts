export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const comments = db.prepare(`
    SELECT id, user_name, body, mentions, created_at
    FROM project_comments
    WHERE project_id = ?
    ORDER BY created_at ASC
  `).all(parseInt(id));

  return Response.json({ comments });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id }  = await ctx.params;
  const body    = await req.json();
  const pid     = parseInt(id);
  const text    = (body.body ?? "").trim();
  if (!text) return Response.json({ error: "Empty comment" }, { status: 400 });

  // Extract @mentions (simple regex: @word)
  const mentionMatches = text.match(/@[A-Za-z0-9_.-]+/g) ?? [];
  const mentions = mentionMatches.map((m: string) => m.slice(1)).join(",");

  const result = db.prepare(`
    INSERT INTO project_comments (project_id, user_name, body, mentions)
    VALUES (?, ?, ?, ?)
  `).run(pid, session.user?.name ?? "Unknown", text, mentions || null);

  // Log to activity
  try {
    db.prepare(`
      INSERT INTO project_activity (project_id, user_name, action, details)
      VALUES (?, ?, ?, ?)
    `).run(pid, session.user?.name ?? "Unknown", "Comment",
      text.length > 80 ? text.slice(0, 77) + "…" : text);
  } catch {}

  return Response.json({ ok: true, id: result.lastInsertRowid });
}
