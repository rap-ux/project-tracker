export const dynamic = 'force-dynamic';
import { auth }        from "@/auth";
import { isAdminRole } from "@/lib/auth-roles";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

// Manual QBO-customer → project mapping. Auto matching only claims exact/prefix
// name matches; everything else lands here for a human to assign.
export async function GET() {
  const session = await auth();
  if (!session || !isAdminRole((session.user as any).role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Distinct customers across all synced docs, with what they're worth — so the
  // list can be worked biggest-first and dormant $0 customers can be ignored.
  const customers = db.prepare(`
    SELECT customer_ref, MAX(customer_name) AS customer_name,
           SUM(docs) AS docs, SUM(total) AS total, MAX(project_id) AS project_id
    FROM (
      SELECT customer_ref, customer_name, COUNT(*) AS docs, SUM(total) AS total, project_id
      FROM qbo_estimates WHERE customer_ref IS NOT NULL GROUP BY customer_ref
      UNION ALL
      SELECT customer_ref, customer_name, COUNT(*), SUM(total), project_id
      FROM qbo_invoices WHERE customer_ref IS NOT NULL GROUP BY customer_ref
    )
    GROUP BY customer_ref
    ORDER BY total DESC
  `).all() as any[];

  const projects = db.prepare(
    "SELECT id, name, qbo_customer_id, qbo_mapping_source FROM projects ORDER BY name"
  ).all();

  return Response.json({ customers, projects });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || !isAdminRole((session.user as any).role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { customerRef, projectId } = await req.json() as {
    customerRef: string; projectId: number | null;
  };
  if (!customerRef) return Response.json({ error: "customerRef required" }, { status: 400 });

  db.transaction(() => {
    // A customer maps to at most one project; release any project holding it.
    db.prepare("UPDATE projects SET qbo_customer_id = NULL, qbo_mapping_source = NULL WHERE qbo_customer_id = ?")
      .run(String(customerRef));

    if (projectId) {
      db.prepare("UPDATE projects SET qbo_customer_id = ?, qbo_mapping_source = 'manual' WHERE id = ?")
        .run(String(customerRef), projectId);
    }

    // Re-point already-synced documents immediately (no need to wait for a sync).
    for (const table of ["qbo_estimates", "qbo_invoices", "qbo_bills"]) {
      db.prepare(`UPDATE ${table} SET project_id = ? WHERE customer_ref = ?`)
        .run(projectId ?? null, String(customerRef));
    }
  })();

  try {
    if (projectId) {
      db.prepare(`
        INSERT INTO project_activity (project_id, user_name, action, details)
        VALUES (?, ?, 'QBO Mapping', ?)
      `).run(projectId, session.user?.name ?? "Unknown", `Mapped QBO customer ${customerRef} to this project`);
    }
  } catch {}

  return Response.json({ ok: true });
}
