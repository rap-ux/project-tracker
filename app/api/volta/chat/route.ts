export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;
// Volta chat endpoint. Two callers:
//   1. The in-app widget: session cookie identifies the user.
//   2. A standalone client / bot service: `Authorization: Bearer <VOLTA_SERVICE_TOKEN>`
//      plus `x-volta-user-email` naming the Switchboard user it acts for.
// Body: { messages: [{ role: "user" | "assistant", content: string }, ...] }
import { NextRequest } from "next/server";
import { auth } from "@/auth";
import { logExchange, runVolta, voltaAvailable, type VoltaMessage } from "@/lib/volta/agent";
import { voltaUserFromEmail, voltaUserFromSession, type VoltaUser } from "@/lib/volta/access";

async function identify(req: NextRequest): Promise<{ user: VoltaUser | null; channel: "web" | "api" }> {
  const authz = req.headers.get("authorization") ?? "";
  const token = process.env.VOLTA_SERVICE_TOKEN;
  if (token && authz === `Bearer ${token}`) {
    return { user: voltaUserFromEmail(req.headers.get("x-volta-user-email")), channel: "api" };
  }
  return { user: voltaUserFromSession(await auth()), channel: "web" };
}

/** Widget bootstrap: is the caller signed in, and is Volta configured? */
export async function GET(req: NextRequest) {
  const { user } = await identify(req);
  if (!user) return Response.json({ ok: false }, { status: 401 });
  return Response.json({ ok: true, name: user.name, available: voltaAvailable(), operationsLog: user.canReadReports });
}

export async function POST(req: NextRequest) {
  const { user, channel } = await identify(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { messages?: VoltaMessage[] };
  try { body = await req.json(); } catch { return Response.json({ error: "Bad JSON" }, { status: 400 }); }
  const messages = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!messages.length) return Response.json({ error: "No message" }, { status: 400 });

  try {
    const result = await runVolta({ user, messages, channel });
    logExchange(channel, user, messages[messages.length - 1].content, result.text, result.toolsUsed);
    return Response.json({ text: result.text, toolsUsed: result.toolsUsed });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Volta failed" }, { status: 500 });
  }
}
