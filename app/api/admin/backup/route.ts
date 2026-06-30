export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import db from "@/lib/db";
import fs from "fs";
import path from "path";
import { isSuperAdmin } from "@/lib/auth-roles";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Super-admin only — the file contains the full users table (with password hashes).
  if (!isSuperAdmin(session.user?.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Flush WAL into the main DB so the snapshot includes the latest writes.
  db.pragma("wal_checkpoint(TRUNCATE)");

  const dbPath = path.join(process.cwd(), "data", "projects.db");
  const buf = fs.readFileSync(dbPath);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `projects-${stamp}.db`;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
