"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toCSV, downloadCSV }   from "@/lib/csv";
import { useConfirm }           from "./useConfirm";
import ProjectTile               from "./ProjectTile";
import ProjectEditModal          from "./ProjectEditModal";
import ActivateProjectModal      from "./ActivateProjectModal";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

function relativeTime(ts: string | null | undefined): { label: string; title: string; stale: boolean } {
  if (!ts) return { label: "Never", title: "No data uploaded yet", stale: true };
  // SQLite stores as "YYYY-MM-DD HH:MM:SS"
  const dt = new Date(ts.replace(" ", "T") + "Z"); // treat as UTC
  if (isNaN(dt.getTime())) return { label: "—", title: ts, stale: false };
  const diffMs  = Date.now() - dt.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH   = Math.floor(diffMs / 3600000);
  const diffD   = Math.floor(diffMs / 86400000);
  const diffW   = Math.floor(diffD / 7);
  const months  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const title   = dt.toLocaleString();
  let label: string;
  if (diffMin  <  1)  label = "Just now";
  else if (diffH  <  1)  label = `${diffMin}m ago`;
  else if (diffH  < 24)  label = `${diffH}h ago`;
  else if (diffD  <  2)  label = "Yesterday";
  else if (diffD  <  7)  label = `${diffD}d ago`;
  else if (diffW  <  5)  label = `${diffW}w ago`;
  else                   label = `${months[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
  const stale = diffD > 14; // flag if no update in 2+ weeks
  return { label, title, stale };
}

function ProgressBar({ value, max, color = "blue" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colors: Record<string, string> = {
    blue: "bg-info", green: "bg-success", red: "bg-danger",
    yellow: "bg-warning", gray: "bg-subtle",
  };
  return (
    <div className="w-full bg-surface-2 rounded-full h-1.5 overflow-hidden">
      <div className={`h-1.5 rounded-full transition-all ${colors[color] ?? "bg-info"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-4 py-3.5">
      <p className="text-xs text-subtle font-medium">{label}</p>
      <p className="text-xl lg:text-2xl font-medium text-text mt-1 tabular-nums tracking-tight">{value}</p>
      {sub && <p className="text-[11px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
// Keep in sync with Navbar's SUPER_ADMIN_EMAILS list.
const SUPER_ADMIN_EMAILS = ["rap@totallywiredelectric.com"];

interface Props {
  projects:         any[];
  pipeline:         any[];
  kpis:             Record<string, number>;
  flagged:          any[];
  uploads:          any[];
  role:             string;
  userEmail?:       string;
  stagesByProject:  Record<number, any[]>;
  lastSync?:        string | null;
}

export default function DashboardClient({ projects, pipeline, kpis, flagged, uploads, role, userEmail, stagesByProject, lastSync }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [view,          setView]          = useState<"active" | "pipeline">("active");
  const [viewMode,      setViewMode]      = useState<"table" | "tiles">("table");
  const [search,        setSearch]        = useState("");
  const [filterForeman, setFilterForeman] = useState("all");
  const [sortKey,       setSortKey]       = useState("name");
  const [editProject,   setEditProject]   = useState<any>(null);
  const [reportMsg,     setReportMsg]     = useState("");
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [activateProject, setActivateProject] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus,  setBulkStatus]  = useState<string>("");

  // Deep-link: ?view=pipeline switches to the Minor Projects tab (used by the
  // project detail page's back link and the global search results).
  useEffect(() => {
    if (searchParams.get("view") === "pipeline") setView("pipeline");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function selectAllVisible(items: any[]) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = items.every(i => next.has(i.id));
      if (allSelected) items.forEach(i => next.delete(i.id));
      else             items.forEach(i => next.add(i.id));
      return next;
    });
  }
  async function bulkUpdateStage(newStage: string) {
    if (!newStage || selectedIds.size === 0) return;
    setBulkStatus(`Updating ${selectedIds.size}…`);
    await Promise.all(Array.from(selectedIds).map(id =>
      fetch(`/api/projects/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      })
    ));
    setBulkStatus("✅ Updated");
    setTimeout(() => { setBulkStatus(""); router.refresh(); }, 800);
  }
  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!(await confirm(`Delete ${selectedIds.size} project(s)? This cannot be undone.`, { title: "Delete projects", confirmLabel: "Delete", danger: true }))) return;
    setBulkStatus(`Deleting ${selectedIds.size}…`);
    await Promise.all(Array.from(selectedIds).map(id =>
      fetch(`/api/projects/${id}`, { method: "DELETE" })
    ));
    setBulkStatus("✅ Deleted");
    setTimeout(() => { setBulkStatus(""); router.refresh(); }, 600);
  }
  function exportCurrentCSV(list: any[], filenameHint: string) {
    const rows = list.map((p: any) => ({
      name:            p.name,
      foreman:         p.foreman,
      stage:           p.stage,
      is_pipeline:     p.is_pipeline ? "Minor" : "Tracked",
      region:          p.region,
      builder:         p.builder,
      contacts:        p.contacts,
      phone:           p.phone,
      contract_value:  p.contract_value,
      total_invoiced:  p.total_invoiced,
      project_completion_pct: Math.round((p.project_completion ?? 0) * 100),
      stage_completion_pct:   Math.round((p.stage_completion   ?? 0) * 100),
      actual_materials:       p.actual_materials ?? "",
      est_materials_budget:   p.est_materials_budget ?? "",
      actual_total_hours:     p.actual_total_hours ?? "",
      goal_hours:             p.goal_hours ?? "",
      updated_at:             p.updated_at ?? "",
    }));
    const csv = toCSV(rows, [
      { key: "name",           label: "Project"     },
      { key: "foreman",        label: "Foreman"     },
      { key: "stage",          label: "Stage"       },
      { key: "is_pipeline",    label: "Type"        },
      { key: "region",         label: "Region"      },
      { key: "builder",        label: "Builder"     },
      { key: "contacts",       label: "Contact"     },
      { key: "phone",          label: "Phone"       },
      { key: "contract_value", label: "Contract $"  },
      { key: "total_invoiced", label: "Invoiced $"  },
      { key: "project_completion_pct", label: "Project %" },
      { key: "stage_completion_pct",   label: "Stage %"   },
      { key: "actual_materials",       label: "Actual Materials $" },
      { key: "est_materials_budget",   label: "Est Materials $"    },
      { key: "actual_total_hours",     label: "Actual Hours" },
      { key: "goal_hours",             label: "Goal Hours"   },
      { key: "updated_at",             label: "Updated"      },
    ]);
    const today = new Date().toISOString().slice(0, 10);
    downloadCSV(`projects-${filenameHint}-${today}.csv`, csv);
  }

  const currentList = view === "active" ? projects : pipeline;
  const allForemen  = ["all", ...Array.from(new Set(currentList.map((p: any) => p.foreman))).sort()];

  const filtered = currentList
    .filter((p: any) => {
      const q = search.toLowerCase();
      const matchSearch  = p.name.toLowerCase().includes(q) ||
                           p.foreman.toLowerCase().includes(q) ||
                           (p.builder ?? "").toLowerCase().includes(q) ||
                           (p.region  ?? "").toLowerCase().includes(q);
      const matchForeman = filterForeman === "all" || p.foreman === filterForeman;
      return matchSearch && matchForeman;
    })
    .sort((a: any, b: any) => {
      if (sortKey === "contract_value")     return b.contract_value - a.contract_value;
      if (sortKey === "project_completion") return b.project_completion - a.project_completion;
      if (sortKey === "foreman")            return a.foreman.localeCompare(b.foreman);
      return a.name.localeCompare(b.name);
    });

  // ── Send report ────────────────────────────────────────────────────────────
  async function handleReport() {
    setReportMsg("📧 Email reports coming soon.");
    await fetch("/api/reports", { method: "POST" });
  }

  // ── Add project ────────────────────────────────────────────────────────────
  async function handleAddProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = {
      name:           fd.get("name"),
      foreman:        fd.get("foreman"),
      stage:          fd.get("stage"),
      region:         fd.get("region")   || null,
      builder:        fd.get("builder")  || null,
      contacts:       fd.get("contacts") || null,
      phone:          fd.get("phone")    || null,
      contract_value: Number(fd.get("contract_value")) || 0,
      is_pipeline:    view === "pipeline" ? 1 : 0,
    };
    await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setShowAddForm(false);
    router.refresh();
  }

  // ── Delete project ─────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    if (!(await confirm("Delete this project? This cannot be undone.", { title: "Delete project", confirmLabel: "Delete", danger: true }))) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const isAdmin       = role === "owner" || role === "admin";
  const isForeman     = role === "foreman";
  const isSuperAdmin  = !!userEmail && SUPER_ADMIN_EMAILS.includes(userEmail);

  return (
    <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-6">
      {confirmDialog}

      {/* ── Tracked Project KPIs ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-xs font-semibold text-subtle uppercase tracking-wider">
            Tracked portfolio
          </h2>
          <span className="text-xs text-subtle" title={lastSync ? new Date(lastSync.replace(" ", "T") + "Z").toLocaleString() : undefined}>
            {lastSync
              ? `Data as of ${relativeTime(lastSync).label.toLowerCase()}`
              : "No sync yet"}
          </span>
        </div>
        <div className={`grid gap-3 ${isForeman ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"}`}>
          {!isForeman && <KpiCard label="Total Contract Value" value={fmt$(kpis.totalContractValue)} sub="lifetime · all tracked jobs" />}
          {!isForeman && <KpiCard label="Total Invoiced"       value={fmt$(kpis.totalInvoiced)} sub={`${fmtPct(kpis.totalContractValue > 0 ? kpis.totalInvoiced / kpis.totalContractValue : 0)} billed · ${fmt$(Math.max(0, kpis.totalContractValue - kpis.totalInvoiced))} to go`} />}
          <KpiCard label="Actual Materials" value={fmt$(kpis.totalActualMat)}      sub={fmtPct(kpis.totalEstMat > 0 ? kpis.totalActualMat / kpis.totalEstMat : 0) + " of budget"} />
          <KpiCard label="Actual Hours"     value={kpis.totalActualHours.toLocaleString()} sub={fmtPct(kpis.totalEstHours > 0 ? kpis.totalActualHours / kpis.totalEstHours : 0) + " of est."} />
          <KpiCard label="Tracked Projects" value={String(projects.length)} />
          <KpiCard label="Flagged"          value={String(flagged.length)} sub={flagged.length > 0 ? "need attention" : "all clear ✅"} />
        </div>
      </section>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {/* Active / Pipeline toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["active", "pipeline"] as const).map(v => (
              <button key={v} onClick={() => { setView(v); setFilterForeman("all"); setSearch(""); }}
                className={`px-3 py-1.5 capitalize transition-colors ${
                  view === v
                    ? "bg-accent text-accent-foreground font-medium"
                    : "bg-surface text-muted hover:bg-surface-2"
                }`}>
                {v === "active" ? `Tracked (${projects.length})` : `Minor Projects (${pipeline.length})`}
              </button>
            ))}
          </div>

          {/* Table / Tiles view toggle (desktop only — mobile is always tiles) */}
          <div className="hidden md:flex rounded-lg border border-border overflow-hidden text-sm">
            {([
              { key: "table", label: "☰ Table" },
              { key: "tiles", label: "▦ Tiles" },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setViewMode(o.key)}
                className={`px-3 py-1.5 transition-colors ${
                  viewMode === o.key
                    ? "bg-accent text-accent-foreground font-medium"
                    : "bg-surface text-muted hover:bg-surface-2"
                }`}>
                {o.label}
              </button>
            ))}
          </div>

          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search name, foreman, builder…"
            className="px-3 py-1.5 text-sm bg-surface text-text border border-border rounded-lg focus:outline-none focus:border-accent w-full sm:w-52 placeholder:text-subtle"
          />
          <select value={filterForeman} onChange={e => setFilterForeman(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface text-text border border-border rounded-lg focus:outline-none">
            {allForemen.map(f => <option key={f} value={f}>{f === "all" ? "All Foremen" : f}</option>)}
          </select>
          <select value={sortKey} onChange={e => setSortKey(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface text-text border border-border rounded-lg focus:outline-none">
            <option value="name">Sort: Name</option>
            <option value="foreman">Sort: Foreman</option>
            {!isForeman && <option value="contract_value">Sort: Contract Value</option>}
            <option value="project_completion">Sort: % Complete</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* One primary action; everything else is a quiet ghost button */}
          <button onClick={() => exportCurrentCSV(filtered, view)}
            title="Export current filtered rows as CSV"
            className="text-sm px-3 py-1.5 bg-surface border border-border hover:bg-surface-2 text-muted rounded-lg font-medium transition-colors">
            CSV
          </button>
          {isAdmin && <>
            <Link
              href="/uploads"
              className="text-sm px-3 py-1.5 bg-surface border border-border hover:bg-surface-2 text-muted rounded-lg font-medium transition-colors inline-block">
              Sync
            </Link>
            <button onClick={() => setShowAddForm(true)}
              className="text-sm px-4 py-1.5 bg-accent text-accent-foreground rounded-lg font-semibold transition-opacity hover:opacity-90">
              + Add project
            </button>
          </>}
          {isSuperAdmin && (
            <a
              href="/api/admin/backup"
              title="Download a snapshot of the entire database"
              className="text-sm px-3 py-1.5 bg-surface border border-border hover:bg-surface-2 text-muted rounded-lg font-medium transition-colors inline-block">
              Backup DB
            </a>
          )}
        </div>
      </div>


      {/* Bulk action bar (shows when rows selected — table view only) */}
      {isAdmin && viewMode === "table" && selectedIds.size > 0 && (
        <div className="sticky top-[52px] z-30 bg-slate-800 text-white rounded-xl shadow-lg px-4 py-2.5 flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold">{selectedIds.size} selected</span>
          <select
            onChange={e => { if (e.target.value) bulkUpdateStage(e.target.value); e.target.value = ""; }}
            className="text-xs bg-slate-700 text-white border border-slate-600 rounded px-2 py-1">
            <option value="">Set stage…</option>
            <option value="Contracting Phase">Contracting Phase</option>
            <option value="Underground">Underground</option>
            <option value="Rough">Rough</option>
            <option value="Finish">Finish</option>
            <option value="Extras">Extras</option>
          </select>
          <button
            onClick={() => exportCurrentCSV(filtered.filter(p => selectedIds.has(p.id)), "selected")}
            className="text-xs px-3 py-1 bg-surface text-slate-800 rounded font-medium hover:bg-surface-2">
            ⬇ Export selected
          </button>
          <button
            onClick={bulkDelete}
            className="text-xs px-3 py-1 bg-red-500 hover:bg-red-600 rounded font-medium">
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded font-medium">
            Clear
          </button>
          {bulkStatus && <span className="text-xs text-amber-200">{bulkStatus}</span>}
        </div>
      )}

      {reportMsg && <p className="text-sm text-text bg-surface border rounded-lg px-4 py-2 shadow-sm">{reportMsg}</p>}

      {/* ── Tile grid: always on mobile; on desktop only when viewMode === "tiles" ── */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${viewMode === "tiles" ? "md:grid-cols-2 lg:grid-cols-3" : "md:hidden"} gap-3`}>
        {filtered.length === 0 && (
          <div className="sm:col-span-2 lg:col-span-3 bg-surface rounded-xl border border-border p-8 text-center text-sm text-subtle">
            No {view === "pipeline" ? "minor projects" : "projects"} match your filters.
          </div>
        )}
        {filtered.map((p: any) => (
          <ProjectTile
            key={p.id}
            p={p}
            isAdmin={isAdmin}
            isForeman={isForeman}
            onEdit={pr => setEditProject(pr)}
            onActivate={pr => setActivateProject(pr)}
          />
        ))}
      </div>
      {viewMode === "tiles" && filtered.length > 0 && (
        <p className="hidden md:block text-xs text-subtle text-center">
          Showing {filtered.length} of {currentList.length} {view === "pipeline" ? "minor projects" : "tracked projects"}
        </p>
      )}

      {/* ── Pipeline Table (desktop) ── */}
      {view === "pipeline" && viewMode === "table" && (
        <div className="hidden md:block bg-surface rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white text-xs uppercase tracking-wide" style={{ backgroundColor: "#101010" }}>
                  <th className="px-4 py-3 text-left">Project</th>
                  <th className="px-4 py-3 text-left">Foreman</th>
                  <th className="px-4 py-3 text-left">Stage</th>
                  <th className="px-4 py-3 text-left">Region</th>
                  <th className="px-4 py-3 text-left">Builder / GC</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-left">Notes</th>
                  <th className="px-4 py-3 text-center">Links</th>
                  {isAdmin && <th className="px-4 py-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p: any) => (
                  <tr key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="hover:bg-surface-2 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-medium text-text">{p.name}</td>
                    <td className="px-4 py-3 text-muted text-xs">{p.foreman}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.stage === "Finish"            ? "bg-purple-100 text-purple-700" :
                        p.stage === "Extras"            ? "bg-warning-bg   text-warning"  :
                        p.stage === "Contracting Phase" ? "bg-surface-2    text-muted"   :
                        p.stage === "Underground"       ? "bg-warning-bg  text-warning" :
                                                          "bg-info-bg    text-info"
                      }`}>{p.stage}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{p.region ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text">{p.builder ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {p.contacts ?? "—"}
                      {p.phone && <div className="text-subtle">{p.phone}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-subtle italic max-w-xs truncate">{p.project_notes || "—"}</td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5 justify-center">
                        {p.basecamp_link && (
                          <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                            title="Open in Basecamp"
                            className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-75">
                            <img src="/icons/basecamp.svg" alt="Basecamp" className="w-5 h-5" />
                          </a>
                        )}
                        {p.drive_folder && (
                          <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                            target="_blank" rel="noopener noreferrer"
                            title="Open in Google Drive"
                            className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-75">
                            <img src="/icons/google-drive.svg" alt="Google Drive" className="w-5 h-5" />
                          </a>
                        )}
                        {!p.basecamp_link && !p.drive_folder && <span className="text-subtle text-xs">—</span>}
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setActivateProject(p)}
                            className="text-xs px-3 py-1 rounded font-medium text-white transition-opacity hover:opacity-80"
                            style={{ backgroundColor: "#00BAD6" }}
                            title="Activate this project">
                            ✓ Activate
                          </button>
                          <button onClick={() => setEditProject(p)}
                            className="text-xs px-2 py-1 bg-surface-2 hover:bg-surface-3 rounded transition-colors">Edit</button>
                          <button onClick={() => handleDelete(p.id)}
                            className="text-xs px-2 py-1 bg-danger-bg hover:bg-danger-bg text-danger rounded transition-colors">Del</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t text-xs text-subtle bg-surface-2">
            Showing {filtered.length} of {pipeline.length} minor projects
          </div>
        </div>
      )}

      {/* ── Active Projects Table (desktop) ── */}
      {view === "active" && viewMode === "table" && <div className="hidden md:block bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-2/80 border-b border-border text-[11px] uppercase tracking-wider text-muted font-semibold">
                {isAdmin && (
                  <th className="px-3 py-3 text-center w-8">
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every((p: any) => selectedIds.has(p.id))}
                      onChange={() => selectAllVisible(filtered)}
                      className="cursor-pointer w-3.5 h-3.5 accent-cyan-500"
                      title="Select all visible" />
                  </th>
                )}
                <th className="px-4 py-3 text-left">Project</th>
                <th className="px-4 py-3 text-left">Health</th>
                <th className="px-4 py-3 text-left">Progress</th>
                <th className="px-4 py-3 text-left">Hours</th>
                <th className="px-4 py-3 text-left">Materials</th>
                {!isForeman && <th className="px-4 py-3 text-right">Billing</th>}
                <th className="px-4 py-3 text-center w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => {
                const matPct    = p.est_materials_budget > 0 ? p.effectiveMaterials / p.est_materials_budget : 0;
                const overMat   = matPct > 1;
                const inc       = p.incentive;
                const overHrs   = inc.projectStatus.key === "critical" || inc.projectStatus.key === "at-risk";
                const statusColors: Record<string, string> = {
                  green:  "text-success bg-success-bg  border border-border",
                  blue:   "text-info  bg-info-bg   border border-border",
                  yellow: "text-warning bg-warning-bg border border-border",
                  orange: "text-warning bg-warning-bg border border-border",
                  red:    "text-danger   bg-danger-bg    border border-border",
                  gray:   "text-muted  bg-surface-2   border border-border",
                };

                return (
                  <tr
                    key={p.id}
                    id={`project-row-${p.id}`}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    title="Click to open project"
                    className={`cursor-pointer hover:bg-surface-2 transition-colors border-b border-border ${
                    selectedIds.has(p.id)                  ? "bg-accent-soft" :
                    inc.projectStatus.key === "critical"   ? "bg-danger-bg" :
                    inc.projectStatus.key === "at-risk"    ? "bg-warning-bg" :
                    overMat                                ? "bg-warning-bg" : ""
                  }`}>
                    {isAdmin && (
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          className="cursor-pointer w-3.5 h-3.5 accent-cyan-500" />
                      </td>
                    )}
                    {/* Project — name + everything secondary as a subtitle */}
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-text leading-tight">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                        <span>{p.foreman}</span>
                        <span className="text-subtle">·</span>
                        <span className={`px-1.5 py-px rounded font-medium text-[11px] ${p.stage === "Finish" ? "bg-purple-50 text-purple-600" : p.stage === "Extras" ? "bg-success-bg text-success" : "bg-info-bg text-info"}`}>
                          {p.stage}
                        </span>
                        {p.basecamp_link && (
                          <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer" title="Open in Basecamp"
                            onClick={e => e.stopPropagation()} className="hover:opacity-70 transition-opacity">
                            <img src="/icons/basecamp.svg" alt="Basecamp" className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {p.drive_folder && (
                          <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                            target="_blank" rel="noopener noreferrer" title="Open in Google Drive"
                            onClick={e => e.stopPropagation()} className="hover:opacity-70 transition-opacity">
                            <img src="/icons/google-drive.svg" alt="Drive" className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {(() => {
                          const rt = relativeTime(p.updated_at);
                          return (
                            <span title={rt.title}
                              className={`text-[10px] ${rt.stale ? "text-warning" : "text-subtle"}`}>
                              {rt.stale ? "⚠ " : ""}{rt.label}
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    {/* Health */}
                    <td className="px-4 py-3.5">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap inline-flex items-center gap-1 ${statusColors[inc.projectStatus.color] ?? statusColors.gray}`}>
                        {inc.projectStatus.emoji} {inc.projectStatus.label}
                      </span>
                    </td>
                    {/* Progress — one bar: overall project, stage % as context */}
                    <td className="px-4 py-3.5 min-w-[130px]">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-sm font-bold text-text">{fmtPct(p.project_completion)}</span>
                        <span className="text-[10px] text-subtle">stage {fmtPct(p.stage_completion)}</span>
                      </div>
                      <ProgressBar value={p.project_completion} max={1} color="blue" />
                    </td>
                    {/* Hours — spent vs goal */}
                    <td className="px-4 py-3.5 min-w-[130px]">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-sm font-bold ${overHrs ? "text-danger" : "text-text"}`}>
                          {p.effectiveHours.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-subtle">of {p.goal_hours.toLocaleString()} hrs</span>
                      </div>
                      <ProgressBar value={p.effectiveHours} max={p.goal_hours} color={overHrs ? "red" : "green"} />
                    </td>
                    {/* Materials — burn vs budget */}
                    <td className="px-4 py-3.5 min-w-[130px]">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className={`text-sm font-bold ${overMat ? "text-danger" : "text-text"}`}>{fmtPct(matPct)}</span>
                        <span className="text-[10px] text-subtle">{fmt$(p.effectiveMaterials)}</span>
                      </div>
                      <ProgressBar value={p.effectiveMaterials} max={p.est_materials_budget} color={overMat ? "red" : matPct > 0.8 ? "yellow" : "green"} />
                    </td>
                    {/* Billing — contract + invoiced in one glance */}
                    {!isForeman && (
                      <td className="px-4 py-3.5 text-right">
                        <div className="font-mono text-sm font-semibold text-text">{fmt$(p.contract_value)}</div>
                        <div className="text-[11px] text-subtle mt-0.5">
                          {fmt$(p.total_invoiced)} · {fmtPct(p.contract_value > 0 ? p.total_invoiced / p.contract_value : 0)} billed
                        </div>
                      </td>
                    )}
                    <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 pr-1">
                        {isAdmin && (
                          <button
                            onClick={() => setEditProject(p)}
                            title="Edit project"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-accent-soft hover:text-accent transition-colors">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => router.push(`/projects/${p.id}`)}
                          title="Open project"
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-text transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 18l6-6-6-6"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-subtle bg-surface-2">
          Showing {filtered.length} of {projects.length} tracked projects
        </div>
      </div>}  {/* end view === "active" table */}

      {/* ── Recent data syncs ── */}
      {!isForeman && uploads.length > 0 && (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <h3 className="text-sm font-semibold text-text mb-3">Recent data syncs</h3>
          <div className="space-y-1">
            {uploads.map((u: any) => (
              <div key={u.id} className="flex justify-between text-xs text-muted">
                <span>📄 {u.filename}</span>
                <span>{u.rows_updated} rows updated · {new Date(u.uploaded_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {editProject && (
        <ProjectEditModal
          project={editProject}
          stagesForProject={stagesByProject[editProject.id] ?? []}
          onClose={() => setEditProject(null)}
          onSaved={() => { setEditProject(null); router.refresh(); }}
        />
      )}

      {activateProject && (
        <ActivateProjectModal
          project={activateProject}
          onClose={() => setActivateProject(null)}
          onActivated={() => { setActivateProject(null); router.refresh(); }}
        />
      )}

      {/* ── Add project modal ── */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-text">Add New Project</h2>
              <button onClick={() => setShowAddForm(false)} className="text-subtle hover:text-muted text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAddProject} className="p-6 space-y-4">
              {[
                { name: "name",           label: "Project Name",   type: "text",   required: true  },
                { name: "foreman",        label: "Foreman",        type: "text",   required: true  },
                { name: "stage",          label: "Stage",          type: "text",   required: true  },
                { name: "region",         label: "Region",         type: "text",   required: false },
                { name: "builder",        label: "Builder / GC",   type: "text",   required: false },
                { name: "contacts",       label: "Contact Name",   type: "text",   required: false },
                { name: "phone",          label: "Phone",          type: "text",   required: false },
                { name: "contract_value", label: "Contract Value", type: "number", required: false },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-medium text-muted mb-1">{f.label}</label>
                  <input name={f.name} type={f.type} step="any" required={f.required}
                    placeholder={f.name === "stage" ? "Rough or Finish" : ""}
                    className="w-full px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">
                  Add Project
                </button>
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}
