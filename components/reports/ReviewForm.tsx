"use client";
import { useActionState } from "react";
import { saveReport, type ActionState } from "@/lib/reports/actions";
import ProjectPicker, { type PickerProject } from "./ProjectPicker";

const field = "w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text";
const mono = `${field} font-mono text-xs`;
const label = "mb-1 block text-xs font-medium text-muted";

export interface ReviewValues {
  id: number;
  status: string;
  job_name: string;
  project_id: number | null;
  work_date: string;
  reporter: string;
  caller: string;
  accomplished: string; // textarea text
  nextSteps: string;
  blockers: string;
  materials: string;
  people: string;
  summary: string;
  extraction_notes: string;
}

export default function ReviewForm({
  r,
  projects,
  callers,
}: {
  r: ReviewValues;
  projects: PickerProject[];
  callers: string[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReport, undefined);
  const rows = (s: string) => Math.max(2, s.split("\n").length + 1);

  return (
    <form action={action} className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <input type="hidden" name="id" value={r.id} />
      {state?.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>
      )}
      {r.extraction_notes && (
        <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning whitespace-pre-wrap">
          <strong>Check:</strong> {r.extraction_notes}
        </div>
      )}

      <ProjectPicker projects={projects} defaultJobName={r.job_name} defaultProjectId={r.project_id} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={label}>Work date</label>
          <input name="workDate" type="date" defaultValue={r.work_date} required className={field} />
        </div>
        <div>
          <label className={label}>Job lead</label>
          <input name="reporter" defaultValue={r.reporter} required className={field} />
        </div>
        <div>
          <label className={label}>Caller</label>
          <select name="caller" defaultValue={r.caller} className={field}>
            {Array.from(new Set([...callers, r.caller])).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(
        [
          ["accomplished", "Accomplished", r.accomplished],
          ["nextSteps", "Next steps", r.nextSteps],
          ["blockers", "Blockers", r.blockers],
          ["materials", "Materials", r.materials],
          ["people", "Crew on site", r.people],
        ] as const
      ).map(([name, title, val]) => (
        <div key={name}>
          <label className={label}>{title} (one per line)</label>
          <textarea name={name} rows={rows(val)} defaultValue={val} className={mono} />
        </div>
      ))}

      <div>
        <label className={label}>Summary</label>
        <textarea name="summary" rows={2} defaultValue={r.summary} className={field} />
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="submit"
          name="confirm"
          value="0"
          disabled={pending}
          className="rounded-md border border-border-strong px-3 py-1.5 text-sm text-text hover:bg-surface-2 disabled:opacity-60"
        >
          Save draft
        </button>
        <button
          type="submit"
          name="confirm"
          value="1"
          disabled={pending}
          className="rounded-md bg-success text-white px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {r.status === "confirmed" ? "Save (stays confirmed)" : "Save and confirm"}
        </button>
        {pending && <span className="text-xs text-muted">Saving…</span>}
      </div>
    </form>
  );
}
