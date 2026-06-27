"use client";

import { useState, useMemo, useRef } from "react";

// ── Stage config ──────────────────────────────────────────────────────────────
const STAGES = [
  { key: "Contracting Phase", label: "Contracting",  color: "#6b7280", bg: "var(--surface-2)",  border: "#d1d5db" },
  { key: "Underground",       label: "Underground",  color: "#ea580c", bg: "var(--warning-bg)",  border: "#fed7aa" },
  { key: "Rough",             label: "Rough",        color: "#2563eb", bg: "var(--info-bg)",  border: "#bfdbfe" },
  { key: "Finish",            label: "Finish",       color: "#7c3aed", bg: "var(--surface-2)",  border: "#ddd6fe" },
  { key: "Extras",            label: "Extras",       color: "#b45309", bg: "var(--warning-bg)",  border: "#fde68a" },
] as const;

type StageKey  = typeof STAGES[number]["key"];
type ViewType  = "kanban" | "schedule" | "gantt";

const STAGE_BAR_COLOR: Record<string, { solid: string; light: string; text: string }> = {
  "Contracting Phase": { solid: "#6b7280", light: "#f3f4f6", text: "#374151" },
  "Underground":       { solid: "#ea580c", light: "#fed7aa", text: "#9a3412" },
  "Rough":             { solid: "#3b82f6", light: "#bfdbfe", text: "#1e40af" },
  "Finish":            { solid: "#7c3aed", light: "#ddd6fe", text: "#4c1d95" },
  "Extras":            { solid: "#b45309", light: "#fde68a", text: "#78350f" },
};

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(0) + "%";

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  "Complete":    { bg: "var(--success-bg)", color: "#16a34a", border: "#bbf7d0" },
  "In Progress": { bg: "var(--accent-soft)", color: "#00BAD6", border: "#a5f3fc" },
  "Pending":     { bg: "var(--surface-2)", color: "#9ca3af", border: "#e5e7eb" },
};

