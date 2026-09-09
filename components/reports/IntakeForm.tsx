"use client";
import { useActionState } from "react";
import { createReport, type ActionState } from "@/lib/reports/actions";
import ProjectPicker, { type PickerProject } from "./ProjectPicker";

const field = "w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text";
const label = "mb-1 block text-xs font-medium text-muted";

export default function IntakeForm({
  projects,
  reporters,
  callers,
  today,
  transcriptionAvailable,
  extractionAvailable,
}: {
  projects: PickerProject[];
  reporters: string[];
  callers: string[];
  today: string;
  transcriptionAvailable: boolean;
  extractionAvailable: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createReport, undefined);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-border bg-surface p-5">
      {!extractionAvailable && (
        <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">
          ANTHROPIC_API_KEY is not set. You can fill the form, but extraction will fail until it is added.
        </div>
      )}
      {state?.error && (
        <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>
      )}

      <ProjectPicker projects={projects} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={label}>Job lead on the call</label>
          <input name="reporter" required list="reporters" className={field} placeholder="e.g. Fernando" autoComplete="off" />
          <datalist id="reporters">
            {reporters.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={label}>Who made the call</label>
          <select name="caller" className={field} defaultValue={callers[0]}>
            {callers.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Call date</label>
          <input name="callDate" type="date" required defaultValue={today} className={field} />
        </div>
        <div>
          <label className={label}>Work date (if different)</label>
          <input name="workDate" type="date" className={field} />
        </div>
      </div>

      <div>
        <label className={label}>Transcript (paste from iPhone Notes, RingCentral, anywhere)</label>
        <textarea name="transcript" rows={14} className={`${field} font-mono text-xs`} placeholder="Paste the call transcript here" />
      </div>

      <div>
        <label className={label}>
          Audio file (optional)
          {!transcriptionAvailable && (
            <span className="text-warning"> — stored for the record; transcription is not set up, so paste the transcript too</span>
          )}
        </label>
        <input name="audio" type="file" accept="audio/*,.m4a" className="text-sm text-text" />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:bg-accent-strong disabled:opacity-60"
        >
          {pending ? "Extracting…" : "Create draft report"}
        </button>
        <p className="text-xs text-muted">Takes a few seconds. You land on a draft you can edit before confirming.</p>
      </div>
    </form>
  );
}
