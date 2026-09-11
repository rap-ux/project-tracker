export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import CopyButton from "@/components/reports/CopyButton";
import ReviewForm from "@/components/reports/ReviewForm";
import { requireReportsUser } from "@/lib/reports/access";
import { deleteReport, extractDraft, unconfirmReport } from "@/lib/reports/actions";
import { extractionAvailable } from "@/lib/reports/extract";
import { listProjects } from "@/lib/reports/projects";
import { getReport } from "@/lib/reports/queries";
import { CALLERS, jsonToLines, NOT_EXTRACTED, reportText } from "@/lib/reports/schema";

type Ctx = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function ReportPage({ params, searchParams }: Ctx) {
  await requireReportsUser();
  const { id } = await params;
  const { saved } = await searchParams;
  const r = getReport(Number(id));
  if (!r) notFound();
  const text = reportText(r);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            Report #{r.id}{" "}
            <span className={r.status === "confirmed" ? "text-success" : "text-warning"}>({r.status})</span>
          </h2>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs text-success">Draft saved</span>}
            {r.status === "draft" && (
              <form action={extractDraft}>
                <input type="hidden" name="id" value={r.id} />
                <button
                  type="submit"
                  disabled={!extractionAvailable()}
                  title={extractionAvailable() ? "Build the bullets from the transcript with Claude" : "ANTHROPIC_API_KEY is not set"}
                  className="rounded-md border border-border-strong px-2.5 py-1 text-xs text-text hover:bg-surface-2 disabled:opacity-50"
                >
                  {r.extraction_notes.startsWith(NOT_EXTRACTED) ? "Run extraction" : "Re-run extraction"}
                </button>
              </form>
            )}
          </div>
        </div>
        <ReviewForm
          r={{
            id: r.id,
            status: r.status,
            job_name: r.job_name,
            project_id: r.project_id,
            work_date: r.work_date,
            reporter: r.reporter,
            caller: r.caller,
            accomplished: jsonToLines(r.accomplished),
            nextSteps: jsonToLines(r.next_steps),
            blockers: jsonToLines(r.blockers),
            materials: jsonToLines(r.materials),
            people: jsonToLines(r.people),
            summary: r.summary,
            extraction_notes: r.extraction_notes,
          }}
          projects={listProjects()}
          callers={CALLERS}
        />
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-muted">Text to send</div>
            <CopyButton text={text} />
          </div>
          <pre className="whitespace-pre-wrap text-sm text-text font-sans">{text}</pre>
          {r.summary && <p className="mt-3 border-t border-border pt-2 text-xs text-muted">Summary: {r.summary}</p>}
        </div>

        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            Transcript · {r.source} · call {r.call_date} by {r.caller} · added by {r.created_by}
          </summary>
          {r.audio_path && (
            <audio controls preload="none" src={`/api/reports/audio/${r.id}`} className="mt-3 w-full" />
          )}
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-text font-mono">{r.transcript}</pre>
        </details>

        <div className="flex items-center gap-4 text-xs">
          {r.project_id && (
            <Link href={`/reports/jobs/${r.project_id}`} className="text-accent hover:underline">
              Job timeline
            </Link>
          )}
          {r.status === "confirmed" && (
            <Link href={`/reports/today?date=${r.work_date}`} className="text-accent hover:underline">
              Day digest
            </Link>
          )}
          {r.status === "confirmed" && (
            <form action={unconfirmReport}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="text-warning hover:underline">
                Back to draft
              </button>
            </form>
          )}
          <form action={deleteReport} className="ml-auto">
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="text-danger hover:underline">
              Delete report
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
