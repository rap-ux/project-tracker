export const dynamic = 'force-dynamic';
import { redirect }    from "next/navigation";
import { auth }         from "@/auth";
import db               from "@/lib/db";
import Navbar           from "@/components/Navbar";
import UploadsClient    from "@/components/UploadsClient";

export default async function UploadsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") redirect("/dashboard");

  // All batches, most recent first
  const batches = db.prepare(`
    SELECT b.*, p.name AS project_name
    FROM import_batches b
    LEFT JOIN projects p ON b.project_id = p.id
    ORDER BY b.uploaded_at DESC
  `).all() as any[];

  // Load full change detail for pending batches only
  const pendingIds = batches.filter(b => b.status === "pending").map(b => b.id);
  const changesByBatch: Record<number, any[]> = {};

  if (pendingIds.length > 0) {
    const placeholders = pendingIds.map(() => "?").join(",");
    const changes = db.prepare(`
      SELECT * FROM import_staged_changes
      WHERE batch_id IN (${placeholders})
      ORDER BY project_name, field
    `).all(...pendingIds) as any[];

    for (const c of changes) {
      if (!changesByBatch[c.batch_id]) changesByBatch[c.batch_id] = [];
      changesByBatch[c.batch_id].push(c);
    }
  }

  // Project list for per-project import selector
  const projects = db.prepare(
    "SELECT id, name FROM projects WHERE is_pipeline = 0 ORDER BY name"
  ).all() as { id: number; name: string }[];

  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />
      <UploadsClient
        batches={batches}
        changesByBatch={changesByBatch}
        projects={projects}
      />
    </div>
  );
}
