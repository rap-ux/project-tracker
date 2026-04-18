"use client";

import { useState, useMemo, useRef } from "react";

// ── Stage config ──────────────────────────────────────────────────────────────
const STAGES = [
  { key: "Contracting Phase", label: "Contracting",  color: "#6b7280", bg: "#f9fafb",  border: "#d1d5db" },
  { key: "Underground",       label: "Underground",  color: "#ea580c", bg: "#fff7ed",  border: "#fed7aa" },
  { key: "Rough",             label: "Rough",        color: "#2563eb", bg: "#eff6ff",  border: "#bfdbfe" },
  { key: "Finish",            label: "Finish",       color: "#7c3aed", bg: "#f5f3ff",  border: "#ddd6fe" },
  { key: "Extras",            label: "Extras",       color: "#b45309", bg: "#fffbeb",  border: "#fde68a" },
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
  "Complete":    { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  "In Progress": { bg: "#f0fdfe", color: "#00BAD6", border: "#a5f3fc" },
  "Pending":     { bg: "#f9fafb", color: "#9ca3af", border: "#e5e7eb" },
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

  // Local copy of stages so saves update instantly without a full page reload
  const [localStages, setLocalStages] = useState<Record<number, any[]>>(stagesByProject);
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
        const existed = prev[pid]?.some((s: any) => s.stage === editDraft.stage);
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

  const foremen = ["all", ...Array.from(new Set(projects.map((p: any) => p.foreman))).sort()];

  const visible = projects.filter((p: any) => {
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

  const totalActive   = projects.filter(p => !p.is_pipeline).length;
  const totalPipeline = projects.filter(p =>  p.is_pipeline).length;

  return (
    <main className="flex-1 w-full px-4 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Project Timeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalActive} active · {totalPipeline} minor
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(["kanban", "schedule", "gantt"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="px-3 py-1.5 font-medium transition-colors"
                style={view === v
                  ? { backgroundColor: "#101010", color: "#fff" }
                  : { backgroundColor: "#fff", color: "#6b7280" }}>
                {v === "kanban" ? "🗂 Kanban" : v === "schedule" ? "📅 Schedule" : "📊 Gantt"}
              </button>
            ))}
          </div>

          {/* Foreman filter */}
          <select value={filterForeman} onChange={e => setFilterForeman(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none">
            {foremen.map(f => <option key={f} value={f}>{f === "all" ? "All Foremen" : f}</option>)}
          </select>

          {/* Minor Projects toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <div className="relative w-9 h-5 rounded-full transition-colors"
              style={showPipeline ? { backgroundColor: "#00BAD6" } : { backgroundColor: "#d1d5db" }}
              onClick={() => setShowPipeline(p => !p)}>
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${showPipeline ? "translate-x-4" : ""}`} />
            </div>
            Minor Projects
          </label>
        </div>
      </div>

      {/* ── Kanban view ── */}
      {view === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGES.map(stage => {
            const cards = grouped[stage.key] ?? [];
            return (
              <div key={stage.key} className="flex-shrink-0 w-72 flex flex-col gap-2">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ backgroundColor: stage.bg, border: `1px solid ${stage.border}` }}>
                  <span className="text-sm font-semibold" style={{ color: stage.color }}>{stage.label}</span>
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: stage.border, color: stage.color }}>
                    {cards.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.length === 0 && (
                    <div className="text-center text-xs text-gray-300 py-6 border border-dashed border-gray-200 rounded-xl">
                      No projects
                    </div>
                  )}
                  {cards.map((p: any) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      stages={localStages[p.id] ?? []}
                      stageColor={stage.color}
                      stageBg={stage.bg}
                      stageBorder={stage.border}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Schedule view ── */}
      {view === "schedule" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left sticky left-0 bg-slate-800">Project</th>
                  <th className="px-4 py-3 text-left">Foreman</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Start</th>
                  <th className="px-4 py-3 text-center">End</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-center w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {scheduleRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-10 text-gray-400 text-sm">No stage data available</td>
                  </tr>
                )}
                {scheduleRows.map((row, i) => {
                  const rowKey  = `${row.project_id}_${row.stage}`;
                  const isEdit  = editingRow === rowKey;
                  const cfg     = stageConfig(row.stage);
                  const ss      = statusStyle(isEdit ? editDraft?.status : row.status);
                  const inputCls = "w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white";

                  return (
                    <tr key={i} className={`group transition-colors ${isEdit ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                      {/* Project — read-only */}
                      <td className="px-4 py-2.5 font-medium text-gray-900 sticky left-0 bg-inherit whitespace-nowrap">
                        {row.project.name}
                        {row.project.is_pipeline
                          ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-normal">Minor</span>
                          : null}
                      </td>

                      {/* Foreman — read-only */}
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.project.foreman}</td>

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
                          <span className="text-gray-600 font-mono text-xs">{fmtDate(row.start_date)}</span>
                        )}
                      </td>

                      {/* End date */}
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        {isEdit ? (
                          <input type="date" value={editDraft.end_date ?? ""}
                            onChange={e => setEditDraft((d: any) => ({ ...d, end_date: e.target.value || null }))}
                            className={inputCls} />
                        ) : (
                          <span className="text-gray-600 font-mono text-xs">{fmtDate(row.end_date)}</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-2.5 text-gray-400 text-xs max-w-xs">
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
                              className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                              ✕
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {saveMsg?.key === rowKey && (
                              <span className={`text-xs font-medium ${saveMsg.ok ? "text-green-600" : "text-red-500"}`}>
                                {saveMsg.text}
                              </span>
                            )}
                            <button
                              onClick={() => startEdit(row)}
                              className="w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100"
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
        <GanttView visible={visible} stagesByProject={localStages} />
      )}

    </main>
  );
}

// ── Gantt chart ───────────────────────────────────────────────────────────────
function GanttView({ visible, stagesByProject }: {
  visible:         any[];
  stagesByProject: Record<number, any[]>;
}) {
  const PX_PER_DAY = 3.2;
  const ROW_H      = 34;
  const LABEL_W    = 210;
  const HEADER_H   = 52; // quarter row height

  const scrollRef = useRef<HTMLDivElement>(null);

  // Collect all dated stage bars
  const allBars = useMemo(() => {
    const out: Array<{ project: any; stage: any }> = [];
    for (const p of visible) {
      for (const s of stagesByProject[p.id] ?? []) {
        if (s.start_date && s.end_date) out.push({ project: p, stage: s });
      }
    }
    return out;
  }, [visible, stagesByProject]);

  if (allBars.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-20 text-center text-gray-400 text-sm">
        No stage dates to display. Add start/end dates to project stages first.
      </div>
    );
  }

  // Date range
  const allDates = allBars.flatMap(({ stage: s }) => [parseDate(s.start_date)!, parseDate(s.end_date)!]);
  const rawMin   = new Date(Math.min(...allDates.map(d => d.getTime())));
  const rawMax   = new Date(Math.max(...allDates.map(d => d.getTime())));

  // Snap to quarter boundaries
  const minDate = new Date(rawMin.getFullYear(), Math.floor(rawMin.getMonth() / 3) * 3, 1);
  const maxDate = new Date(rawMax.getFullYear(), Math.ceil((rawMax.getMonth() + 1) / 3) * 3, 1);
  maxDate.setDate(maxDate.getDate() - 1); // last day of final quarter

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

  // Build quarter cells (group months)
  const quarterCells: Array<{ label: string; left: number; width: number }> = [];
  let qi = 0;
  while (qi < monthCells.length) {
    const mc      = monthCells[qi];
    const qNum    = Math.floor(new Date(mc.year, MONTH_NAMES.indexOf(mc.label), 1).getMonth() / 3) + 1;
    const qLabel  = `${mc.year} Q${qNum}`;
    let width = mc.width;
    let nextQI = qi + 1;
    while (nextQI < monthCells.length) {
      const nm = monthCells[nextQI];
      const nq = Math.floor(new Date(nm.year, MONTH_NAMES.indexOf(nm.label), 1).getMonth() / 3) + 1;
      if (nq !== qNum || nm.year !== mc.year) break;
      width += nm.width;
      nextQI++;
    }
    quarterCells.push({ label: qLabel, left: mc.left, width });
    qi = nextQI;
  }

  // Today marker
  const today      = new Date();
  const todayLeft  = daysBetween(minDate, today) * PX_PER_DAY;
  const showToday  = today >= minDate && today <= maxDate;

  // Group by foreman → projects
  const foremanOrder: string[] = [];
  const byForeman: Record<string, any[]> = {};
  for (const p of visible) {
    if (!byForeman[p.foreman]) {
      foremanOrder.push(p.foreman);
      byForeman[p.foreman] = [];
    }
    byForeman[p.foreman].push(p);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50">
        {Object.entries(STAGE_BAR_COLOR).map(([stage, c]) => (
          <div key={stage} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.solid }} />
            <span className="text-gray-600">{stage}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs ml-4">
          <div className="w-0.5 h-3 bg-red-400" />
          <span className="text-gray-500">Today</span>
        </div>
        <div className="flex items-center gap-3 text-xs ml-2 text-gray-400">
          <span>■ Solid = In Progress/Complete</span>
          <span>□ Outline = Pending</span>
        </div>
      </div>

      <div className="overflow-x-auto" ref={scrollRef}>
        <div style={{ minWidth: LABEL_W + chartW + 1, position: "relative" }}>

          {/* ── Quarter header ── */}
          <div className="flex sticky top-0 z-20" style={{ height: HEADER_H }}>
            <div className="shrink-0 flex items-center px-4 border-r border-b border-slate-700 bg-slate-800 z-20"
              style={{ width: LABEL_W, minWidth: LABEL_W }}>
              <span className="text-white text-xs font-semibold uppercase tracking-wide">Foreman / Project</span>
            </div>
            <div className="relative border-b border-slate-700 bg-slate-800" style={{ width: chartW }}>
              {quarterCells.map((q, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center justify-center border-r border-slate-600"
                  style={{ left: q.left, width: q.width }}>
                  <span className="text-white text-xs font-semibold truncate px-1">{q.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Month sub-header ── */}
          <div className="flex sticky z-10 border-b border-gray-200" style={{ top: HEADER_H }}>
            <div className="shrink-0 border-r border-gray-200 bg-slate-100"
              style={{ width: LABEL_W, minWidth: LABEL_W, height: 24 }} />
            <div className="relative bg-slate-100" style={{ width: chartW, height: 24 }}>
              {monthCells.map((m, i) => (
                <div key={i} className="absolute top-0 bottom-0 flex items-center border-r border-gray-200"
                  style={{ left: m.left, width: m.width }}>
                  <span className="text-gray-500 text-[10px] font-medium px-1 truncate">{m.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Foreman groups + rows ── */}
          {foremanOrder.map(foreman => {
            const fProjects = byForeman[foreman];

            // Build all bar rows for this foreman's projects
            const barRows: Array<{ project: any; stage: any; barLeft: number; barWidth: number }> = [];
            for (const p of fProjects) {
              const stages = (stagesByProject[p.id] ?? []).filter((s: any) => s.start_date && s.end_date);
              for (const s of stages) {
                const start    = parseDate(s.start_date)!;
                const end      = parseDate(s.end_date)!;
                const barLeft  = Math.max(0, Math.round(daysBetween(minDate, start) * PX_PER_DAY));
                const barWidth = Math.max(6, Math.round(daysBetween(start, end) * PX_PER_DAY));
                barRows.push({ project: p, stage: s, barLeft, barWidth });
              }
            }

            if (barRows.length === 0) return null;

            return (
              <div key={foreman}>
                {/* Foreman group header */}
                <div className="flex items-center border-b border-gray-200" style={{ backgroundColor: "#f1f5f9" }}>
                  <div className="shrink-0 px-4 py-1.5 font-bold text-xs text-slate-700 uppercase tracking-wide border-r border-gray-200"
                    style={{ width: LABEL_W, minWidth: LABEL_W }}>
                    {foreman}
                  </div>
                  <div style={{ width: chartW, height: 28, position: "relative" }}>
                    {/* subtle grid lines */}
                    {monthCells.map((m, i) => (
                      <div key={i} className="absolute top-0 bottom-0 border-r border-gray-200"
                        style={{ left: m.left }} />
                    ))}
                    {showToday && (
                      <div className="absolute top-0 bottom-0 w-px bg-red-400/40 z-10"
                        style={{ left: todayLeft }} />
                    )}
                  </div>
                </div>

                {/* Stage bar rows */}
                {barRows.map((row, ri) => {
                  const { project: p, stage: s } = row;
                  const c           = STAGE_BAR_COLOR[s.stage] ?? STAGE_BAR_COLOR["Rough"];
                  const isComplete  = s.status === "Complete";
                  const isProgress  = s.status === "In Progress";
                  const isPending   = s.status === "Pending";

                  // Bar style
                  const barBg     = isPending   ? c.light  : c.solid;
                  const barColor  = isPending   ? c.text   : "#ffffff";
                  const barBorder = isPending   ? `1.5px solid ${c.solid}` : "none";
                  const barOpacity = isComplete ? 0.7 : 1;

                  return (
                    <div key={ri}
                      className="flex items-center border-b border-gray-100 hover:bg-blue-50/30 group transition-colors"
                      style={{ height: ROW_H }}>

                      {/* Label */}
                      <div className="shrink-0 px-3 border-r border-gray-100 overflow-hidden"
                        style={{ width: LABEL_W, minWidth: LABEL_W }}>
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-gray-700 truncate leading-tight">{p.name}</span>
                          {p.is_pipeline && (
                            <span className="text-[9px] px-1 py-0.5 rounded bg-gray-100 text-gray-400 shrink-0">Minor</span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400">{s.stage}</span>
                      </div>

                      {/* Bar area */}
                      <div className="relative overflow-hidden" style={{ width: chartW, height: ROW_H }}>
                        {/* Month grid lines */}
                        {monthCells.map((m, mi) => (
                          <div key={mi} className="absolute top-0 bottom-0 border-r border-gray-100"
                            style={{ left: m.left }} />
                        ))}

                        {/* Today line */}
                        {showToday && (
                          <div className="absolute top-0 bottom-0 w-0.5 z-10"
                            style={{ left: todayLeft, backgroundColor: "#ef4444" }} />
                        )}

                        {/* Stage bar */}
                        <div
                          className="absolute top-1.5 rounded flex items-center overflow-hidden cursor-default"
                          style={{
                            left:        row.barLeft,
                            width:       row.barWidth,
                            height:      ROW_H - 12,
                            backgroundColor: barBg,
                            color:       barColor,
                            border:      barBorder,
                            opacity:     barOpacity,
                          }}
                          title={`${p.name} · ${s.stage} · ${s.status}\n${fmtDate(s.start_date)} → ${fmtDate(s.end_date)}`}>
                          {/* Bar label (only if bar is wide enough) */}
                          {row.barWidth > 80 && (
                            <span className="px-2 text-[10px] font-semibold truncate leading-tight whitespace-nowrap">
                              {p.name} · {fmtDateShort(s.start_date)} – {fmtDateShort(s.end_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Bottom spacer */}
          <div style={{ height: 16 }} />
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
    <div className={`bg-white rounded-xl border shadow-sm transition-shadow hover:shadow-md ${p.is_pipeline ? "opacity-80" : ""}`}
      style={{ borderColor: stageBorder }}>
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{p.name}</p>
          {p.is_pipeline && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 whitespace-nowrap shrink-0">Minor</span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
            style={{ backgroundColor: stageColor }}>{p.foreman}</span>
          {p.region && <span className="text-xs text-gray-400 truncate">{p.region}</span>}
        </div>

        {!p.is_pipeline && (
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Project {fmtPct(completion)}</span>
              <span>Stage {fmtPct(stageCompl)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all"
                style={{ width: `${completion * 100}%`, backgroundColor: progressColor(completion) }} />
            </div>
          </div>
        )}

        {currentStage && (currentStage.start_date || currentStage.end_date) && (
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-gray-400">{currentStage.stage}</span>
            <span className="font-mono text-gray-600">
              {fmtDate(currentStage.start_date)} → {fmtDate(currentStage.end_date)}
            </span>
          </div>
        )}

        {p.contract_value > 0 && (
          <p className="text-xs font-mono text-gray-500 mt-1.5">{fmt$(p.contract_value)}</p>
        )}
      </div>

      <button onClick={() => setExpanded(e => !e)}
        className="w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 border-t transition-colors"
        style={{ borderColor: stageBorder }}>
        {expanded ? "▲ Less" : "▼ More"}
      </button>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 text-xs text-gray-600">
          {p.builder  && <div>🏗️ <span className="font-medium">{p.builder}</span></div>}
          {p.contacts && <div>👤 {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</div>}
          {p.project_notes && <div className="italic text-gray-400">{p.project_notes}</div>}

          {stages.length > 0 && (
            <div className="mt-1.5 space-y-1 border-t pt-1.5" style={{ borderColor: stageBorder }}>
              {stages.map((s, i) => {
                const ss = statusStyle(s.status);
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-gray-400">{s.stage}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      {s.status}
                    </span>
                    <span className="font-mono text-gray-500 truncate">
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
