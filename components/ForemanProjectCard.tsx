"use client";

import { useState } from "react";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

const STAGE_OPTIONS = ["Contracting Phase", "Underground", "Rough", "Finish", "Extras"];

const STATUS_STYLES: Record<string, string> = {
  critical:  "bg-red-100 text-red-800 border-red-200",
  "at-risk": "bg-orange-100 text-orange-800 border-orange-200",
  watch:     "bg-yellow-100 text-yellow-800 border-yellow-200",
  "on-track":"bg-blue-100 text-blue-800 border-blue-200",
  ahead:     "bg-green-100 text-green-800 border-green-200",
  gray:      "bg-gray-100 text-gray-600 border-gray-200",
};

function Bar({ value, max, color = "blue" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const cls: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", red: "bg-red-500",
    yellow: "bg-yellow-400", orange: "bg-orange-400", gray: "bg-gray-300",
  };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${cls[color] ?? "bg-blue-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

interface Project {
  id: number;
  name: string;
  stage: string;
  stage_completion: number;
  project_completion: number;
  actual_total_hours: number;
  goal_hours: number;
  actual_materials: number;
  est_materials_budget: number;
  total_invoiced: number;
  contract_value: number;
  inc: any;
}

export default function ForemanProjectCard({ project: initial }: { project: Project }) {
  const [project, setProject] = useState(initial);
  const [showModal, setShowModal] = useState(false);
  const [draftStage, setDraftStage] = useState(initial.stage);
  const [draftPct,   setDraftPct]   = useState(Math.round((initial.stage_completion ?? 0) * 100));
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState("");

  const p        = project;
  const { inc }  = p;
  const matPct   = p.est_materials_budget > 0 ? p.actual_materials / p.est_materials_budget : 0;
  const overMat  = matPct > 1.10;
  const statusSty = STATUS_STYLES[inc.projectStatus.key] ?? STATUS_STYLES.gray;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${p.id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: draftStage, stage_completion: draftPct }),
      });
      const data = await res.json();
      if (data.ok) {
        setProject(prev => ({
          ...prev,
          stage: draftStage,
          stage_completion: data.stage_completion,
          project_completion: data.project_completion,
        }));
        setMsg("✅ Updated!");
        setTimeout(() => { setMsg(""); setShowModal(false); }, 1200);
      } else {
        setMsg("❌ " + (data.error ?? "Failed"));
      }
    } catch {
      setMsg("❌ Network error");
    }
    setSaving(false);
  }

  return (
    <>
      <div className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${
        inc.projectStatus.key === "critical" ? "border-red-300" :
        inc.projectStatus.key === "at-risk"  ? "border-orange-300" :
        inc.projectStatus.key === "watch"    ? "border-yellow-300" : "border-gray-200"
      }`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{p.name}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{p.stage} · {fmtPct(p.project_completion)} complete</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap ${statusSty}`}>
              {inc.projectStatus.emoji} {inc.projectStatus.label}
            </span>
            <button
              onClick={() => { setDraftStage(p.stage); setDraftPct(Math.round((p.stage_completion ?? 0) * 100)); setShowModal(true); }}
              className="shrink-0 text-xs px-3 py-1.5 rounded-lg text-white font-semibold transition-opacity hover:opacity-80"
              style={{ backgroundColor: "#00BAD6" }}>
              ✏️ Update
            </button>
          </div>
        </div>

        {/* Highlight */}
        <div className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
          inc.projectStatus.key === "critical" ? "bg-red-50 text-red-800" :
          inc.projectStatus.key === "at-risk"  ? "bg-orange-50 text-orange-800" :
          inc.projectStatus.key === "watch"    ? "bg-yellow-50 text-yellow-800" :
          "bg-green-50 text-green-800"
        }`}>
          {inc.highlight}
        </div>

        {/* Hours progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Hours vs Goal</span>
            <span className={`font-semibold ${inc.varianceHours < 0 ? "text-red-600" : "text-green-700"}`}>
              {p.actual_total_hours.toLocaleString()} / {p.goal_hours.toLocaleString()} hrs
            </span>
          </div>
          <Bar value={p.actual_total_hours} max={p.goal_hours}
            color={
              inc.projectStatus.key === "critical" ? "red" :
              inc.projectStatus.key === "at-risk"  ? "orange" :
              inc.projectStatus.key === "watch"    ? "yellow" :
              inc.projectStatus.key === "ahead"    ? "green" : "blue"
            }
          />
        </div>

        {/* Materials progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Materials Used</span>
            <span className={`font-semibold ${overMat ? "text-red-600" : "text-gray-700"}`}>
              {fmt$(p.actual_materials)} / {fmt$(p.est_materials_budget)} ({fmtPct(matPct)})
            </span>
          </div>
          <Bar value={p.actual_materials} max={p.est_materials_budget}
            color={overMat ? "red" : matPct > 0.85 ? "yellow" : "green"} />
        </div>

        {/* Project completion */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500 font-medium">Project Progress</span>
            <span className="font-semibold text-gray-700">{fmtPct(p.project_completion)}</span>
          </div>
          <Bar value={p.project_completion} max={1} color="blue" />
        </div>

        {/* Per-stage bonus breakdown */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 text-xs">
          <p className="font-semibold text-gray-700">Stage Bonuses</p>
          {([
            { label: "Rough",  sb: inc.rough  },
            { label: "Finish", sb: inc.finish },
          ] as const).map(({ label, sb }) => {
            if (sb.status === "no-data") return (
              <div key={label} className="flex items-center justify-between text-gray-400">
                <span className="font-medium">{label}</span>
                <span>No budget set</span>
              </div>
            );
            if (sb.status === "too-early") return (
              <div key={label} className="flex items-center justify-between text-gray-400">
                <span className="font-medium text-gray-500">{label}</span>
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">Mobilization phase</span>
              </div>
            );
            if (sb.status === "locked") return (
              <div key={label} className="flex items-center justify-between">
                <span className="font-medium text-gray-600">{label}</span>
                <span className="flex items-center gap-1.5 text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  🔒 Stage must reach 100%
                </span>
              </div>
            );
            const isGood = sb.variance >= 0;
            const varPct = (Math.abs(sb.variancePct) * 100).toFixed(1) + "%";
            const varHrs = Math.abs(sb.variance).toFixed(0);
            return (
              <div key={label} className={`rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 ${
                sb.status === "beat" ? "bg-green-50 border border-green-200" :
                sb.status === "meet" ? "bg-blue-50  border border-blue-200"  :
                                      "bg-red-50   border border-red-200"
              }`}>
                <div>
                  <span className="font-semibold text-gray-800">{label} — </span>
                  <span className={
                    sb.status === "beat" ? "text-green-700 font-semibold" :
                    sb.status === "meet" ? "text-blue-700 font-semibold"  : "text-red-700 font-semibold"
                  }>{sb.label}</span>
                  <span className="ml-2 text-gray-500">
                    {sb.actual.toLocaleString()} / {sb.allowed.toLocaleString()} hrs
                    · {isGood ? "−" : "+"}{varHrs} hrs ({varPct})
                  </span>
                </div>
                {sb.earned > 0 && (
                  <span className="shrink-0 font-bold text-green-700 text-sm">+{fmt$(sb.earned)}</span>
                )}
              </div>
            );
          })}
          {inc.totalEarned > 0 ? (
            <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
              <span className="text-gray-700">Confirmed earned</span>
              <span className="text-green-700">{fmt$(inc.totalEarned)}</span>
            </div>
          ) : (
            <p className="text-gray-400 pt-1 border-t border-gray-200">No bonus confirmed yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end text-xs text-gray-400 pt-1 border-t border-gray-100">
          <span>Stage: {fmtPct(p.stage_completion)} done</span>
        </div>
      </div>

      {/* ── Quick Update Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-gray-900">Quick Update</h2>
                <p className="text-xs text-gray-400">{p.name}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Stage */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Current Stage</label>
                <div className="flex flex-wrap gap-2">
                  {STAGE_OPTIONS.map(s => (
                    <button type="button" key={s}
                      onClick={() => setDraftStage(s)}
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                        draftStage === s
                          ? "text-white border-transparent"
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                      style={draftStage === s ? { backgroundColor: "#00BAD6", borderColor: "#00BAD6" } : {}}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stage completion slider */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-semibold text-gray-800">Stage Completion</label>
                  <span className="text-xl font-bold" style={{ color: "#00BAD6" }}>{draftPct}%</span>
                </div>
                <input
                  type="range"
                  min="0" max="100" step="5"
                  value={draftPct}
                  onChange={e => setDraftPct(Number(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: "#00BAD6" }}
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
              </div>

              {msg && (
                <p className={`text-sm text-center font-medium ${msg.startsWith("✅") ? "text-green-700" : "text-red-600"}`}>{msg}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: "#00BAD6" }}>
                  {saving ? "Saving…" : "✓ Save Update"}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
