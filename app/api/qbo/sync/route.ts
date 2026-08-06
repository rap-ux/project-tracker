export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth }        from "@/auth";
import { getConnection } from "@/lib/qbo";
import { runQboSync }  from "@/lib/qboSync";
import { notifySlack, appUrl } from "@/lib/slack";
import type { NextRequest } from "next/server";

// Pulls estimates/invoices/bills from QuickBooks Online. Trigger nightly via a
// scheduler hitting ?secret=<BACKUP_SECRET>, or run it as an owner/admin
// (e.g. the "Sync QBO" button on /uploads). GET and POST both work.
export async function GET(req: NextRequest)  { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const provided = req.nextUrl.searchParams.get("secret");
  const expected = process.env.BACKUP_SECRET;
  const secretOk = !!expected && provided === expected;
  if (!secretOk) {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (role !== "owner" && role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!getConnection()) {
    return Response.json({ error: "QBO not connected — visit /api/qbo/connect first." }, { status: 503 });
  }

  try {
    const r = await runQboSync();
    const parts = [
      `📗 QBO sync: ${r.estimates} estimates, ${r.invoices} invoices, ${r.bills} bills.`,
      r.orphans ? `⚠ ${r.orphans} invoice${r.orphans === 1 ? "" : "s"} with no linked estimate.` : "",
      r.unmapped.length ? `❓ Unmapped QBO customers: ${r.unmapped.slice(0, 8).join(", ")}${r.unmapped.length > 8 ? "…" : ""}` : "",
      `<${appUrl("/report")}|Open report>`,
    ].filter(Boolean);
    notifySlack(parts.join("\n")).catch(() => {});
    return Response.json({ ok: true, ...r });
  } catch (e: any) {
    return Response.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