function statusStyle(s: string) {
  return STATUS_STYLE[s] ?? STATUS_STYLE["Pending"];
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${MONTH_NAMES[parseInt(m[2]) - 1]} ${parseInt(m[3])}, ${m[1]}`;
}

function fmtDateShort(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${MONTH_NAMES[parseInt(m[2]) - 1]} ${parseInt(m[3])}`;
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function stageConfig(key: string) {
  return STAGES.find(s => s.key === key) ?? STAGES[2];
}

function progressColor(pct: number) {
  if (pct >= 0.9) return "#7c3aed";
  if (pct >= 0.6) return "#2563eb";
  if (pct >= 0.3) return "#00BAD6";
  return "#93c5fd";
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  projects:        any[];
  stagesByProject: Record<number, any[]>;
}

export default function TimelineClient({ projects, stagesByProject }: Props) {
  const [filterForeman, setFilterForeman] = useState("all");
  const [showPipeline,  setShowPipeline]  = useState(false);
  const [view,          setView]          = useState<ViewType>("kanban");

  // Local copy of projects + stages so drags / saves update instantly without a full page reload
  const [localProjects, setLocalProjects] = useState<any[]>(projects);
  const [localStages,   setLocalStages]   = useState<Record<number, any[]>>(stagesByProject);

  // Drag-and-drop state
  const [draggingId,   setDraggingId]   = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [dragSaving,    setDragSaving]    = useState(false);
  const [dragMsg,       setDragMsg]       = useState("");

  function calcProjectCompletion(stage: string, sc: number): number {
    const s = Math.min(1, Math.max(0, sc ?? 0));
    if (stage === "Rough" || stage === "Underground") return s * 0.70;
    if (stage === "Finish")  return 0.70 + s * 0.30;
    if (stage === "Extras")  return 1.0;
    return 0;
  }

  async function handleDrop(projectId: number, newStage: string) {
    const current = localProjects.find(p => p.id === projectId);
    if (!current || current.stage === newStage) return;

    const previousStage = current.stage;

    // Optimistic update
    setLocalProjects(ps => ps.map(p => p.id === projectId ? {
      ...p,
      stage: newStage,
      project_completion: calcProjectCompletion(newStage, p.stage_completion ?? 0),
    } : p));
    setDragSaving(true);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ stage: newStage }),
      });
      if (!res.ok) throw new Error("save failed");
      setDragMsg(`✅ Moved to ${newStage}`);
      setTimeout(() => setDragMsg(""), 1800);
    } catch {
      // Revert
      setLocalProjects(ps => ps.map(p => p.id === projectId ? { ...p, stage: previousStage } : p));
      setDragMsg(`❌ Failed to move ${current.name}`);
      setTimeout(() => setDragMsg(""), 3000);
    }
    setDragSaving(false);
  }
  // Inline edit state  (key = `${project_id}_${stage}`)
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editDraft,  setEditDraft]  = useState<any>(null);
  const [savingRow,  setSavingRow]  = useState(false);
  const [saveMsg,    setSaveMsg]    = useState<{ key: string; ok: boolean; text: string } | null>(null);

  function startEdit(row: any) {
    const key = `${row.project_id}_${row.stage}`;
    setEditingRow(key);
    setEditDraft({ ...row });
    setSaveMsg(null);
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editDraft) return;
    setSavingRow(true);
    const key = `${editDraft.project_id}_${editDraft.stage}`;
    const res = await fetch(`/api/projects/${editDraft.project_id}/stages`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{
        stage:      editDraft.stage,
        start_date: editDraft.start_date || null,
        end_date:   editDraft.end_date   || null,
        status:     editDraft.status     || "Pending",
        notes:      editDraft.notes      || null,
      }]),
    });
    setSavingRow(false);
    if (res.ok) {
      // Update local stage cache immediately
      setLocalStages(prev => {
        const pid     = editDraft.project_id;
        const existed = prev[pid]?.some((s: any) => s.stage === editDraft.stage) ?? false;
        const updated = existed
          ? (prev[pid] ?? []).map((s: any) => s.stage === editDraft.stage ? { ...s, ...editDraft } : s)
          : [...(prev[pid] ?? []), { ...editDraft }];
        return { ...prev, [pid]: updated };
      });
      setSaveMsg({ key, ok: true, text: "✅ Saved" });
      setTimeout(() => setSaveMsg(null), 2000);
      setEditingRow(null);
    } else {
      setSaveMsg({ key, ok: false, text: "❌ Failed" });
    }
  }

  const foremen = ["all", ...Array.from(new Set(localProjects.map((p: any) => p.foreman))).sort()];

  const visible = localProjects.filter((p: any) => {
    if (!showPipeline && p.is_pipeline) return false;
    if (filterForeman !== "all" && p.foreman !== filterForeman) return false;
    return true;
  });

  // Group by stage for kanban
  const grouped: Record<string, any[]> = {};
  for (const s of STAGES) grouped[s.key] = [];
  for (const p of visible) {
    const key = p.stage as StageKey;
    if (grouped[key]) grouped[key].push(p);
    else grouped["Rough"].push(p);
  }

  // Flat schedule rows sorted by status then start_date
  const scheduleRows = useMemo(() => {
    const rows: any[] = [];
    for (const p of visible) {
      for (const s of localStages[p.id] ?? []) {
        rows.push({ ...s, project: p });
      }
    }
    rows.sort((a, b) => {
      const order: Record<string, number> = { "In Progress": 0, "Pending": 1, "Complete": 2 };
      const ao = order[a.status] ?? 1;
      const bo = order[b.status] ?? 1;
      if (ao !== bo) return ao - bo;
      if (!a.start_date && !b.start_date) return 0;
      if (!a.start_date) return 1;
      if (!b.start_date) return -1;
      return a.start_date.localeCompare(b.start_date);
    });
    return rows;
  }, [visible, localStages]);

  const totalActive   = localProjects.filter(p => !p.is_pipeline).length;
  const totalPipeline = localProjects.filter(p =>  p.is_pipeline).length;

  return (
    <main className="flex-1 w-full px-4 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text">Project Timeline</h1>
          <p className="text-sm text-muted mt-0.5">
            {totalActive} active · {totalPipeline} minor
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["kanban", "schedule", "gantt"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 font-medium transition-colors"
                style={view === v
                  ? { backgroundColor: "#101010", color: "#fff" }
                  : { backgroundColor: "var(--surface)", color: "#6b7280" }}>
                {v === "kanban" ? "🗂 Kanban" : v === "schedule" ? "📅 Schedule" : "📊 Gantt"}
              </button>
            ))}
          </div>

          {/* Foreman filter */}
          <select value={filterForeman} onChange={e => setFilterForeman(e.target.value)}
            className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none">
            {foremen.map(f => <option key={f} value={f}>{f === "all" ? "All Foremen" : f}</option>)}
          </select>

          {/* Minor Projects toggle */}
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
            <div className="relative w-9 h-5 rounded-full transition-colors"
              style={showPipeline ? { backgroundColor: "#00BAD6" } : { backgroundColor: "#d1d5db" }}
              onClick={() => setShowPipeline(p => !p)}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-surface rounded-full shadow transition-transform ${showPipeline ? "translate-x-4" : ""}`} />
            </div>
            Minor Projects
          </label>
        </div>
      </div>

      {/* ── Kanban view ── */}
      {view === "kanban" && (
        <>
          {dragMsg && (
            <div className="sticky top-[52px] z-20 flex justify-center">
              <span className={`text-xs px-3 py-1 rounded-full shadow-md ${
                dragMsg.startsWith("✅") ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
              }`}>
                {dragMsg}
              </span>
            </div>
          )}
          <p className="text-xs text-subtle italic">💡 Drag cards between columns to change their stage</p>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map(stage => {
              const cards = grouped[stage.key] ?? [];
              const isTarget = dragOverStage === stage.key;
              return (
                <div
                  key={stage.key}
                  className="flex-shrink-0 w-72 flex flex-col gap-2"
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage.key); }}
                  onDragLeave={() => { if (dragOverStage === stage.key) setDragOverStage(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    const id = Number(e.dataTransfer.getData("text/plain"));
                    if (id) handleDrop(id, stage.key);
                    setDragOverStage(null);
                    setDraggingId(null);
                  }}>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg transition-all"
                    style={{
                      backgroundColor: stage.bg,
                      border: `${isTarget ? 2 : 1}px ${isTarget ? "dashed" : "solid"} ${isTarget ? stage.color : stage.border}`,
                      boxShadow: isTarget ? `0 0 0 4px ${stage.border}` : "none",
                    }}>
                    <span className="text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: stage.border, color: stage.color }}>
                      {cards.length}
                    </span>
                  </div>
                  <div
                    className={`flex flex-col gap-2 min-h-[60px] rounded-xl transition-colors ${isTarget ? "bg-info-bg/40" : ""}`}
                    style={isTarget ? { outline: `2px dashed ${stage.color}`, outlineOffset: "-4px" } : {}}>
                    {cards.length === 0 && (
                      <div className="text-center text-xs text-subtle py-6 border border-dashed border-border rounded-xl">
                        {isTarget ? `Drop to move here →` : "No projects"}
                      </div>
                    )}
                    {cards.map((p: any) => (
                      <div
                        key={p.id}
                        draggable={!dragSaving}
                        onDragStart={e => {
                          e.dataTransfer.setData("text/plain", String(p.id));
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(p.id);
                        }}
                        onDragEnd={() => { setDraggingId(null); setDragOverStage(null); }}
                        style={{ opacity: draggingId === p.id ? 0.4 : 1, cursor: dragSaving ? "wait" : "grab" }}>
                        <ProjectCard
                          project={p}
                          stages={localStages[p.id] ?? []}
                          stageColor={stage.color}
                          stageBg={stage.bg}
                          stageBorder={stage.border}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Schedule view ── */}
      {view === "schedule" && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-2 border-b border-border text-[11px] uppercase tracking-wider text-muted font-semibold">
                  <th className="px-4 py-3 text-left sticky left-0 bg-surface-2">Project</th>
                  <th className="px-4 py-3 text-left">Foreman</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Start</th>
                  <th className="px-4 py-3 text-center">End</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-center w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {scheduleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-subtle text-sm">No stage data available</td>
                  </tr>
                )}
                {scheduleRows.map((row, i) => {
                  const rowKey  = `${row.project_id}_${row.stage}`;
                  const isEdit  = editingRow === rowKey;
                  const cfg     = stageConfig(row.stage);
                  const ss      = statusStyle(isEdit ? editDraft?.status : row.status);
                  const inputCls = "w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-surface";

                  return (
                    <tr key={i} className={`group transition-colors ${isEdit ? "bg-info-bg" : "hover:bg-surface-2"}`}>
                      {/* Project — read-only */}
                      <td className="px-4 py-2.5 font-medium text-text sticky left-0 bg-inherit whitespace-nowrap">
                        {row.project.name}
                        {row.project.is_pipeline
                          ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-surface-2 text-subtle font-normal">Minor</span>
                          : null}
                      </td>

                      {/* Foreman — read-only */}
                      <td className="px-4 py-2.5 text-muted whitespace-nowrap">{row.project.foreman}</td>

                      {/* Stage — read-only (it's the row identifier) */}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {row.stage}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {isEdit ? (
                          <select
                            value={editDraft.status ?? "Pending"}
                            onChange={e => setEditDraft((d: any) => ({ ...d, status: e.target.value }))}
                            className={inputCls + " min-w-[110px]"}>
                            <option>In Progress</option>
                            <option>Pending</option>
                            <option>Complete</option>
                          </select>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                            {row.status}
                          </span>
                        )}
                      </td>

                      {/* Start date */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {isEdit ? (
                          <input type="date" value={editDraft.start_date ?? ""}
                            onChange={e => setEditDraft((d: any) => ({ ...d, start_date: e.target.value || null }))}
                            className={inputCls} />
                        ) : (
                          <span className="text-muted font-mono text-xs">{fmtDate(row.start_date)}</span>
                        )}
                      </td>

                      {/* End date */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {isEdit ? (
                          <input type="date" value={editDraft.end_date ?? ""}
                            onChange={e => setEditDraft((d: any) => ({ ...d, end_date: e.target.value || null }))}
                            className={inputCls} />
                        ) : (
                          <span className="text-muted font-mono text-xs">{fmtDate(row.end_date)}</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-2.5 text-subtle text-xs max-w-xs">
                        {isEdit ? (
                          <input type="text" value={editDraft.notes ?? ""}
                            onChange={e => setEditDraft((d: any) => ({ ...d, notes: e.target.value }))}
                            placeholder="Notes…"
                            className={inputCls + " min-w-[160px]"} />
                        ) : (
                          <span className="truncate block">{row.notes || ""}</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        {isEdit ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={saveEdit}
                              disabled={savingRow}
                              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors font-medium">
                              {savingRow ? "…" : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2.5 py-1 text-xs bg-surface-2 hover:bg-surface-3 rounded transition-colors">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {saveMsg?.key === rowKey && saveMsg && (
                              <span className={`text-xs font-medium ${saveMsg.ok ? "text-success" : "text-danger"}`}>
                                {saveMsg.text}
                              </span>
                            )}
                            <button
                              onClick={() => startEdit(row)}
                              className="w-6 h-6 flex items-center justify-center rounded text-subtle hover:text-muted hover:bg-surface-2 transition-colors opacity-0 group-hover:opacity-100"
                              title="Edit row">
                              ✎
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Gantt view ── */}
      {view === "gantt" && (
        <>
          <div className="md:hidden bg-warning-bg border border-amber-200 rounded-xl p-4 text-xs text-warning">
            📱 The Gantt chart is designed for wider screens. For the best view, open this page on a laptop/desktop — or rotate your phone to landscape.
          </div>
          <GanttView visible={visible} stagesByProject={localStages} />
        </>
      )}

    </main>
  );
}

// ── Gantt chart ───────────────────────────────────────────────────────────────
const STAGE_ABBR: Record<string, string> = {
  "Contracting Phase": "CP",
  "Underground":       "UG",
  "Rough":             "R",
  "Finish":            "F",
  "Extras":            "X",
};

function GanttView({ visible, stagesByProject }: {
  visible:         any[];
  stagesByProject: Record<number, any[]>;
}) {
  const PX_PER_DAY = 3.5;
  const ROW_H      = 48;  // one row per project, taller for clarity
  const LABEL_W    = 240;
  const YEAR_H     = 28;
  const MONTH_H    = 26;
  const HEADER_H   = YEAR_H + MONTH_H;

  const scrollRef = useRef<HTMLDivElement>(null);

  // Collect all dated stages
  const allDatedStages = useMemo(() => {
    const out: Array<{ project: any; stage: any }> = [];
    for (const p of visible) {
      for (const s of stagesByProject[p.id] ?? []) {
        if (s.start_date && s.end_date) out.push({ project: p, stage: s });
      }
    }
    return out;
  }, [visible, stagesByProject]);

  if (allDatedStages.length === 0) {
    return (
      <div className="bg-surface rounded-xl border border-border shadow-sm py-20 text-center text-subtle text-sm">
        No stage dates to display. Add start/end dates to project stages first.
      </div>
    );
  }

  // Date range
  const allDates = allDatedStages.flatMap(({ stage: s }) => [parseDate(s.start_date)!, parseDate(s.end_date)!]);
  const rawMin   = new Date(Math.min(...allDates.map(d => d.getTime())));
  const rawMax   = new Date(Math.max(...allDates.map(d => d.getTime())));

  // Pad range a little and snap to month boundaries
  const minDate = new Date(rawMin.getFullYear(), rawMin.getMonth(), 1);
  const maxDate = new Date(rawMax.getFullYear(), rawMax.getMonth() + 1, 0); // last day of that month

  const totalDays = daysBetween(minDate, maxDate) + 1;
  const chartW    = Math.round(totalDays * PX_PER_DAY);

  // Build month cells
  const monthCells: Array<{ label: string; year: number; left: number; width: number }> = [];
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    const mEnd   = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    const mLeft  = Math.max(0, daysBetween(minDate, cur)) * PX_PER_DAY;
    const mDays  = Math.min(daysBetween(minDate, mEnd) + 1, totalDays) - Math.max(0, daysBetween(minDate, cur));
    const mWidth = Math.round(mDays * PX_PER_DAY);
    monthCells.push({ label: MONTH_NAMES[cur.getMonth()], year: cur.getFullYear(), left: mLeft, width: mWidth });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  // Build year cells (group months)
  const yearCells: Array<{ label: number; left: number; width: number }> = [];
  let yi = 0;
  while (yi < monthCells.length) {
    const yr  = monthCells[yi].year;
    let width = monthCells[yi].width;
    const left = monthCells[yi].left;
    let next = yi + 1;
    while (next < monthCells.length && monthCells[next].year === yr) {
      width += monthCells[next].width;
      next++;
    }
    yearCells.push({ label: yr, left, width });
    yi = next;
  }

  // Quarter shading (alternate bg every 3 months for rhythm)
  const quarterShades: Array<{ left: number; width: number }> = [];
  for (let i = 0; i < monthCells.length; i += 3) {
    const start = monthCells[i];
    const last  = monthCells[Math.min(i + 2, monthCells.length - 1)];
    const width = last.left + last.width - start.left;
    // Only shade every other quarter
    if ((Math.floor(start.year * 4 + MONTH_NAMES.indexOf(start.label) / 3)) % 2 === 0) {
      quarterShades.push({ left: start.left, width });
    }
  }

  // Today marker
  const today      = new Date();
  const todayLeft  = daysBetween(minDate, today) * PX_PER_DAY;
  const showToday  = today >= minDate && today <= maxDate;

  // Group projects by foreman
  const foremanOrder: string[] = [];
  const byForeman: Record<string, any[]> = {};
  for (const p of visible) {
    const hasDatedStages = (stagesByProject[p.id] ?? []).some((s: any) => s.start_date && s.end_date);
    if (!hasDatedStages) continue;
    if (!byForeman[p.foreman]) {
      foremanOrder.push(p.foreman);
      byForeman[p.foreman] = [];
    }
    byForeman[p.foreman].push(p);
  }

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 border-b border-border bg-surface-2">
        {Object.entries(STAGE_BAR_COLOR).map(([stage, c]) => (
          <div key={stage} className="flex items-center gap-1.5 text-xs">
            <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: c.solid }} />
            <span className="text-muted font-medium">{stage}</span>
          </div>
        ))}
        <div className="h-4 w-px bg-surface-3 mx-1" />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded border-2 border-border-strong bg-surface" />
            Pending
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded bg-subtle" style={{ backgroundImage: "linear-gradient(135deg, rgba(0,0,0,0.15) 25%, transparent 25%, transparent 50%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.15) 75%, transparent 75%)", backgroundSize: "6px 6px" }} />
            Complete
          </span>
        </div>
        <div className="h-4 w-px bg-surface-3 mx-1" />
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <div className="w-0.5 h-4 bg-red-500" />
          <span>Today</span>
        </div>
      </div>

      <div className="overflow-x-auto" ref={scrollRef}>
        <div style={{ minWidth: LABEL_W + chartW + 1, position: "relative" }}>

          {/* ── Year header ── */}
          <div className="flex sticky top-0 z-20" style={{ height: YEAR_H }}>
            <div className="shrink-0 flex items-center px-4 border-r border-b border-slate-700 bg-slate-800"
              style={{ width: LABEL_W, minWidth: LABEL_W }}>
              <span className="text-white text-[11px] font-bold uppercase tracking-wider">Project</span>
            </div>
            <div className="relative border-b border-slate-700 bg-slate-800" style={{ width: chartW }}>
              {yearCells.map((y, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center"
                  style={{ left: y.left, width: y.width, borderRight: i < yearCells.length - 1 ? "1px solid #475569" : "none" }}>
                  <span className="text-white text-xs font-bold tracking-wide">{y.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Month sub-header ── */}
          <div className="flex sticky z-10 border-b border-border-strong" style={{ top: YEAR_H, height: MONTH_H }}>
            <div className="shrink-0 border-r border-border-strong bg-slate-100"
              style={{ width: LABEL_W, minWidth: LABEL_W }} />
            <div className="relative bg-slate-50" style={{ width: chartW }}>
              {/* Quarter shading strip */}
              {quarterShades.map((q, i) => (
                <div key={i} className="absolute top-0 bottom-0" style={{ left: q.left, width: q.width, backgroundColor: "#f1f5f9" }} />
              ))}
              {monthCells.map((m, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center"
                  style={{
                    left: m.left, width: m.width,
                    borderRight: i < monthCells.length - 1 && monthCells[i + 1].year !== m.year
                      ? "1px solid #94a3b8"
                      : "1px solid #e2e8f0",
                  }}>
                  <span className="text-muted text-[10px] font-semibold tracking-wide">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Foreman groups + rows ── */}
          {foremanOrder.map(foreman => {
            const fProjects = byForeman[foreman];
            return (
              <div key={foreman}>
                {/* Foreman group header */}
                <div className="flex items-stretch border-b border-border sticky z-[5]" style={{ backgroundColor: "#e0f2fe" }}>
                  <div className="shrink-0 px-4 py-1.5 font-bold text-xs uppercase tracking-wider border-r border-blue-200 flex items-center gap-2"
                    style={{ width: LABEL_W, minWidth: LABEL_W, color: "#0369a1" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#0369a1" }} />
                    {foreman}
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface text-info ml-auto">
                      {fProjects.length}
                    </span>
                  </div>
                  <div style={{ width: chartW, position: "relative" }}>
                    {/* month grid lines continue through header */}
                    {monthCells.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0"
                        style={{
                          left: m.left,
                          borderRight: i < monthCells.length - 1 && monthCells[i + 1].year !== m.year
                            ? "1px solid #60a5fa"
                            : "1px dashed rgba(255,255,255,0.6)",
                        }} />
                    ))}
                    {showToday && (
                      <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: todayLeft }} />
                    )}
                  </div>
                </div>

                {/* One row per project — all stages inline */}
                {fProjects.map((p, pi) => {
                  const stages = (stagesByProject[p.id] ?? []).filter((s: any) => s.start_date && s.end_date);
                  const isCurrentStage = (stg: string) => p.stage === stg;
                  const rowBg = pi % 2 === 0 ? "#ffffff" : "#fafafa";

                  return (
                    <div key={p.id}
                      className="flex items-stretch border-b border-border hover:bg-info-bg/20 transition-colors group"
                      style={{ height: ROW_H, backgroundColor: rowBg }}>

                      {/* Label */}
                      <div className="shrink-0 px-3 py-1.5 border-r border-border overflow-hidden flex flex-col justify-center"
                        style={{ width: LABEL_W, minWidth: LABEL_W }}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-text truncate leading-tight">{p.name}</span>
                          {p.is_pipeline === 1 && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-surface-2 text-muted shrink-0 font-medium">Minor</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-subtle">
                          <span className="px-1 py-0.5 rounded font-medium text-white"
                            style={{ backgroundColor: STAGE_BAR_COLOR[p.stage]?.solid ?? "#94a3b8", fontSize: "9px" }}>
                            {p.stage}
                          </span>
                          {!p.is_pipeline && p.project_completion != null && (
                            <span className="font-mono">{fmtPct(p.project_completion)}</span>
                          )}
                        </div>
                      </div>

                      {/* Chart area */}
                      <div className="relative overflow-hidden" style={{ width: chartW }}>
                        {/* Quarter shading */}
                        {quarterShades.map((q, i) => (
                          <div key={i} className="absolute top-0 bottom-0" style={{ left: q.left, width: q.width, backgroundColor: "rgba(241,245,249,0.5)" }} />
                        ))}

                        {/* Month grid lines */}
                        {monthCells.map((m, mi) => (
                          <div key={mi} className="absolute top-0 bottom-0"
                            style={{
                              left: m.left,
                              borderRight: mi < monthCells.length - 1 && monthCells[mi + 1].year !== m.year
                                ? "1px solid #cbd5e1"
                                : "1px solid #f1f5f9",
                            }} />
                        ))}

                        {/* Today line */}
                        {showToday && (
                          <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                            style={{ left: todayLeft, boxShadow: "0 0 4px rgba(239,68,68,0.4)" }} />
                        )}

                        {/* Stage bars — all on the same row */}
                        {stages.map((s: any, si: number) => {
                          const c         = STAGE_BAR_COLOR[s.stage] ?? STAGE_BAR_COLOR["Rough"];
                          const start     = parseDate(s.start_date)!;
                          const end       = parseDate(s.end_date)!;
                          const barLeft   = Math.max(0, Math.round(daysBetween(minDate, start) * PX_PER_DAY));
                          const barWidth  = Math.max(8, Math.round(daysBetween(start, end) * PX_PER_DAY));
                          const isPending = s.status === "Pending";
                          const isComplete = s.status === "Complete";
                          const isCurrent  = isCurrentStage(s.stage);
                          const progress   = isCurrent ? (p.stage_completion ?? 0) : isComplete ? 1 : 0;
                          const barH       = ROW_H - 16;
                          const abbr       = STAGE_ABBR[s.stage] ?? s.stage.charAt(0);

                          return (
                            <div key={si}
                              className="absolute rounded-md flex items-center cursor-default overflow-hidden"
                              style={{
                                left:   barLeft,
                                top:    8,
                                width:  barWidth,
                                height: barH,
                                backgroundColor: isPending ? "#ffffff" : c.solid,
                                border:          isPending ? `2px dashed ${c.solid}` : `1px solid ${c.solid}`,
                                boxShadow:       isPending ? "none" : "0 1px 2px rgba(0,0,0,0.08)",
                                backgroundImage: isComplete
                                  ? "linear-gradient(135deg, rgba(255,255,255,0.25) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.25) 75%, transparent 75%)"
                                  : "none",
                                backgroundSize: isComplete ? "8px 8px" : "auto",
                              }}
                              title={`${p.name} · ${s.stage} · ${s.status}\n${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}${s.notes ? `\nNotes: ${s.notes}` : ""}`}>

                              {/* Progress fill (only for in-progress current stage) */}
                              {isCurrent && progress > 0 && progress < 1 && !isPending && (
                                <div className="absolute top-0 bottom-0 left-0 bg-surface/30"
                                  style={{ width: `${progress * 100}%` }} />
                              )}

                              {/* Bar label */}
                              <span
                                className="relative z-10 px-1.5 text-[10px] font-bold truncate leading-none whitespace-nowrap"
                                style={{ color: isPending ? c.text : "#ffffff" }}>
                                {barWidth > 90 ? s.stage : barWidth > 28 ? abbr : ""}
                                {barWidth > 140 && (
                                  <span className="font-normal opacity-90 ml-1.5">
                                    {fmtDateShort(s.start_date)} – {fmtDateShort(s.end_date)}
                                  </span>
                                )}
                              </span>

                              {/* Current-stage indicator dot */}
                              {isCurrent && !isPending && (
                                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-surface animate-pulse z-10" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Bottom spacer */}
          <div style={{ height: 12 }} />
        </div>
      </div>
    </div>
  );
}

// ── Project Card (Kanban) ─────────────────────────────────────────────────────
function ProjectCard({ project: p, stages, stageColor, stageBg, stageBorder }: {
  project:     any;
  stages:      any[];
  stageColor:  string;
  stageBg:     string;
  stageBorder: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const completion  = p.is_pipeline ? 0 : (p.project_completion ?? 0);
  const stageCompl  = p.is_pipeline ? 0 : (p.stage_completion   ?? 0);

  const currentStage = stages.find(s => s.stage === p.stage);

  const stageOrder: Record<string, number> = {
    "Contracting Phase": 1, "Underground": 2, "Rough": 3, "Finish": 4, "Extras": 5,
  };
  const nextStage = stages
    .filter(s => s.status !== "Complete" && stageOrder[s.stage] > (stageOrder[p.stage] ?? 0))
    .sort((a, b) => (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9))[0];

  return (
    <div className={`bg-surface rounded-xl border shadow-sm transition-shadow hover:shadow-md ${p.is_pipeline ? "opacity-80" : ""}`}
      style={{ borderColor: stageBorder }}>
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-text leading-tight">{p.name}</p>
          {p.is_pipeline === 1 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-2 text-muted whitespace-nowrap shrink-0">Minor</span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
            style={{ backgroundColor: stageColor }}>{p.foreman}</span>
          {p.region && <span className="text-xs text-subtle truncate">{p.region}</span>}
        </div>

        {!p.is_pipeline && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-muted">
              <span>Project {fmtPct(completion)}</span>
              <span>Stage {fmtPct(stageCompl)}</span>
            </div>
            <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all"
                style={{ width: `${completion * 100}%`, backgroundColor: progressColor(completion) }} />
            </div>
          </div>
        )}

        {currentStage && (currentStage.start_date || currentStage.end_date) && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-subtle">{currentStage.stage}</span>
            <span className="font-mono text-muted">
              {fmtDate(currentStage.start_date)} → {fmtDate(currentStage.end_date)}
            </span>
          </div>
        )}

        {p.contract_value > 0 && (
          <p className="text-xs font-mono text-muted mt-1.5">{fmt$(p.contract_value)}</p>
        )}
      </div>

      <button onClick={() => setExpanded(e => !e)}
        className="w-full text-xs text-subtle hover:text-muted py-1.5 border-t transition-colors"
        style={{ borderColor: stageBorder }}>
        {expanded ? "▲ Less" : "▼ More"}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 text-xs text-muted">
          {p.builder  && <div>🏗️ <span className="font-medium">{p.builder}</span></div>}
          {p.contacts && <div>👤 {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</div>}
          {p.project_notes && <div className="italic text-subtle">{p.project_notes}</div>}

          {stages.length > 0 && (
            <div className="mt-1.5 space-y-1 border-t pt-1.5" style={{ borderColor: stageBorder }}>
              {stages.map((s, i) => {
                const ss = statusStyle(s.status);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-subtle">{s.stage}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {s.status}
                    </span>
                    <span className="font-mono text-muted truncate">
                      {s.start_date ? fmtDate(s.start_date) : ""}{s.end_date ? ` → ${fmtDate(s.end_date)}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {nextStage && nextStage.start_date && (
            <div className="mt-1.5 px-2 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: stageBg, color: stageColor, border: `1px solid ${stageBorder}` }}>
              📅 Next: {nextStage.stage} starts {fmtDate(nextStage.start_date)}
            </div>
          )}

          {(p.basecamp_link || p.drive_folder) && (
            <div className="flex gap-2 mt-1.5 pt-1.5 border-t" style={{ borderColor: stageBorder }}>
              {p.basecamp_link && (
                <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center py-1 rounded text-white text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#1D2D35" }}>
                  Basecamp
                </a>
              )}
              {p.drive_folder && (
                <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-center py-1 rounded text-white text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "#1a73e8" }}>
                  Drive
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
