export const dynamic = 'force-dynamic';
import { auth }        from "@/auth";
import { isAdminRole } from "@/lib/auth-roles";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

// Vendor rules for outside labor: which QBO vendors are outsourced crews and
// what hourly rate to back hours out of their bills (Nicole's ~$53/hr rule).
export async function GET() {
  const session = await auth();
  if (!session || !isAdminRole((session.user as any).role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const vendors = db.prepare(`
    SELECT v.vendor_ref, v.vendor_name, v.is_outside_labor, v.hourly_rate,
           COUNT(b.qbo_id)                                        AS bill_count,
           COALESCE(SUM(b.total), 0)                              AS bill_total
    FROM qbo_vendor_rules v
    LEFT JOIN qbo_bills b ON b.vendor_ref = v.vendor_ref
    GROUP BY v.vendor_ref
    ORDER BY v.is_outside_labor DESC, bill_total DESC
  `).all();

  return Response.json({ vendors });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session || !isAdminRole((session.user as any).role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { vendorRef, isOutsideLabor, hourlyRate } = body as {
    vendorRef: string; isOutsideLabor: boolean; hourlyRate?: number;
  };
  if (!vendorRef) return Response.json({ error: "vendorRef required" }, { status: 400 });
  const rate = Number(hourlyRate) > 0 ? Number(hourlyRate) : 53;

  db.prepare(`
    UPDATE qbo_vendor_rules
    SET is_outside_labor = ?, hourly_rate = ?, updated_at = datetime('now')
    WHERE vendor_ref = ?
  `).run(isOutsideLabor ? 1 : 0, rate, vendorRef);

  // Re-derive hours on this vendor's already-synced bills so the report
  // updates without waiting for the next QBO sync.
  db.prepare(`
    UPDATE qbo_bills
    SET is_outside_labor = ?, derived_hours = CASE WHEN ? THEN total / ? ELSE 0 END
    WHERE vendor_ref = ?
  `).run(isOutsideLabor ? 1 : 0, isOutsideLabor ? 1 : 0, rate, vendorRef);

  return Response.json({ ok: true });
}
