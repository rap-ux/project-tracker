export const dynamic = "force-dynamic";
import Link from "next/link";
import CopyButton from "@/components/reports/CopyButton";
import ReportCard from "@/components/reports/ReportCard";
import { requireReportsUser } from "@/lib/reports/access";
import { confirmedForDate, datesWithReports } from "@/lib/reports/queries";
import { digestText, isISODate, todayISO } from "@/lib/reports/schema";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await requireReportsUser();
  const sp = await searchParams;
  const date = isISODate(sp.date) ? sp.date : todayISO();
  const reports = confirmedForDate(date);
  const dates = datesWithReports(20);
  const text = digestText(date, reports);

  return (
    <div className="space-y-4">
      <form method="get" className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted">Work date</label>
        <input type="date" name="date" defaultValue={date} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text" />
        <button type="submit" className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface">
          Show
        </button>
        {dates.length > 0 && (
          <span className="text-xs text-muted ml-2">
            Recent:{" "}
            {dates.slice(0, 8).map((d) => (
              <Link key={d.work_date} href={`/reports/today?date=${d.work_date}`} className="text-accent hover:underline mr-2">
                {d.work_date} ({d.n})
              </Link>
            ))}
          </span>
        )}
      </form>

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-text">
            {date} · {reports.length} confirmed report{reports.length === 1 ? "" : "s"}
          </div>
          <CopyButton text={text} label="Copy message" />
        </div>
        <pre className="whitespace-pre-wrap text-sm text-text font-sans">{text}</pre>
        <p className="mt-3 text-xs text-muted">This is the message to text to Damon and Jared. Drafts are not included.</p>
      </div>

      {reports.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <ReportCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
