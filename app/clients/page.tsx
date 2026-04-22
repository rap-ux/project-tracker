export const dynamic = 'force-dynamic';
import { redirect }   from "next/navigation";
import { auth }        from "@/auth";
import db              from "@/lib/db";
import Navbar          from "@/components/Navbar";
import PrintButton     from "@/components/PrintButton";
import ClientsClient   from "@/components/ClientsClient";

export default async function ClientsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  const projects = db.prepare(`
    SELECT id, name, foreman, stage, is_pipeline,
           region, builder, contacts, phone,
           project_notes, basecamp_link, drive_folder,
           contract_value, total_invoiced
    FROM projects
    ORDER BY name
  `).all() as any[];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client &amp; Project Directory</h1>
            <p className="text-sm text-gray-500 mt-1">{projects.length} projects · builder, GC, and contact details</p>
          </div>
          <PrintButton />
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">Totally Wired Electric — Client Directory</h1>
          <p className="text-xs text-gray-500">Generated {new Date().toLocaleDateString()}</p>
        </div>

        <ClientsClient projects={projects} role={role} />
      </main>
    </div>
  );
}
