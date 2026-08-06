export const dynamic = 'force-dynamic';
import { auth }            from "@/auth";
import db                  from "@/lib/db";
import { rollupDivision }  from "@/lib/qboSync";
import { NextRequest }     from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// The QBO revenue stack for one project: estimates and invoices with memos
// (Cole's "collection of invoices with descriptions that lead to a total"),
// outside-labor bills, and the AV/electric rollup.
export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const pid = parseInt(id);

  const estimates = db.prepare(`
    SELECT qbo_id, doc_number, txn_date, memo, total, status,
           division, division_override, av_pct, electric_pct
    FROM qbo_estimates WHERE project_id = ? ORDER BY txn_date DESC, doc_number DESC
  `).all(pid) as any[];

  const invoices = db.prepare(`
    SELECT qbo_id, doc_number, txn_date, memo, total, balance, linked_estimate_qbo_id,
           division, division_override, av_pct, electric_pct
    FROM qbo_invoices WHERE project_id = ? ORDER BY txn_date DESC, doc_number DESC
  `).all(pid) as any[];

  const bills = db.prepare(`
    SELECT qbo_id, vendor_name, doc_number, txn_date, memo, total, is_outside_labor, derived_hours
    FROM qbo_bills WHERE project_id = ? ORDER BY txn_date DESC
  `).all(pid) as any[];

  const lastSync = db.prepare(
    "SELECT finished_at FROM qbo_sync_log WHERE status = 'ok' ORDER BY id DESC LIMIT 1"
  ).get() as { finished_at: string } | undefined;

  return Response.json({
    estimates, invoices, bills,
    rollup: rollupDivision(estimates, invoices),
    outsideLaborHours: bills.filter(b => b.is_outside_labor)
                            .reduce((s, b) => s + (b.derived_hours || 0), 0),
    orphanCount: invoices.filter(i => !i.linked_estimate_qbo_id).length,
    lastSync: lastSync?.finished_at ?? null,
  });
}

// Manual division override for one estimate or invoice.
export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const { kind, qboId, division } = body as { kind: string; qboId: string; division: string | null };
  const table = kind === "invoice" ? "qbo_invoices" : "qbo_estimates";
  const allowed = [null, "electric", "av", "mixed", "unknown"];
  if (!allowed.includes(division)) {
    return Response.json({ error: "Bad division" }, { status: 400 });
  }

  db.prepare(`UPDATE ${table} SET division_override = ? WHERE qbo_id = ?`).run(division, String(qboId));

  try {
    db.prepare(`
      INSERT INTO project_activity (project_id, user_name, action, details)
      VALUES (?, ?, ?, ?)
    `).run(parseInt(id), session.user?.name ?? "Unknown", "QBO Division",
      `Set ${kind} #${qboId} division to ${division ?? "auto"}`);
  } catch {}

  return Response.json({ ok: true });
}
