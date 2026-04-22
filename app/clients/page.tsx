export const dynamic = 'force-dynamic';
import { redirect }   from "next/navigation";
import { auth }        from "@/auth";
import db              from "@/lib/db";
import Navbar          from "@/components/Navbar";
import PrintButton     from "@/components/PrintButton";

export default async function ClientsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const role = (session.user as any).role;
  if (role === "foreman") redirect("/foreman");

  // All projects (active + pipeline), grouped by region then sorted by name
  const projects = db.prepare(`
    SELECT id, name, foreman, stage, is_pipeline,
           region, builder, contacts, phone,
           project_notes, basecamp_link, drive_folder,
           contract_value, total_invoiced
    FROM projects
    ORDER BY COALESCE(region,'ZZZ'), name
  `).all() as any[];

  // Group by region
  const grouped: Record<string, typeof projects> = {};
  for (const p of projects) {
    const key = p.region || "Other";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(p);
  }

  const regions = Object.keys(grouped).sort();
  const fmt$ = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Admin"} role={role} />

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Client &amp; Project Directory</h1>
            <p className="text-sm text-gray-500 mt-1">{projects.length} projects across {regions.length} regions</p>
          </div>
          <PrintButton />
        </div>

        {/* Print header */}
        <div className="hidden print:block mb-6">
          <h1 className="text-2xl font-bold">Totally Wired Electric — Client Directory</h1>
          <p className="text-sm text-gray-500">Generated {new Date().toLocaleDateString()}</p>
        </div>

        {regions.map(region => (
          <section key={region} className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-gray-800">📍 {region}</h2>
              <span className="text-xs text-gray-400">{grouped[region].length} projects</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none print:border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-white text-xs uppercase tracking-wide print:bg-gray-800" style={{ backgroundColor: "#101010" }}>
                      <th className="px-4 py-2.5 text-left">Project</th>
                      <th className="px-4 py-2.5 text-left">Foreman</th>
                      <th className="px-4 py-2.5 text-left">Stage</th>
                      <th className="px-4 py-2.5 text-left">Builder / GC</th>
                      <th className="px-4 py-2.5 text-left">Contact</th>
                      <th className="px-4 py-2.5 text-left">Phone</th>
                      <th className="px-4 py-2.5 text-left">Notes</th>
                      <th className="px-4 py-2.5 text-center print:hidden">Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grouped[region].map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${p.is_pipeline === 1 ? "opacity-70" : ""}`}>
                        <td className="px-4 py-3 font-medium text-gray-900">
                          <div className="flex items-center gap-1.5">
                            {p.name}
                            {p.is_pipeline === 1 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Minor</span>
                            )}
                          </div>
                          {p.contract_value > 0 && (
                            <div className="text-xs text-gray-400 font-normal">{fmt$(p.contract_value)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.foreman}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.stage === "Finish"            ? "bg-purple-100 text-purple-700" :
                            p.stage === "Extras"            ? "bg-amber-100   text-amber-700"  :
                            p.stage === "Contracting Phase" ? "bg-gray-100    text-gray-600"   :
                            p.stage === "Underground"       ? "bg-orange-100  text-orange-700" :
                                                              "bg-blue-100    text-blue-700"
                          }`}>{p.stage}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700">{p.builder || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{p.contacts || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{p.phone || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-400 italic max-w-[200px] truncate" title={p.project_notes ?? ""}>
                          {p.project_notes || "—"}
                        </td>
                        <td className="px-4 py-3 text-center print:hidden">
                          <div className="flex items-center gap-1.5 justify-center">
                            {p.basecamp_link && (
                              <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                                title="Open in Basecamp"
                                className="flex items-center justify-center w-6 h-6 rounded hover:opacity-75 transition-opacity">
                                <img src="/icons/basecamp.svg" alt="Basecamp" className="w-5 h-5" />
                              </a>
                            )}
                            {p.drive_folder && (
                              <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                                target="_blank" rel="noopener noreferrer"
                                title="Open in Google Drive"
                                className="flex items-center justify-center w-6 h-6 rounded hover:opacity-75 transition-opacity">
                                <img src="/icons/google-drive.svg" alt="Drive" className="w-5 h-5" />
                              </a>
                            )}
                            {!p.basecamp_link && !p.drive_folder && <span className="text-gray-300 text-xs">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}

      </main>
    </div>
  );
}
