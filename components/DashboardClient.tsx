"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ChangeOrdersPanel     from "./ChangeOrdersPanel";
import CommentsPanel           from "./CommentsPanel";
import { toCSV, downloadCSV }  from "@/lib/csv";
import { useConfirm }           from "./useConfirm";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m[2]) - 1]} ${parseInt(m[3])}, ${m[1]}`;
}

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
  const [search,        setSearch]        = useState("");
  const [filterForeman, setFilterForeman] = useState("all");
  const [sortKey,       setSortKey]       = useState("name");
  const [editProject,   setEditProject]   = useState<any>(null);
  const [reportMsg,     setReportMsg]     = useState("");
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [expandedRows,   setExpandedRows]   = useState<Set<number>>(new Set());
  const [activateProject, setActivateProject] = useState<any>(null);
  const [activating,      setActivating]      = useState(false);
  const [activitiesByProject, setActivitiesByProject] = useState<Record<number, any[]>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus,  setBulkStatus]  = useState<string>("");
  // Live preview of calculated project_completion in the edit modal
  const [draftStage,      setDraftStage]      = useState<string>("");
  const [draftStagePct,   setDraftStagePct]   = useState<number>(0);

  // Deep-link from global search: ?focus=<id> expands and scrolls to that project.
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (searchParams.get("view") === "pipeline") setView("pipeline");
    if (!focus) return;
    const id = Number(focus);
    // Clear any active filter/search so the focused project isn't hidden.
    setSearch("");
    setFilterForeman("all");
    setExpandedRows(prev => new Set(prev).add(id));
    const timer = setTimeout(() => {
      document.getElementById(`project-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function calcProjectCompletion(stage: string, stagePct: number): number {
    const sc = Math.min(1, Math.max(0, stagePct / 100));
    if (stage === "Rough" || stage === "Underground") return sc * 0.70;
    if (stage === "Finish")  return 0.70 + sc * 0.30;
    if (stage === "Extras")  return 1.0;
    return 0;
  }

  function toggleRow(id: number) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // Lazy-load activity log on first expand
    if (!activitiesByProject[id]) {
      fetch(`/api/projects/${id}/activity`)
        .then(r => r.json())
        .then(data => setActivitiesByProject(prev => ({ ...prev, [id]: data.activities ?? [] })))
        .catch(() => {});
    }
  }

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
  // For @mentions in comments — include foreman names + owners (first names matching user accounts)
  const availableUsers = Array.from(new Set([
    ...projects.map((p: any) => p.foreman).filter(Boolean),
    ...pipeline.map((p: any) => p.foreman).filter(Boolean),
    "Rafael", "Cole", "Nicole",
  ])).sort();

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

  // ── Activate pipeline project (via modal) ─────────────────────────────────
  async function handleConfirmActivate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!activateProject) return;
    setActivating(true);
    const fd = new FormData(e.currentTarget);
    await fetch(`/api/projects/${activateProject.id}`, {
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
    setActivateProject(null);
    router.refresh();
  }

  // ── Save edits ─────────────────────────────────────────────────────────────
  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, any> = {};
    const stageDates: { stage: string; start_date: string | null; end_date: string | null }[] = [];

    fd.forEach((v, k) => {
      // Stage date fields are named "sd_start_Rough", "sd_end_Rough", etc.
      if (k.startsWith("sd_start_") || k.startsWith("sd_end_")) return;
      body[k] = isNaN(Number(v)) || v === "" ? v : Number(v);
    });

    // Collect stage date pairs
    const stageNames = ["Underground", "Rough", "Finish"];
    for (const s of stageNames) {
      const start = (fd.get(`sd_start_${s}`) as string) || null;
      const end   = (fd.get(`sd_end_${s}`)   as string) || null;
      if (start !== null || end !== null) {
        stageDates.push({ stage: s, start_date: start || null, end_date: end || null });
      }
    }

    // Convert stage_completion % (0-100 in form) back to 0-1 decimal
    // project_completion is calculated server-side — do not send it
    if (body.stage_completion != null) body.stage_completion = Math.min(1, Math.max(0, body.stage_completion / 100));
    delete body.project_completion;

    const saves: Promise<any>[] = [
      fetch(`/api/projects/${editProject.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ];

    if (stageDates.length > 0) {
      saves.push(
        fetch(`/api/projects/${editProject.id}/stages`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stageDates),
        })
      );
    }

    await Promise.all(saves);
    setEditProject(null);
    router.refresh();
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
      {/* Wrapped + labeled so it's clear these totals reflect tracked projects only */}
      {/* and don't change with the Tracked / Minor toggle below. */}
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


      {/* Bulk action bar (shows when rows selected) */}
      {isAdmin && selectedIds.size > 0 && (
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

      {/* ── Pipeline: Mobile Card View ── */}
      {view === "pipeline" && (
        <div className="md:hidden space-y-3">
          {filtered.length === 0 && (
            <div className="bg-surface rounded-xl border border-border p-8 text-center text-sm text-subtle">
              No minor projects match your filters.
            </div>
          )}
          {filtered.map((p: any) => (
            <div key={p.id} className="bg-surface rounded-xl border border-border shadow-sm p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-text">{p.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-info-bg text-info">
                  {p.stage}
                </span>
              </div>
              <div className="text-xs text-muted space-y-0.5">
                <p><span className="text-subtle">Foreman:</span> {p.foreman}</p>
                {p.region  && <p><span className="text-subtle">📍</span> {p.region}</p>}
                {p.builder && <p><span className="text-subtle">🏗️</span> {p.builder}</p>}
                {p.contacts && <p><span className="text-subtle">👤</span> {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</p>}
                {p.project_notes && <p className="italic text-subtle">{p.project_notes}</p>}
              </div>
              {isAdmin && (
                <div className="flex gap-1.5 pt-2 border-t border-border">
                  <button
                    onClick={() => setActivateProject(p)}
                    className="flex-1 text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
                    style={{ backgroundColor: "#00BAD6" }}>
                    ✓ Activate
                  </button>
                  <button onClick={() => { setEditProject(p); setDraftStage(p.stage ?? "Rough"); setDraftStagePct(Math.round((p.stage_completion ?? 0) * 100)); }}
                    className="text-xs px-3 py-1.5 bg-surface-2 hover:bg-surface-3 rounded-lg">Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Pipeline Table (desktop) ── */}
      {view === "pipeline" && (
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
                  <tr key={p.id} className="hover:bg-surface-2 transition-colors">
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
                    <td className="px-4 py-3 text-center">
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
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setActivateProject(p)}
                            className="text-xs px-3 py-1 rounded font-medium text-white transition-opacity hover:opacity-80"
                            style={{ backgroundColor: "#00BAD6" }}
                            title="Activate this project">
                            ✓ Activate
                          </button>
                          <button onClick={() => { setEditProject(p); setDraftStage(p.stage ?? "Rough"); setDraftStagePct(Math.round((p.stage_completion ?? 0) * 100)); }}
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

      {/* ── Active Projects: Mobile Card View ── */}
      {view === "active" && (
        <div className="md:hidden space-y-3">
          {filtered.length === 0 && (
            <div className="bg-surface rounded-xl border border-border p-8 text-center text-sm text-subtle">
              No projects match your filters.
            </div>
          )}
          {filtered.map((p: any) => {
            const inc      = p.incentive;
            const matPct   = p.est_materials_budget > 0 ? p.effectiveMaterials / p.est_materials_budget : 0;
            const overMat  = matPct > 1;
            const overHrs  = inc.projectStatus.key === "critical" || inc.projectStatus.key === "at-risk";
            const statusBg =
              inc.projectStatus.key === "critical" ? "bg-danger-bg border-border" :
              inc.projectStatus.key === "at-risk"  ? "bg-warning-bg border-border" :
              inc.projectStatus.key === "watch"    ? "bg-warning-bg border-border" :
                                                      "bg-surface border-border";
            return (
              <div key={p.id} className={`rounded-xl border shadow-sm p-4 space-y-3 ${statusBg}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-text truncate">{p.name}</p>
                    <p className="text-xs text-muted mt-0.5">{p.foreman} · {p.stage}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
                    inc.projectStatus.color === "red"    ? "bg-danger-bg text-danger"    :
                    inc.projectStatus.color === "orange" ? "bg-warning-bg text-warning" :
                    inc.projectStatus.color === "yellow" ? "bg-warning-bg text-warning" :
                    inc.projectStatus.color === "blue"   ? "bg-info-bg text-info"   :
                    inc.projectStatus.color === "green"  ? "bg-success-bg text-success" :
                                                          "bg-surface-2 text-muted"
                  }`}>
                    {inc.projectStatus.emoji} {inc.projectStatus.label}
                  </span>
                </div>

                {/* Contract / Invoiced */}
                {!isForeman && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-subtle uppercase text-[10px]">Contract</p>
                      <p className="font-mono font-semibold text-text">{fmt$(p.contract_value)}</p>
                    </div>
                    <div>
                      <p className="text-subtle uppercase text-[10px]">Invoiced</p>
                      <p className="font-mono font-semibold text-text">{fmt$(p.total_invoiced)}</p>
                      <p className="text-[10px] text-subtle">{fmtPct(p.contract_value > 0 ? p.total_invoiced / p.contract_value : 0)}</p>
                    </div>
                  </div>
                )}

                {/* Progress bars */}
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted font-medium">Stage {fmtPct(p.stage_completion)}</span>
                      <span className="text-muted font-medium">Project {fmtPct(p.project_completion)}</span>
                    </div>
                    <ProgressBar value={p.project_completion} max={1} color="blue" />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted">Materials</span>
                      <span className={`font-semibold ${overMat ? "text-danger" : "text-text"}`}>{fmtPct(matPct)}</span>
                    </div>
                    <ProgressBar value={p.effectiveMaterials} max={p.est_materials_budget} color={overMat ? "red" : matPct > 0.8 ? "yellow" : "green"} />
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] mb-0.5">
                      <span className="text-muted">Hours</span>
                      <span className={`font-semibold ${overHrs ? "text-danger" : "text-text"}`}>{p.effectiveHours.toLocaleString()} / {p.goal_hours.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={p.effectiveHours} max={p.goal_hours} color={overHrs ? "red" : "green"} />
                  </div>
                </div>

                {/* Links (basecamp + drive) */}
                {(p.basecamp_link || p.drive_folder) && (
                  <div className="flex items-center gap-2">
                    {p.basecamp_link && (
                      <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-text">
                        <img src="/icons/basecamp.svg" alt="" className="w-4 h-4" />
                        Basecamp
                      </a>
                    )}
                    {p.drive_folder && (
                      <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-text">
                        <img src="/icons/google-drive.svg" alt="" className="w-4 h-4" />
                        Drive
                      </a>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[10px] text-subtle">
                    {(() => { const rt = relativeTime(p.updated_at); return rt.label; })()}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => toggleRow(p.id)}
                      className="text-xs px-2.5 py-1 bg-surface border border-border hover:bg-surface-2 rounded transition-colors">
                      {expandedRows.has(p.id) ? "▲ Hide" : "▼ Insights"}
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => { setEditProject(p); setDraftStage(p.stage ?? "Rough"); setDraftStagePct(Math.round((p.stage_completion ?? 0) * 100)); }}
                        className="text-xs px-2.5 py-1 bg-info-bg border border-border text-info hover:bg-info-bg rounded transition-colors">
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-subtle text-center pt-1">Showing {filtered.length} of {projects.length} projects</p>
        </div>
      )}

      {/* ── Active Projects Table (desktop) ── */}
      {view === "active" && <div className="hidden md:block bg-surface rounded-2xl border border-border shadow-sm overflow-hidden">
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
                  <React.Fragment key={p.id}>
                  <tr
                    id={`project-row-${p.id}`}
                    onClick={() => toggleRow(p.id)}
                    title={expandedRows.has(p.id) ? "Click to hide insights" : "Click to show insights"}
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
                            onClick={() => { setEditProject(p); setDraftStage(p.stage ?? "Rough"); setDraftStagePct(Math.round((p.stage_completion ?? 0) * 100)); }}
                            title="Edit project"
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-accent-soft hover:text-accent transition-colors">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => toggleRow(p.id)}
                          title={expandedRows.has(p.id) ? "Hide insights" : "Show insights"}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-subtle hover:bg-surface-2 hover:text-text transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                            className={`transition-transform duration-200 ${expandedRows.has(p.id) ? "rotate-180" : ""}`}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {expandedRows.has(p.id) && (
                    <tr className="border-b border-border bg-surface-2">
                      <td colSpan={isAdmin ? 8 : isForeman ? 6 : 7} className="px-6 py-4">
                        <div className="flex flex-col gap-3">
                          {/* Insight line */}
                          <div className="flex items-start gap-2 text-sm text-text">
                            <span className="text-base leading-none mt-0.5">{inc.projectStatus.emoji}</span>
                            <span>
                              <span className="font-semibold text-text">{p.name} — </span>
                              {inc.highlight}
                              <span className="ml-2 text-xs text-subtle">
                                ({inc.varianceHours >= 0
                                  ? `${Math.abs(inc.varianceHours).toFixed(0)} hrs under`
                                  : `${Math.abs(inc.varianceHours).toFixed(0)} hrs over`}
                                {" · "}{(inc.variancePct * 100).toFixed(1)}% variance)
                              </span>
                            </span>
                          </div>

                          {/* Per-stage bonus breakdown */}
                          <div className="flex flex-wrap gap-2">
                            {([
                              { label: "Rough",  sb: inc.rough  },
                              { label: "Finish", sb: inc.finish },
                            ] as const).map(({ label, sb }) => {
                              if (sb.status === "no-data") return null;
                              if (sb.status === "locked") return (
                                <div key={label} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-surface-2 border border-border">
                                  <span className="font-semibold text-muted">{label}</span>
                                  <span className="text-subtle">🔒 Stage not yet 100% — bonus locked</span>
                                  {sb.allowed > 0 && (
                                    <span className="text-subtle font-mono">
                                      ({sb.actual > 0 ? `${sb.actual.toLocaleString()} hrs logged` : "no hours yet"} · goal {sb.allowed.toLocaleString()} hrs)
                                    </span>
                                  )}
                                </div>
                              );
                              const good = sb.variance >= 0;
                              const bgCls =
                                sb.status === "beat" ? "bg-success-bg border-border" :
                                sb.status === "meet" ? "bg-info-bg  border-border"  :
                                                      "bg-danger-bg   border-border";
                              const txtCls =
                                sb.status === "beat" ? "text-success" :
                                sb.status === "meet" ? "text-info"  : "text-danger";
                              return (
                                <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs border ${bgCls}`}>
                                  <span className={`font-bold ${txtCls}`}>{label}</span>
                                  <span className={`font-semibold ${txtCls}`}>{sb.label}</span>
                                  <span className="text-muted font-mono">
                                    {sb.actual.toLocaleString()} / {sb.allowed.toLocaleString()} hrs
                                    · {good ? "−" : "+"}{Math.abs(sb.variance).toFixed(0)} hrs ({(Math.abs(sb.variancePct) * 100).toFixed(1)}% {good ? "under" : "over"})
                                  </span>
                                  {!isForeman && sb.earned > 0 && (
                                    <span className={`font-bold ${txtCls}`}>{fmt$(sb.earned)}</span>
                                  )}
                                </div>
                              );
                            })}
                            {!isForeman && inc.totalEarned > 0 && (
                              <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-green-600 text-white font-semibold">
                                ✓ Confirmed earned: {fmt$(inc.totalEarned)}
                              </div>
                            )}
                          </div>

                          {/* Stage schedule strip */}
                          {(() => {
                            const stages = stagesByProject[p.id] ?? [];
                            const currentStage = stages.find((s: any) => s.stage === p.stage);
                            if (!stages.length) return null;
                            return (
                              <div className="flex flex-wrap gap-2">
                                {stages.map((s: any, i: number) => {
                                  const isCurrent = s.stage === p.stage;
                                  const statusColor =
                                    s.status === "Complete"    ? { bg: "var(--success-bg)", color: "#16a34a", border: "#bbf7d0" } :
                                    s.status === "In Progress" ? { bg: "var(--accent-soft)", color: "#00BAD6", border: "#a5f3fc" } :
                                                                 { bg: "var(--surface-2)", color: "#9ca3af", border: "#e5e7eb" };
                                  return (
                                    <div key={i}
                                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                                      style={{
                                        backgroundColor: isCurrent ? statusColor.bg : "#f9fafb",
                                        border: `1px solid ${isCurrent ? statusColor.border : "#e5e7eb"}`,
                                        fontWeight: isCurrent ? 600 : 400,
                                      }}>
                                      <span style={{ color: isCurrent ? statusColor.color : "#9ca3af" }}>{s.stage}</span>
                                      {(s.start_date || s.end_date) && (
                                        <span className="font-mono" style={{ color: "#6b7280" }}>
                                          {fmtDate(s.start_date)} → {fmtDate(s.end_date)}
                                        </span>
                                      )}
                                      <span className="text-xs px-1 py-0.5 rounded-full"
                                        style={{ backgroundColor: statusColor.bg, color: statusColor.color, border: `1px solid ${statusColor.border}` }}>
                                        {s.status}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}

                          {/* CRM row */}
                          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
                            {p.region    && <span>📍 {p.region}</span>}
                            {p.builder   && <span>🏗️ <span className="font-medium text-text">{p.builder}</span></span>}
                            {p.contacts  && <span>👤 {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</span>}
                            {p.project_notes && <span className="italic text-subtle">{p.project_notes}</span>}

                            {/* Quick links */}
                            <div className="flex items-center gap-2 ml-auto">
                              {p.basecamp_link && (
                                <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-text">
                                  <img src="/icons/basecamp.svg" alt="" className="w-4 h-4" />
                                  Basecamp
                                </a>
                              )}
                              {p.drive_folder && (
                                <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-border bg-surface hover:bg-surface-2 transition-colors text-text">
                                  <img src="/icons/google-drive.svg" alt="" className="w-4 h-4" />
                                  Drive
                                </a>
                              )}
                            </div>
                          </div>

                          {/* ── Profitability ── */}
                          {!isForeman && (() => {
                            const wage      = p.blended_hourly_wage ?? 37;
                            const estCost   = (p.est_materials_budget ?? 0) + (p.est_total_hours ?? 0) * wage;
                            const actCost   = (p.effectiveMaterials ?? 0) + (p.effectiveHours ?? 0) * wage;
                            const estProfit = (p.contract_value ?? 0) - estCost;
                            const estMargin = p.contract_value > 0 ? estProfit / p.contract_value : 0;
                            const burnPct   = estCost > 0 ? actCost / estCost : 0;
                            const overBudget = burnPct > 1;
                            return (
                              <div className="border-t border-border pt-3">
                                <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide mb-2">💰 Profitability</p>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {[
                                    { label: "Est. Total Cost",  value: fmt$(estCost),   sub: `Mat + ${wage}/hr × est hrs` },
                                    { label: "Est. Profit",      value: fmt$(estProfit), sub: `${fmtPct(estMargin)} margin`,
                                      hi: estMargin > 0.35 ? "text-success" : estMargin > 0.15 ? "text-warning" : "text-danger" },
                                    { label: "Actual Cost So Far", value: fmt$(actCost), sub: `${fmtPct(burnPct)} of budget`,
                                      hi: overBudget ? "text-danger" : burnPct > 0.85 ? "text-warning" : "text-text" },
                                    { label: "Labor Cost (actual)", value: fmt$((p.effectiveHours ?? 0) * wage),
                                      sub: `${(p.effectiveHours ?? 0).toLocaleString()} hrs × $${wage}` },
                                  ].map(c => (
                                    <div key={c.label} className="rounded-lg border border-border bg-surface px-3 py-2">
                                      <p className="text-[10px] text-subtle uppercase tracking-wide">{c.label}</p>
                                      <p className={`text-sm font-bold mt-0.5 ${c.hi ?? "text-text"}`}>{c.value}</p>
                                      {c.sub && <p className="text-[10px] text-subtle">{c.sub}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* ── Activity Log ── */}
                          {(() => {
                            const acts = activitiesByProject[p.id];
                            if (!acts) return (
                              <div className="border-t border-border pt-3">
                                <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📋 Activity Log</p>
                                <p className="text-xs text-subtle mt-1">Loading…</p>
                              </div>
                            );
                            return (
                              <div className="border-t border-border pt-3">
                                <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide mb-2">📋 Activity Log</p>
                                {acts.length === 0 ? (
                                  <p className="text-xs text-subtle">No activity yet.</p>
                                ) : (
                                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                    {acts.map((a: any) => (
                                      <div key={a.id} className="flex items-start gap-2 text-xs">
                                        <span className="shrink-0 font-medium text-muted min-w-[80px]">{a.user_name}</span>
                                        <span className="shrink-0 text-subtle px-1.5 py-0.5 rounded bg-surface-2">{a.action}</span>
                                        <span className="text-muted flex-1">{a.details ?? ""}</span>
                                        <span className="shrink-0 text-subtle tabular-nums">
                                          {new Date(a.created_at.replace(" ", "T") + "Z").toLocaleDateString()}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* ── Change Orders ── */}
                          {!isForeman && <ChangeOrdersPanel projectId={p.id} isAdmin={isAdmin} />}

                          {/* ── Comments / @mentions ── */}
                          <CommentsPanel projectId={p.id} availableUsers={availableUsers} />

                          {/* ── Danger zone ── */}
                          {isAdmin && (
                            <div className="flex justify-end border-t border-border pt-2">
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="text-[11px] px-2.5 py-1 rounded-md text-danger hover:text-danger hover:bg-danger-bg transition-colors">
                                Delete project…
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t text-xs text-subtle bg-surface-2">
          Showing {filtered.length} of {projects.length} tracked projects
        </div>
      </div>}  {/* end view === "active" */}

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

      {/* ── Edit modal ── */}
      {editProject && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface px-6 py-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold text-text">Edit: {editProject.name}</h2>
              <button onClick={() => setEditProject(null)} className="text-subtle hover:text-muted text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-5">
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
                        defaultValue={editProject[f.key] ?? ""}
                        className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                    </div>
                  ))}
                  {/* Stage as a select so it feeds the live completion preview */}
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
                    <input name="project_notes" type="text" defaultValue={editProject.project_notes ?? ""}
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Basecamp Link</label>
                    <input name="basecamp_link" type="text" defaultValue={editProject.basecamp_link ?? ""}
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-muted mb-1">Drive Folder (name or URL)</label>
                    <input name="drive_folder" type="text" defaultValue={editProject.drive_folder ?? ""}
                      className="w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties} />
                  </div>
                </div>
              </div>

              {/* ── Financial data (active projects only) ── */}
              {!editProject.is_pipeline && (
                <div>
                  <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">Financial / Hours</p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Stage completion — editable */}
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
                    {/* Project completion — calculated, read-only */}
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
                          defaultValue={editProject[f.key] ?? ""}
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
                  {/* Column headers */}
                  <div className="text-xs font-medium text-muted">Stage</div>
                  <div className="text-xs font-medium text-muted">Start Date</div>
                  <div className="text-xs font-medium text-muted">End / Completion Date</div>
                  {(["Underground", "Rough", "Finish"] as const).map(stageName => {
                    const existing = stagesByProject[editProject.id]?.find((s: any) => s.stage === stageName);
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
                <button type="submit"
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors">
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditProject(null)}
                  className="flex-1 py-2 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
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

      {/* ── Activate modal ── */}
      {activateProject && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm">
            {/* Header */}
            <div className="px-6 py-4 border-b flex justify-between items-start">
              <div>
                <h2 className="text-base font-bold text-text">Activate Project</h2>
                <p className="text-xs text-muted mt-0.5">{activateProject.name}</p>
              </div>
              <button onClick={() => setActivateProject(null)}
                className="text-subtle hover:text-muted text-2xl leading-none ml-4">&times;</button>
            </div>

            <form onSubmit={handleConfirmActivate} className="p-6 space-y-4">
              {/* Contract value — the whole point */}
              <div>
                <label className="block text-sm font-semibold text-text mb-1">
                  Contract Value <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle font-medium">$</span>
                  <input
                    name="contract_value"
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    defaultValue={activateProject.contract_value > 0 ? activateProject.contract_value : ""}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 text-sm border-2 border-border-strong rounded-lg focus:outline-none focus:border-[#00BAD6] font-mono"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-subtle mt-1">Enter the signed contract amount before activating.</p>
              </div>

              {/* Foreman — may change from pipeline assignment */}
              <div>
                <label className="block text-sm font-medium text-text mb-1">Foreman</label>
                <input
                  name="foreman"
                  type="text"
                  required
                  defaultValue={activateProject.foreman}
                  className="w-full px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
                />
              </div>

              {/* Stage */}
              <div>
                <label className="block text-sm font-medium text-text mb-1">Starting Stage</label>
                <select
                  name="stage"
                  defaultValue={activateProject.stage}
                  className="w-full px-3 py-2 text-sm border border-border-strong rounded-lg focus:outline-none focus:ring-2"
                  style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}>
                  <option value="Contracting Phase">Contracting Phase</option>
                  <option value="Underground">Underground</option>
                  <option value="Rough">Rough</option>
                  <option value="Finish">Finish</option>
                  <option value="Extras">Extras</option>
                </select>
              </div>

              {/* Summary callout */}
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
                <button type="button" onClick={() => setActivateProject(null)}
                  className="flex-1 py-2.5 bg-surface-2 hover:bg-surface-3 rounded-lg text-sm font-medium transition-colors">
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
