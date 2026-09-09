// Read-only rendering of one report (server component friendly).
import Link from "next/link";
import { CATEGORY_LABEL, jobLabel, parseList, type Report } from "@/lib/reports/schema";

export default function ReportCard({ r, showJob = true }: { r: Report; showJob?: boolean }) {
  const sections: Array<[string, string]> = [
    [CATEGORY_LABEL.done, r.accomplished],
    [CATEGORY_LABEL.next, r.next_steps],
    [CATEGORY_LABEL.blocked, r.blockers],
    [CATEGORY_LABEL.needs, r.materials],
  ];
  const people = parseList(r.people);
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm">
          {showJob && (
            <span className="font-semibold text-text">
              {r.project_id ? (
                <Link href={`/reports/jobs/${r.project_id}`} className="hover:underline">
                  {jobLabel(r)}
                </Link>
              ) : (
                jobLabel(r)
              )}
            </span>
          )}
          <span className="text-muted">
            {showJob ? " · " : ""}
            {r.work_date} · {r.reporter}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {r.status === "draft" && <span className="rounded bg-warning-bg px-2 py-0.5 text-warning">draft</span>}
          <Link href={`/reports/${r.id}`} className="text-accent hover:underline">
            #{r.id}
          </Link>
        </div>
      </header>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {sections.map(([title, s]) => {
          const items = parseList(s);
          if (!items.length) return null;
          return (
            <div key={title}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">{title}</div>
              <ul className="mt-0.5 list-disc pl-4 text-sm text-text space-y-0.5">
                {items.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {people.length > 0 && <div className="mt-2 text-xs text-muted">Crew: {people.join(", ")}</div>}
    </article>
  );
}
