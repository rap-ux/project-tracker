"use client";
import { useActionState } from "react";
import { dropTranscript, type ActionState } from "@/lib/reports/actions";

const field = "w-full rounded-md border border-border bg-surface px-3 py-2.5 text-base text-text";
const label = "mb-1 block text-xs font-medium text-muted";

export default function DropForm({ token, today, callers }: { token: string; today: string; callers: string[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(dropTranscript, undefined);

  if (state?.ok) {
    return (
      <div className="rounded-xl border border-success/40 bg-success-bg p-5 text-center">
        <p className="text-lg font-semibold text-success">Got it.</p>
        <p className="mt-1 text-sm text-muted">Saved to the Operations Log inbox. You can send another.</p>
        <button onClick={() => window.location.reload()} className="mt-4 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">Send another</button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state?.error && <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>Job</label>
          <input name="jobName" className={field} placeholder="e.g. Pyramid" autoComplete="off" />
        </div>
        <div>
          <label className={label}>Lead you talked to</label>
          <input name="reporter" className={field} placeholder="e.g. Fernando" autoComplete="off" />
        </div>
        <div>
          <label className={label}>Call date</label>
          <input name="callDate" type="date" defaultValue={today} className={field} />
        </div>
        <div>
          <label className={label}>Who called</label>
          <select name="caller" className={field} defaultValue={callers[0]}>
            {callers.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className={label}>Transcript (paste)</label>
        <textarea name="transcript" rows={10} className={`${field} text-sm`} placeholder="Paste the call transcript here" />
      </div>

      <div>
        <label className={label}>Or the recording</label>
        <input name="audio" type="file" accept="audio/*,.m4a" className="text-sm text-text" />
      </div>

      <button type="submit" disabled={pending} className="w-full rounded-lg bg-accent text-accent-foreground px-4 py-3 text-base font-semibold hover:bg-accent-strong disabled:opacity-60">
        {pending ? "Sending…" : "Send to Operations Log"}
      </button>
      <p className="text-xs text-muted text-center">Either a transcript or a recording is enough. Job and lead can be fixed later.</p>
    </form>
  );
}
