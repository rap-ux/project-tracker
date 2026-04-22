export const dynamic = 'force-dynamic';
import { auth } from "@/auth";
import db       from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const activities = db.prepare(`
    SELECT a.id, a.user_name, a.action, a.details, a.created_at,
           p.id as project_id, p.name as project_name, p.foreman
    FROM project_activity a
    JOIN projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC
    LIMIT 100
  `).all();

  return Response.json({ activities });
}
