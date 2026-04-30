export const dynamic = 'force-dynamic';
import { auth }                    from "@/auth";
import db                           from "@/lib/db";
import { NextRequest }              from "next/server";
import { extractClientIp, resolveIpGeo } from "@/lib/geo";

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
  const ip   = extractClientIp(req.headers);

  // Detect session start: no prior presence row, OR last_seen was >5 min ago.
  // Logged once per session into login_events for the historical access log.
  const prior = db.prepare(
    "SELECT last_seen FROM user_presence WHERE user_id = ?"
  ).get(user.id) as { last_seen: string } | undefined;
  const isNewSession =
    !prior ||
    !prior.last_seen ||
    (Date.now() - new Date(prior.last_seen.replace(" ", "T") + "Z").getTime()) > 5 * 60 * 1000;

  db.prepare(`
    INSERT INTO user_presence (user_id, last_seen, last_page, user_agent, ip_address)
    VALUES (?, datetime('now'), ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_seen  = datetime('now'),
      last_page  = excluded.last_page,
      user_agent = excluded.user_agent,
      ip_address = excluded.ip_address
  `).run(user.id, page, ua, ip);

  if (isNewSession) {
    db.prepare(`
      INSERT INTO login_events (user_id, ip_address, user_agent, page)
      VALUES (?, ?, ?, ?)
    `).run(user.id, ip, ua, page);
  }

  // Fire-and-forget geo lookup (won't block the heartbeat response).
  // Cached per IP, so each unique IP costs one external call ever.
  if (ip) resolveIpGeo(ip).catch(() => {});

  return Response.json({ ok: true });
}
