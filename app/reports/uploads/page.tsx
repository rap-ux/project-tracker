export const dynamic = "force-dynamic";
// Uploads: every transcript/recording that has come in, newest call first,
// with a text preview that expands to the full transcript. Drafts (not yet
// reviewed) float to the top.
import Link from "next/link";
import UploadBox from "@/components/reports/UploadBox";
import { requireReportsUser } from "@/lib/reports/access";
import { listProjects } from "@/lib/reports/projects";
import { allUploads } from "@/lib/reports/queries";
import { CALLERS, jobLabel, NOT_EXTRACTED, todayISO } from "@/lib/reports/schema";

export default async function UploadsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireReportsUser();
  const { filter } = await searchParams;
  const all = allUploads();
  const drafts = all.filter((r) => r.status === "draft");
  const rows = filter === "drafts" ? drafts : filter === "confirmed" ? all.filter((r) => r.status === "confirmed") : all;

  const chip = (key: string | undefined, label: string, n: number) => {
    const active = (filter ?? "") === (key ?? "");
    return (
      <Link
        href={key ? `/reports/uploads?filter=${key}` : "/reports/uploads"}
        className={`rounded-full px-3 py-1 text-xs font-medium border ${active ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted hover:text-text"}`}
      >
        {label} <span className="opacity-70">{n}</span>
      </Link>
    );
  };

  return (
    <div className="space-y-4">
      <UploadBox projects={listProjects().map((p) => p.name)} callers={CALLERS} today={todayISO()} />

      <div className="flex items-center gap-2 flex-wrap">
        {chip(undefined, "All", all.length)}
        {chip("drafts", "Needs review", drafts.length)}
        {chip("confirmed", "Confirmed", all.length - drafts.length)}
        <span className="text-xs text-muted ml-auto">Each upload is stored as-is. Open one to read the full transcript or play the recording.</span>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
          Nothing here yet. Upload one above, paste with the button top right, or send Cole the drop link.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const notExtracted = r.extraction_notes.startsWith(NOT_EXTRACTED);
            const preview = r.transcript.replace(/\s+/g, " ").slice(0, 220);
            return (
              <li key={r.id} className="rounded-xl border border-border bg-surface">
                <details className="group">
                  <summary className="cursor-pointer list-none px-4 py-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <span className="font-semibold text-text">{jobLabel(r)}</span>
                        <span className="text-muted">· {r.reporter} · call {r.call_date} by {r.caller}</span>
                        {r.status === "draft" && (
                          <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[11px] text-warning">{notExtracted ? "needs extraction" : "needs review"}</span>
                        )}
                        {r.status === "confirmed" && <span className="rounded bg-success-bg px-1.5 py-0.5 text-[11px] text-success">confirmed</span>}
                        {!r.project_id && <span className="rounded bg-warning-bg px-1.5 py-0.5 text-[11px] text-warning">unlinked job</span>}
                      </div>
                      <p className="mt-1 text-xs text-muted line-clamp-2">{preview}{r.transcript.length > 220 ? "…" : ""}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="text-subtle">{r.source}{r.audio_path ? " + audio" : ""} · #{r.id}</span>
                      <Link href={`/reports/${r.id}`} className="rounded-md border border-border-strong px-2 py-1 text-text hover:bg-surface-2">
                        {r.status === "draft" ? "Review" : "Open"}
                      </Link>
                    </div>
                  </summary>
                  <div className="border-t border-border px-4 py-3 space-y-3">
                    {r.audio_path && <audio controls preload="none" src={`/api/reports/audio/${r.id}`} className="w-full" />}
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap text-xs text-text font-mono">{r.transcript}</pre>
                    <p className="text-[11px] text-subtle">Added by {r.created_by} · {r.created_at.slice(0, 16).replace("T", " ")}</p>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
