import { redirect } from "next/navigation";
import { auth }      from "@/auth";
import db            from "@/lib/db";
import Navbar        from "@/components/Navbar";
import InputsClient  from "@/components/InputsClient";

export default async function InputsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  const inputs = db.prepare(`
    SELECT p.id, p.name, p.foreman, p.contract_value, p.is_pipeline,
           COALESCE(pi.gross_margin,        0.575) AS gross_margin,
           COALESCE(pi.materials_share,     0.225) AS materials_share,
           COALESCE(pi.wages_share,         0.20)  AS wages_share,
           COALESCE(pi.blended_hourly_rate, 125)   AS blended_hourly_rate,
           COALESCE(pi.blended_hourly_wage, 37)    AS blended_hourly_wage,
           COALESCE(pi.rough_hours_est,     p.rough_hours_allowed) AS rough_hours_est,
           COALESCE(pi.finish_hours_est,    p.finish_hours_allowed) AS finish_hours_est
    FROM projects p
    LEFT JOIN project_inputs pi ON pi.project_id = p.id
    ORDER BY p.foreman, p.name
  `).all() as any[];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} />
      <InputsClient inputs={inputs} role={role} />
    </div>
  );
}
