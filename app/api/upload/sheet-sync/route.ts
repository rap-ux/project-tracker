export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import { fetchSheetGrid, gsheetConfigured } from "@/lib/gsheet";
import { stageColumnGrid, createBatch } from "@/lib/importer";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // Two ways in: an owner/admin session (the Sync button) OR a matching
  // ?secret= (a nightly scheduler, so Nicole's sheet flows in hands-free).
  const providedSecret = req.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.BACKUP_SECRET;
  const secretOk = !!expectedSecret && providedSecret === expectedSecret;

  let userId = 0;
  if (!secretOk) {
    const session = await auth();
    if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const role = (session.user as any).role;
    if (role !== "owner" && role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    userId = (session.user as any).id ?? 0;
  }

  if (!gsheetConfigured()) {
    return Response.json({
      error: "Google Sheet sync isn't configured yet. Set GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY, GSHEET_ID and GSHEET_RANGE.",
    }, { status: 503 });
  }

  let grid: string[][];
  try {
    grid = await fetchSheetGrid();
  } catch (e: any) {
    return Response.json({ error: `Couldn't read the Google Sheet: ${e.message}` }, { status: 502 });
  }

  let result;
  try {
    result = stageColumnGrid(grid);
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  if (result.changes.length === 0) {
    return Response.json({
      ok: false,
      error: result.newProjects.length > 0
        ? `No changes to existing projects. ${result.newProjects.length} name(s) in the sheet aren't tracked yet — add them with "+ Add Project" first: ${result.newProjects.join(", ")}.`
        : "No changes — the sheet matches Switchboard already.",
      newProjects: result.newProjects,
    });
  }

  const stamp   = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const batchId = createBatch(`Google Sheet sync — ${stamp}`, "sheet", userId, result.changes);
  const projectCount = new Set(result.changes.map(c => c.project_id)).size;

  return Response.json({
    ok: true,
    batchId,
    changeCount:  result.changes.length,
    projectCount,
    newProjects:  result.newProjects,
  });
}
