import { redirect } from "next/navigation";
import { auth }      from "@/auth";
import db            from "@/lib/db";
import Navbar        from "@/components/Navbar";
import ForecastClient from "@/components/ForecastClient";

export default async function ForecastPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  const rows = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.stage, p.contract_value, p.project_completion,
           p.is_pipeline,
           COALESCE(fp.designation,       'S')  AS designation,
           fp.underground_start,
           fp.rough_start,
           fp.rough_completion,
           fp.finish_start,
           fp.finish_completion,
           fp.payment_notes,
           COALESCE(fp.remaining_value, p.contract_value - p.total_invoiced) AS remaining_value
    FROM projects p
    LEFT JOIN forecast_projects fp ON fp.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all() as any[];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} />
      <ForecastClient rows={rows} role={role} />
    </div>
  );
}
