export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireReportsUser } from "@/lib/reports/access";
import { projectReportCounts } from "@/lib/reports/queries";

export default async function JobsIndexPage() {
  await requireReportsUser();
  const rows = projectReportCounts();
  return (
    <div>
      <h2 className="text-base font-semibold text-text mb-2">Jobs with confirmed reports</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No confirmed reports yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
          {rows.map((p) => (
            <li key={p.project_id}>
              <Link href={`/reports/jobs/${p.project_id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2">
                <span className="font-medium text-text">{p.name}</span>
                <span className="text-muted">
                  {p.n} report{p.n === 1 ? "" : "s"} · last {p.last}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
