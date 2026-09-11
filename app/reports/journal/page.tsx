export const dynamic = "force-dynamic";
// Journal: the running diary of confirmed daily reports, newest first,
// sectioned by month then day. Each day links to its copyable digest.
import Link from "next/link";
import CopyButton from "@/components/reports/CopyButton";
import ReportCard from "@/components/reports/ReportCard";
import { requireReportsUser } from "@/lib/reports/access";
import { journal, projectReportCounts } from "@/lib/reports/queries";
import { digestText } from "@/lib/reports/schema";

function dayLabel(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ month?: string; job?: string }> }) {
  await requireReportsUser();
  const { month, job } = await searchParams;
  let months = journal();
  const jobs = projectReportCounts();
  if (job) {
    const id = Number(job);
    months = months
      .map((m) => ({ ...m, days: m.days.map((d) => ({ ...d, reports: d.reports.filter((r) => r.project_id === id) })).filter((d) => d.reports.length) }))
      .filter((m) => m.days.length);
  }
  const shown = month ? months.filter((m) => m.month === month) : months;
  const total = months.reduce((a, m) => a + m.days.reduce((b, d) => b + d.reports.length, 0), 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      {/* Side index */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start text-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-subtle mb-1">Months</div>
          <ul className="space-y-0.5">
            <li>
              <Link href={`/reports/journal${job ? `?job=${job}` : ""}`} className={`block rounded px-2 py-1 ${!month ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>All</Link>
            </li>
            {months.map((m) => (
              <li key={m.month}>
                <Link href={`/reports/journal?month=${m.month}${job ? `&job=${job}` : ""}`} className={`flex justify-between rounded px-2 py-1 ${month === m.month ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>
                  <span>{m.label}</span>
                  <span className="opacity-60">{m.days.reduce((a, d) => a + d.reports.length, 0)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {jobs.length > 0 && (
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-subtle mb-1">Jobs</div>
            <ul className="space-y-0.5 max-h-72 overflow-auto">
              <li><Link href={`/reports/journal${month ? `?month=${month}` : ""}`} className={`block rounded px-2 py-1 ${!job ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>All jobs</Link></li>
              {jobs.map((j) => (
                <li key={j.project_id}>
                  <Link href={`/reports/journal?job=${j.project_id}${month ? `&month=${month}` : ""}`} className={`flex justify-between rounded px-2 py-1 ${job === String(j.project_id) ? "bg-accent-soft text-accent" : "text-muted hover:text-text"}`}>
                    <span className="truncate">{j.name}</span><span className="opacity-60 ml-2">{j.n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {/* Diary */}
      <div className="space-y-8">
        {total === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
            The journal fills in as uploads are reviewed and confirmed. Drafts are not shown here.
          </p>
        ) : (
          shown.map((m) => (
            <section key={m.month} id={m.month}>
              <h2 className="sticky top-14 z-10 -mx-1 px-1 py-2 bg-surface-2 text-lg font-bold text-text border-b border-border-strong">{m.label}</h2>
              <div className="mt-3 space-y-6">
                {m.days.map((d) => (
                  <div key={d.date} className="relative border-l-2 border-border-strong pl-5">
                    <span className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full bg-accent" />
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-text">
                        {dayLabel(d.date)} <span className="text-muted font-normal">· {d.reports.length} report{d.reports.length === 1 ? "" : "s"}</span>
                      </h3>
                      <div className="flex items-center gap-2">
                        <Link href={`/reports/today?date=${d.date}`} className="text-xs text-accent hover:underline">Day digest</Link>
                        <CopyButton text={digestText(d.date, d.reports)} label="Copy day" />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {d.reports.map((r) => <ReportCard key={r.id} r={r} />)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
