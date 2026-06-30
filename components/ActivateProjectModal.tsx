"use client";

import React, { useState } from "react";

interface Props {
  project: any;
  onClose: () => void;
  onActivated: () => void;
}

// Moves a Minor (pipeline) project into Tracked. Used from the dashboard list
// and the project detail page.
export default function ActivateProjectModal({ project, onClose, onActivated }: Props) {
  const [activating, setActivating] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActivating(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/projects/${project.id}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        is_pipeline:    0,
        contract_value: Number(fd.get("contract_value")) || 0,
        foreman:        fd.get("foreman"),
        stage:          fd.get("stage"),
      }),
    });
    setActivating(false);
    onActivated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b flex justify-between items-start">
          <div>
            <h2 className="text-base font-bold text-text">Activate Project</h2>
            <p className="text-xs text-muted mt-0.5">{project.name}</p>
          </div>
          <button onClick={onClose} className="text-subtle hover:text-muted text-2xl leading-none ml-4">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text mb-1">
              Contract Value <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle font-medium">$</span>
              <input
                name="contract_value" type="number" step="0.01" min="0" required
                defaultValue={project.contract_value > 0 ? project.contract_value : ""}
                placeholder="0.00"
                className="w-full pl-7 pr-3 py-2 text-sm border-2 border-border-strong rounded-lg focus:outline-none focus:border-[#00BAD6] font-mono"
                autoFocus
              />
            </div>
            <p className="text-xs text-subtle mt-1">Enter the signed contract amount before activating.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">Foreman</label>
            <input
              name="foreman" type="text" required defaultValue={project.foreman}
              className="w-full px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-1">Starting Stage</label>
            <select
              name="stage" defaultValue={project.stage}
              className="w-full px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
              style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}>
              <option value="Contracting Phase">Contracting Phase</option>
              <option value="Underground">Underground</option>
              <option value="Rough">Rough</option>
              <option value="Finish">Finish</option>
              <option value="Extras">Extras</option>
            </select>
          </div>

          <div className="rounded-lg px-4 py-3 text-xs text-muted space-y-0.5"
            style={{ backgroundColor: "var(--accent-soft)", border: "1px solid #a5f3fc" }}>
            <p className="font-semibold" style={{ color: "#00BAD6" }}>What happens on activation:</p>
            <p>• Moves to Tracked projects and counts toward KPIs</p>
            <p>• Appears in Forecast &amp; Inputs pages</p>
            <p>• Minor Projects toggle no longer needed to see it</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={activating}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ backgroundColor: "#00BAD6" }}>
              {activating ? "Activating…" : "✓ Confirm & Activate"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
