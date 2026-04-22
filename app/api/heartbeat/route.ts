export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.user?.email ?? "";
  const user = db.prepare("SELECT id FROM users WHERE email = ?")
    .get(email) as { id: number } | undefined;
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  const body = await req.json().catch(() => ({} as any));
  const page = typeof body.page === "string" ? body.page.slice(0, 120) : null;
  const ua   = req.headers.get("user-agent")?.slice(0, 200) ?? null;

  db.prepare(`
    INSERT INTO user_presence (user_id, last_seen, last_page, user_agent)
    VALUES (?, datetime('now'), ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_seen  = datetime('now'),
      last_page  = excluded.last_page,
      user_agent = excluded.user_agent
  `).run(user.id, page, ua);

  return Response.json({ ok: true });
}
