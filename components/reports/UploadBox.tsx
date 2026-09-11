"use client";
// Upload card at the top of the Uploads tab: drop or pick a .txt transcript
// and/or a recording, name the job and lead, done. Lands as a draft.
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFiles, type ActionState } from "@/lib/reports/actions";

const field = "w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text";
const label = "mb-1 block text-xs font-medium text-muted";

export default function UploadBox({ projects, callers, today }: { projects: string[]; callers: string[]; today: string }) {
  const router = useRouter();
  const [names, setNames] = useState<string[]>([]);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    async (prev, form) => {
      const result = await uploadFiles(prev, form);
      if (result?.ok) {
        formRef.current?.reset();
        setNames([]);
        router.refresh();
      }
      return result;
    },
    undefined,
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDrag(false);
    if (fileRef.current && e.dataTransfer.files.length) {
      fileRef.current.files = e.dataTransfer.files;
      setNames(Array.from(e.dataTransfer.files).map((f) => f.name));
    }
  }

  return (
    <form ref={formRef} action={action} className="rounded-xl border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Upload a call</h2>
        <span className="text-xs text-muted">.txt / .docx / .pdf transcript, a recording, or both</span>
      </div>

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
          drag ? "border-accent bg-accent-soft" : "border-border-strong hover:border-accent hover:bg-surface-2"
        }`}
      >
        <input
          ref={fileRef}
          name="files"
          type="file"
          multiple
          accept=".txt,.md,.vtt,.srt,.rtf,.log,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/*,.m4a"
          className="hidden"
          onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
        />
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><polyline points="8 9 12 5 16 9"/><line x1="12" y1="5" x2="12" y2="16"/>
        </svg>
        {names.length ? (
          <span className="text-sm text-text font-medium">{names.join(", ")}</span>
        ) : (
          <>
            <span className="text-sm text-text font-medium">Drop files here or click to choose</span>
            <span className="text-xs text-muted">Transcript as .txt, Word or PDF, or the audio file itself</span>
          </>
        )}
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={label}>Job</label>
          <input name="jobName" list="upload-projects" className={field} placeholder="e.g. Pyramid" autoComplete="off" />
          <datalist id="upload-projects">{projects.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <div>
          <label className={label}>Lead on the call</label>
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

      {state?.error && <div className="rounded-md border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">{state.error}</div>}
      {state?.ok && <div className="rounded-md border border-success/40 bg-success-bg px-3 py-2 text-sm text-success">Uploaded. It is in the list below as a draft.</div>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !names.length} className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:bg-accent-strong disabled:opacity-50">
          {pending ? "Uploading…" : "Upload"}
        </button>
        <span className="text-xs text-muted">Job and lead can be fixed on review. Extraction runs from the review page.</span>
      </div>
    </form>
  );
}
