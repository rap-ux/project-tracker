"use client";
// Job picker for intake/review. Two fields travel together:
//   jobName   - the loose name as heard on the call (free text)
//   projectId - the Switchboard project it resolves to (select)
// Typing in jobName auto-suggests a project by name or alias; the select can
// always override. Saving teaches the alias to the project.
import { useMemo, useState } from "react";

export interface PickerProject {
  id: number;
  name: string;
  foreman: string;
  is_pipeline: number;
  aliases: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(the|job|project|house|residence|site|lot)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function guess(projects: PickerProject[], heard: string): number | "" {
  const n = norm(heard);
  if (!n) return "";
  for (const p of projects) {
    if (norm(p.name) === n || p.aliases.some((a) => norm(a) === n)) return p.id;
  }
  const partial = projects.filter((p) => norm(p.name).includes(n) || p.aliases.some((a) => norm(a).includes(n)));
  return partial.length === 1 ? partial[0].id : "";
}

export default function ProjectPicker({
  projects,
  defaultJobName = "",
  defaultProjectId = null,
}: {
  projects: PickerProject[];
  defaultJobName?: string;
  defaultProjectId?: number | null;
}) {
  const [jobName, setJobName] = useState(defaultJobName);
  // null = no manual pick yet, so the select follows the auto-guess from jobName.
  const [manual, setManual] = useState<number | "" | null>(defaultProjectId ?? null);
  const projectId: number | "" = manual !== null ? manual : guess(projects, jobName);

  const active = useMemo(() => projects.filter((p) => !p.is_pipeline), [projects]);
  const pipeline = useMemo(() => projects.filter((p) => p.is_pipeline), [projects]);
  const field = "w-full rounded-md border border-border bg-surface px-2.5 py-2 text-sm text-text";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Job as heard on the call</label>
        <input
          name="jobName"
          required
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
          className={field}
          placeholder="e.g. Pyramid, the Sherwood 38 job"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Switchboard project{" "}
          {projectId === "" && jobName ? <span className="text-warning">(no match yet, pick one)</span> : null}
        </label>
        <select
          name="projectId"
          value={projectId}
          onChange={(e) => setManual(e.target.value ? Number(e.target.value) : "")}
          className={field}
        >
          <option value="">— not linked —</option>
          <optgroup label="Active">
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.foreman})
              </option>
            ))}
          </optgroup>
          <optgroup label="Pipeline / other">
            {pipeline.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.foreman})
              </option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  );
}
