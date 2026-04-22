export const dynamic = 'force-dynamic';
import { auth } from "@/auth";
import db       from "@/lib/db";

const SUPER_ADMIN_EMAILS = ["rap@totallywiredelectric.com"];

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const email = session.user?.email ?? "";
  if (!SUPER_ADMIN_EMAILS.includes(email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.title,
           up.last_seen, up.last_page, up.user_agent, up.ip_address,
           g.city, g.region, g.country, g.country_code
    FROM users u
    LEFT JOIN user_presence up ON up.user_id = u.id
    LEFT JOIN ip_geo_cache   g  ON g.ip = up.ip_address
    ORDER BY
      CASE WHEN up.last_seen IS NULL THEN 1 ELSE 0 END,
      up.last_seen DESC,
      u.name
  `).all() as Array<{
    id: number; name: string; email: string; role: string;
    title: string | null; last_seen: string | null;
    last_page: string | null; user_agent: string | null;
    ip_address: string | null;
    city: string | null; region: string | null;
    country: string | null; country_code: string | null;
  }>;

  return Response.json({ users });
}
