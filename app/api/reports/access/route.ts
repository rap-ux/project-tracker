export const dynamic = "force-dynamic";
// Tells the Navbar whether to show the Daily Reports link. Returns only a
// boolean, never the allow-list itself.
import { reportsUser } from "@/lib/reports/access";

export async function GET() {
  const user = await reportsUser();
  return Response.json({ allowed: !!user }, { headers: { "Cache-Control": "private, max-age=300" } });
}
