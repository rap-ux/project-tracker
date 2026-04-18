import { auth }       from "@/auth";
import db              from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const batches = db.prepare(`
    SELECT b.*, p.name AS project_name
    FROM import_batches b
    LEFT JOIN projects p ON b.project_id = p.id
    ORDER BY b.uploaded_at DESC
  `).all();

  return Response.json({ ok: true, batches });
}
