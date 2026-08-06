export const dynamic = 'force-dynamic';
export const runtime = "nodejs";
import { auth }                    from "@/auth";
import { isSuperAdmin }            from "@/lib/auth-roles";
import { qboConfigured, authorizeUrl } from "@/lib/qbo";
import { NextResponse }            from "next/server";
import crypto                      from "crypto";

// Kicks off the one-time Intuit OAuth consent for the real TWE company file.
// Super-admin only — this binds the whole app to a QBO realm.
export async function GET() {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user?.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!qboConfigured()) {
    return Response.json({ error: "QBO_CLIENT_ID / QBO_CLIENT_SECRET not configured" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("qbo_oauth_state", state, {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/",
  });
  return res;
}
