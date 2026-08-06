export const dynamic = 'force-dynamic';
export const runtime = "nodejs";
import { auth }         from "@/auth";
import { isSuperAdmin } from "@/lib/auth-roles";
import { exchangeCode } from "@/lib/qbo";
import { notifySlack }  from "@/lib/slack";
import { NextRequest, NextResponse } from "next/server";

// Intuit redirects here after consent with ?code=...&realmId=...&state=...
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session || !isSuperAdmin(session.user?.email)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const code    = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state   = searchParams.get("state");
  const expected = req.cookies.get("qbo_oauth_state")?.value;

  if (!code || !realmId) {
    return Response.json({ error: "Missing code or realmId" }, { status: 400 });
  }
  if (!expected || state !== expected) {
    return Response.json({ error: "State mismatch — restart from /api/qbo/connect" }, { status: 400 });
  }

  try {
    await exchangeCode(code, realmId);
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Token exchange failed" }, { status: 500 });
  }

  notifySlack(`🔌 QuickBooks Online connected (realm ${realmId}). Run a sync from /uploads.`).catch(() => {});

  const res = NextResponse.redirect(new URL("/uploads?qbo=connected", req.url));
  res.cookies.delete("qbo_oauth_state");
  return res;
}
