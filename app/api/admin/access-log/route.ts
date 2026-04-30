export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import db       from "@/lib/db";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Owners only — admins/foremen don't see access telemetry.
  const role = (session.user as any)?.role;
  if (role !== "owner") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pagination — default 100, cap 500 so a giant log doesn't blow up the page.
  const limit  = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get("limit"))  || 100));
  const offset = Math.max(0,        Number(req.nextUrl.searchParams.get("offset")) || 0);

  const rows = db.prepare(`
    SELECT le.id, le.occurred_at, le.ip_address, le.user_agent, le.page,
           u.name  AS user_name,
           u.email AS user_email,
           u.role  AS user_role,
           g.city, g.region, g.country, g.country_code
    FROM login_events le
    LEFT JOIN users         u ON u.id = le.user_id
    LEFT JOIN ip_geo_cache  g ON g.ip = le.ip_address
    ORDER BY le.occurred_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = (db.prepare("SELECT COUNT(*) AS n FROM login_events").get() as { n: number }).n;

  return Response.json({ rows, total, limit, offset });
}
