"use client";

import React, { useState } from "react";

interface StageDate { stage: string; start_date: string | null; end_date: string | null }

interface Props {
  project: any;
  stagesForProject: StageDate[];
  onClose: () => void;
  onSaved: () => void;
}

function calcProjectCompletion(stage: string, stagePct: number): number {
  const sc = Math.min(1, Math.max(0, stagePct / 100));
  if (stage === "Rough" || stage === "Underground") return sc * 0.70;
  if (stage === "Finish")  return 0.70 + sc * 0.30;
  if (stage === "Extras")  return 1.0;
  return 0;
}

// Edit-project form, used by both the dashboard list and the project detail page.
export default function ProjectEditModal({ project, stagesForProject, onClose, onSaved }: Props) {
  const [draftStage,    setDraftStage]    = useState<string>(project.stage ?? "Rough");
  const [draftStagePct, setDraftStagePct] = useState<number>(Math.round((project.stage_completion ?? 0) * 100));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = {};
    const stageDates: StageDate[] = [];

    fd.forEach((v, k) => {
      if (k.startsWith("sd_start_") || k.startsWith("sd_end_")) return;
      body[k] = isNaN(Number(v)) || v === "" ? v : Number(v);
    });

    const stageNames = ["Underground", "Rough", "Finish"];
    for (const s of stageNames) {
      const start = (fd.get(`sd_start_${s}`) as string) || null;
      const end   = (fd.get(`sd_end_${s}`)   as string) || null;
      if (start !== null || end !== null) {
        stageDates.push({ stage: s, start_date: start || null, end_date: end || null });
      }
    }

    if (body.stage_completion != null) body.stage_completion = Math.min(1, Math.max(0, body.stage_completion / 100));
    delete body.project_completion;

    const saves: Promise<any>[] = [
      fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ];
    if (stageDates.length > 0) {
      saves.push(
        fetch(`/api/projects/${project.id}/stages`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stageDates),
        })
      );
    }

    await Promise.all(saves);
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold text-text">Edit: {project.name}</h2>
          <button onClick={onClose} className="text-subtle hover:text-muted text-2xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* ── CRM / project info ── */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">Project Info</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "name",     label: "Project Name",  type: "text" },
                { key: "foreman",  label: "Foreman",       type: "text" },
                { key: "region",   label: "Region",        type: "text" },
                { key: "builder",  label: "Builder / GC",  type: "text" },
                { key: "contacts", label: "Contacts",      type: "text" },
                { key: "phone",    label: "Phone",         type: "text" },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-muted mb-1">{f.label}</label>
                  <input name={f.key} type={f.type}
                    defaultValue={project[f.key] ?? ""}
                    className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Stage</label>
                <select name="stage" value={draftStage}
                  onChange={e => setDraftStage(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}>
                  {["Contracting Phase","Underground","Rough","Finish","Extras"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted mb-1">Project Notes</label>
                <input name="project_notes" type="text" defaultValue={project.project_notes ?? ""}
                  className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted mb-1">Basecamp Link</label>
                <input name="basecamp_link" type="text" defaultValue={project.basecamp_link ?? ""}
                  className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted mb-1">Drive Folder (name or URL)</label>
                <input name="drive_folder" type="text" defaultValue={project.drive_folder ?? ""}
                  className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
              </div>
            </div>
          </div>

          {/* ── Financial data (active projects only) ── */}
          {!project.is_pipeline && (
            <div>
              <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">Financial / Hours</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <label className="block text-xs font-medium text-muted mb-1">Stage Completion (%)</label>
                  <div className="relative">
                    <input name="stage_completion" type="number" step="1" min="0" max="100"
                      value={draftStagePct}
                      onChange={e => setDraftStagePct(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 pr-7 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-subtle pointer-events-none">%</span>
                  </div>
                </div>
                <div className="relative">
                  <label className="block text-xs font-medium text-muted mb-1">
                    Project Completion
                    <span className="ml-1 text-subtle font-normal">(auto)</span>
                  </label>
                  <div className="w-full px-2.5 py-1.5 text-sm border border-border rounded-lg bg-surface-2 text-muted flex items-center justify-between">
                    <span className="font-semibold text-text">
                      {(calcProjectCompletion(draftStage, draftStagePct) * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs text-subtle">
                      {draftStage === "Rough" || draftStage === "Underground"
                        ? `${draftStagePct}% × 70%`
                        : draftStage === "Finish"
                        ? `70% + ${draftStagePct}% × 30%`
                        : draftStage === "Extras" ? "100%" : "0%"}
                    </span>
                  </div>
                </div>
                {[
                  { key: "contract_value",       label: "Contract Value ($)",        type: "number" },
                  { key: "total_invoiced",       label: "Total Invoiced ($)",        type: "number" },
                  { key: "est_materials_budget",  label: "Est. Materials Budget ($)",      type: "number" },
                  { key: "actual_materials",      label: "Actual Materials ($)",           type: "number" },
                  { key: "unrecorded_materials",  label: "Unrecorded Materials ($)",       type: "number" },
                  { key: "est_total_hours",       label: "Est. Total Hours (auto)",        type: "number" },
                  { key: "actual_total_hours",    label: "Actual Total Hours",             type: "number" },
                  { key: "unrecorded_hours",      label: "Unrecorded Hours",               type: "number" },
                  { key: "goal_hours",           label: "Goal Hours (auto)",         type: "number" },
                  { key: "rough_hours_allowed",  label: "Rough Hours Allowed (auto)", type: "number" },
                  { key: "rough_hours_actual",   label: "Rough Hours Actual (auto)",  type: "number" },
                  { key: "finish_hours_allowed", label: "Finish Hours Allowed (auto)", type: "number" },
                  { key: "finish_hours_actual",  label: "Finish Hours Actual (auto)",  type: "number" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-muted mb-1">{f.label}</label>
                    <input name={f.key} type={f.type} step="any"
                      defaultValue={project[f.key] ?? ""}
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Schedule dates ── */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">Schedule Dates</p>
            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
              <div className="text-xs font-medium text-muted">Stage</div>
              <div className="text-xs font-medium text-muted">Start Date</div>
              <div className="text-xs font-medium text-muted">End / Completion Date</div>
              {(["Underground", "Rough", "Finish"] as const).map(stageName => {
                const existing = stagesForProject.find((s) => s.stage === stageName);
                return (
                  <React.Fragment key={stageName}>
                    <div className="flex items-center text-sm text-text font-medium">{stageName}</div>
                    <input
                      name={`sd_start_${stageName}`}
                      type="date"
                      defaultValue={existing?.start_date ?? ""}
                      className="px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
                    />
                    <input
                      name={`sd_end_${stageName}`}
                      type="date"
                      defaultValue={existing?.end_date ?? ""}
                      className="px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
                    />
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          <div className="col-span-2 flex gap-3 pt-2">
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-60">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
