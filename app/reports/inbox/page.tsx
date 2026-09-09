export const dynamic = "force-dynamic";
import Link from "next/link";
import ReportCard from "@/components/reports/ReportCard";
import { requireReportsUser } from "@/lib/reports/access";
import { draftReports, recentConfirmed } from "@/lib/reports/queries";
import { jobLabel } from "@/lib/reports/schema";

export default async function InboxPage() {
  await requireReportsUser();
  const drafts = draftReports();
  const recent = recentConfirmed(15);

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-semibold text-text">
            Inbox <span className="text-muted font-normal">· {drafts.length} awaiting review</span>
          </h2>
          <Link href="/reports/new" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:bg-accent-strong">
            New report
          </Link>
        </div>
        {drafts.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            Nothing waiting. Drafts land here from a pasted transcript, an audio upload, or (later) RingCentral.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {drafts.map((r) => (
              <li key={r.id}>
                <Link href={`/reports/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <div className="text-sm">
                    <span className="font-medium text-text">{jobLabel(r)}</span>
                    {!r.project_id && <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-[11px] text-warning">unlinked job</span>}
                    <span className="text-muted"> · {r.reporter} · work {r.work_date}</span>
                  </div>
                  <div className="text-xs text-muted">
                    call {r.call_date} by {r.caller} · {r.source} · #{r.id}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold text-text mb-2">Recently confirmed</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted">No confirmed reports yet.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {recent.map((r) => (
              <ReportCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
