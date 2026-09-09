export const dynamic = "force-dynamic";
import Link from "next/link";
import ReportCard from "@/components/reports/ReportCard";
import { requireReportsUser } from "@/lib/reports/access";
import { askReports, type Answer } from "@/lib/reports/ask";

/** Turn "[#12]" / "#12" into links to the report. */
function linkify(text: string) {
  const parts = text.split(/(\[?#\d+\]?)/g);
  return parts.map((p, i) => {
    const m = p.match(/^\[?#(\d+)\]?$/);
    if (!m) return <span key={i}>{p}</span>;
    return (
      <Link key={i} href={`/reports/${m[1]}`} className="text-accent hover:underline">
        [#{m[1]}]
      </Link>
    );
  });
}

export default async function AskPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireReportsUser();
  const { q } = await searchParams;
  let answer: Answer | null = null;
  let error: string | null = null;
  if (q?.trim()) {
    try {
      answer = await askReports(q);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
          placeholder="Did we ever install that chandelier at Pyramid?"
          autoComplete="off"
        />
        <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:bg-accent-strong">
          Ask
        </button>
      </form>
      <p className="text-xs text-muted">Answers come only from confirmed reports. Drafts are not searched.</p>

      {error && <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{error}</div>}

      {answer && (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text whitespace-pre-wrap">{linkify(answer.text)}</div>
          {answer.sources.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted mb-2">
                Cited reports ({answer.sources.length}; {answer.searched} were considered)
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {answer.sources.map((r) => (
                  <ReportCard key={r.id} r={r} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
