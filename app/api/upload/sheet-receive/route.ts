export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { stageColumnGrid, createBatch } from "@/lib/importer";
import { notifySlack, appUrl } from "@/lib/slack";
import type { NextRequest } from "next/server";

// Receives a SUMMARY_Project KPIs grid pushed from the sheet's Apps Script.
// Auth is a shared secret (?secret= or { secret } in the body) matching
// BACKUP_SECRET — no Google Cloud key needed, so org key-creation policies
// don't block us. Stages changes for the same manual review/apply flow.
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const provided = req.nextUrl.searchParams.get("secret") ?? body.secret;
  const expected = process.env.BACKUP_SECRET;
  if (!expected || provided !== expected) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const grid = body.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    return Response.json({ error: "No grid data received" }, { status: 400 });
  }
  // Normalise every cell to a string (Apps Script sends mixed types).
  const strGrid: string[][] = grid.map((row: any[]) =>
    (Array.isArray(row) ? row : []).map(c => (c == null ? "" : String(c))));

  let result;
  try { result = stageColumnGrid(strGrid); }
  catch (e: any) { return Response.json({ error: e.message }, { status: 400 }); }

  if (result.changes.length === 0) {
    return Response.json({
      ok: false,
      error: result.newProjects.length > 0
        ? `No changes to existing projects. New names not tracked yet: ${result.newProjects.join(", ")}.`
        : "No changes — the sheet matches Switchboard already.",
      newProjects: result.newProjects,
    });
  }

  const stamp   = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const batchId = createBatch(`Google Sheet sync — ${stamp}`, "sheet", 0, result.changes);
  const projectCount = new Set(result.changes.map(c => c.project_id)).size;

  // Ping Slack so a synced batch never sits unreviewed (best-effort).
  const newNote = result.newProjects.length
    ? ` ⚠️ ${result.newProjects.length} new project(s) not tracked yet: ${result.newProjects.join(", ")}.`
    : "";
  notifySlack(
    `📥 *${result.changes.length} change${result.changes.length === 1 ? "" : "s"}* synced from the sheet across ` +
    `${projectCount} project${projectCount === 1 ? "" : "s"}. Review & apply: ${appUrl("/uploads")}${newNote}`
  ).catch(() => {});

  return Response.json({
    ok: true, batchId,
    changeCount: result.changes.length,
    projectCount,
    newProjects: result.newProjects,
  });
}
