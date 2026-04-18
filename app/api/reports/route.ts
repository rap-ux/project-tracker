import { auth } from "@/auth";

export async function POST() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // Email delivery coming soon — button is ready
  return Response.json({ ok: true, sent: false, message: "Report feature coming soon." });
}
