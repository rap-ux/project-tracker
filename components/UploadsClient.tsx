"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "./useConfirm";
import QboMappingPanel from "./QboMappingPanel";

// ── Field display helpers ─────────────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
  contract_value:       "Contract Value",
  total_invoiced:       "Total Invoiced",
  est_materials_budget: "Est. Materials Budget",
  actual_materials:     "Actual Materials",
  est_total_hours:      "Est. Total Hours",
  actual_total_hours:   "Actual Total Hours",
  goal_hours:           "Goal Hours",
  rough_hours_allowed:  "Rough Hours Allowed",
  rough_hours_actual:   "Rough Hours Actual",
  finish_hours_allowed: "Finish Hours Allowed",
  finish_hours_actual:  "Finish Hours Actual",
  stage_completion:     "Stage Completion",
  project_completion:   "Project Completion",
  stage:                "Stage",
  foreman:              "Foreman",
};

const DOLLAR_FIELDS  = new Set(["contract_value","total_invoiced","est_materials_budget","actual_materials"]);
const PCT_FIELDS_DISP = new Set(["stage_completion","project_completion"]);

function fmtVal(val: string | null | undefined, field: string): string {
  if (val === null || val === undefined || val === "") return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  if (DOLLAR_FIELDS.has(field))   return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (PCT_FIELDS_DISP.has(field)) return (n * 100).toFixed(1) + "%";
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function fmtDate(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts.replace(" ", "T") + (ts.includes("T") ? "" : "Z"));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function relDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d  = new Date(ts.replace(" ", "T") + (ts.includes("T") ? "" : "Z"));
  const ms = Date.now() - d.getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(ms / 3600000);
  const dy = Math.floor(ms / 86400000);
  if (m < 1)  return "just now";
  if (h < 1)  return `${m}m ago`;
  if (dy < 1) return `${h}h ago`;
  if (dy < 7) return `${dy}d ago`;
  return fmtDate(ts);
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface StagedChange {
  id:           number;
  batch_id:     number;
  project_id:   number;
  project_name: string;
  field:        string;
  old_value:    string | null;
  new_value:    string;
}

interface Batch {
  id:           number;
  filename:     string;
  source:       "bulk" | "project" | "sheet";
  project_id:   number | null;
  project_name: string | null;
  uploaded_at:  string;
  status:       "pending" | "applied" | "discarded" | "reverted";
  applied_at:   string | null;
  reverted_at:  string | null;
  change_count: number;
}

interface Props {
  batches:        Batch[];
  changesByBatch: Record<number, StagedChange[]>;
  projects:       { id: number; name: string }[];
}

// Manual file upload is archived now that data syncs from the Google Sheet.
// Flip to true to bring the upload UI back (handlers/endpoints are intact).
const FILE_UPLOAD_ENABLED = false;

export default function UploadsClient({ batches, changesByBatch, projects }: Props) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [tab,            setTab]            = useState<"pending" | "history">("pending");
  const [expandedBatch,  setExpandedBatch]  = useState<number | null>(null);
  const [checked,        setChecked]        = useState<Set<number>>(new Set());
  const [applying,       setApplying]       = useState<number | null>(null);
  const [discarding,     setDiscarding]     = useState<number | null>(null);
  const [reverting,      setReverting]      = useState<number | null>(null);
  const [uploading,      setUploading]      = useState(false);
  const [uploadMode,     setUploadMode]     = useState<"bulk" | "project">("bulk");
  const [inputMethod,    setInputMethod]    = useState<"file" | "paste">("file");
  const [pasteText,      setPasteText]      = useState("");
  const [selectedProject, setSelectedProject] = useState<number>(projects[0]?.id ?? 0);
  const [msg,            setMsg]            = useState<{ text: string; ok: boolean } | null>(null);
  const [qboSyncing,     setQboSyncing]     = useState(false);
  const bulkRef    = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);

  const pendingBatches  = batches.filter(b => b.status === "pending");
  const historyBatches  = batches.filter(b => b.status !== "pending");

  // ── Expand a batch and default-check all its changes ─────────────────────
  function handleExpand(batchId: number) {
    if (expandedBatch === batchId) { setExpandedBatch(null); return; }
    setExpandedBatch(batchId);
    const ids = (changesByBatch[batchId] ?? []).map(c => c.id);
    setChecked(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      return next;
    });
  }

  function toggleChange(changeId: number) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(changeId) ? next.delete(changeId) : next.add(changeId);
      return next;
    });
  }

  function toggleAllInBatch(batchId: number, select: boolean) {
    const ids = (changesByBatch[batchId] ?? []).map(c => c.id);
    setChecked(prev => {
      const next = new Set(prev);
      if (select) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res  = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.ok) {
      const newNote = data.newProjects?.length
        ? ` Note: ${data.newProjects.length} new project(s) not tracked yet (${data.newProjects.join(", ")}) — add with "+ Add Project", then re-upload.`
        : "";
      setMsg({ text: `✅ ${data.changeCount} change(s) staged across ${data.projectCount} project(s). Review below.${newNote}`, ok: true });
      setTab("pending");
      setTimeout(() => router.refresh(), 1500);
    } else {
      setMsg({ text: `❌ ${data.error ?? "Upload failed"}`, ok: false });
    }
  }

  async function handleProjectUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedProject) return;
    e.target.value = "";
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res  = await fetch(`/api/projects/${selectedProject}/import`, { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.ok) {
      setMsg({ text: `✅ ${data.changeCount} change(s) staged. Review below.`, ok: true });
      setTab("pending");
      setTimeout(() => router.refresh(), 800);
    } else {
      setMsg({ text: `❌ ${data.error ?? "Import failed"}`, ok: false });
    }
  }

  async function handleProjectPaste() {
    if (!pasteText.trim() || !selectedProject) return;
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("text", pasteText.trim());
    const res  = await fetch(`/api/projects/${selectedProject}/import`, { method: "POST", body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.ok) {
      setMsg({ text: `✅ ${data.changeCount} change(s) staged. Review below.`, ok: true });
      setPasteText("");
      setTab("pending");
      setTimeout(() => router.refresh(), 800);
    } else {
      setMsg({ text: `❌ ${data.error ?? "Could not parse pasted text"}`, ok: false });
    }
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  async function handleApply(batchId: number) {
    const batchChangeIds = (changesByBatch[batchId] ?? []).map(c => c.id);
    const changeIds      = batchChangeIds.filter(id => checked.has(id));
    if (changeIds.length === 0) {
      setMsg({ text: "❌ No changes selected. Check at least one row to apply.", ok: false });
      return;
    }
    setApplying(batchId);
    try {
      const res  = await fetch(`/api/upload/batches/${batchId}/apply`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ changeIds }),
      });
      const data = await res.json();
      if (data.ok) {
        setMsg({ text: `✅ Applied ${data.applied} change(s) to ${data.projects} project(s).`, ok: true });
        setTimeout(() => router.refresh(), 800);
      } else {
        setMsg({ text: `❌ ${data.error ?? "Apply failed"}`, ok: false });
      }
    } catch {
      setMsg({ text: "❌ Network error — nothing was applied. Try again.", ok: false });
    } finally {
      setApplying(null);
    }
  }

  // ── Discard ───────────────────────────────────────────────────────────────
  async function handleDiscard(batchId: number) {
    if (!(await confirm("This removes the staged changes without applying them. The batch can't be recovered afterward — you'd need to re-sync from the sheet.", { title: "Discard batch", confirmLabel: "Discard", danger: true }))) return;
    setDiscarding(batchId);
    try {
      const res = await fetch(`/api/upload/batches/${batchId}`, { method: "DELETE" });
      if (!res.ok) {
        setMsg({ text: "❌ Discard failed — the batch is still pending. Try again.", ok: false });
        return;
      }
      router.refresh();
    } catch {
      setMsg({ text: "❌ Network error — nothing was discarded. Try again.", ok: false });
    } finally {
      setDiscarding(null);
    }
  }

  // ── Revert ────────────────────────────────────────────────────────────────
  async function handleRevert(batchId: number) {
    if (!(await confirm("All changes from this batch will be rolled back to their previous values across every affected project.", { title: "Revert upload", confirmLabel: "Revert", danger: true }))) return;
    setReverting(batchId);
    try {
      const res  = await fetch(`/api/upload/batches/${batchId}/revert`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMsg({ text: `✅ Reverted ${data.reverted} change(s) across ${data.projects} project(s).`, ok: true });
        setTimeout(() => router.refresh(), 800);
      } else {
        setMsg({ text: `❌ ${data.error ?? "Revert failed"}`, ok: false });
      }
    } catch {
      setMsg({ text: "❌ Network error — nothing was reverted. Try again.", ok: false });
    } finally {
      setReverting(null);
    }
  }

  return (
    <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-6 space-y-6">
      {confirmDialog}

      {/* ── Page header ── */}
      <div>
        <h1 className="text-2xl font-bold text-text">Profitability Uploads</h1>
        <p className="text-sm text-muted mt-1">
          Drop in the weekly spreadsheet export, review every change before it's applied, and revert any batch at any time.
        </p>
      </div>

      {/* ── Feedback message ── */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium border ${
          msg.ok
            ? "bg-success-bg border-border text-success"
            : "bg-danger-bg   border-border   text-danger"
        }`}>
          {msg.text}
        </div>
      )}

      {/* ── How the sheet sync works (push from the sheet's Switchboard menu) ── */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-6 flex items-start gap-3">
        <span className="text-xl shrink-0">🔄</span>
        <div>
          <h2 className="text-sm font-bold text-text uppercase tracking-wide">Synced from the Google Sheet</h2>
          <p className="text-xs text-subtle mt-1 max-w-xl">
            Changes arrive automatically from the spreadsheet (via the <strong>Switchboard → Sync now</strong> menu in the sheet, or the nightly auto-sync) and appear below for review and approval. Unrecorded hours and materials are preserved automatically.
          </p>
        </div>
      </div>

      {/* ── QuickBooks Online sync (estimates / invoices / bills) ── */}
      <div className="bg-surface rounded-xl border border-border shadow-sm p-6 flex items-start gap-3">
        <span className="text-xl shrink-0">📗</span>
        <div className="flex-1">
          <h2 className="text-sm font-bold text-text uppercase tracking-wide">QuickBooks Online</h2>
          <p className="text-xs text-subtle mt-1 max-w-xl">
            Pulls every estimate, invoice, and bill straight from QuickBooks and attaches them to
            projects — powering the per-project revenue stack, orphan-invoice alerts, outside-labor
            hours, and the AV/electric split. Also runs nightly.
          </p>
        </div>
        <button
          onClick={async () => {
            setQboSyncing(true);
            setMsg(null);
            try {
              const res  = await fetch("/api/qbo/sync", { method: "POST" });
              const data = await res.json();
              if (res.ok) {
                setMsg({
                  text: `✅ QBO sync: ${data.estimates} estimates, ${data.invoices} invoices, ${data.bills} bills.` +
                        (data.orphans ? ` ⚠ ${data.orphans} invoice(s) with no linked estimate.` : "") +
                        (data.unmapped?.length ? ` ❓ Unmapped: ${data.unmapped.slice(0, 5).join(", ")}${data.unmapped.length > 5 ? "…" : ""}` : ""),
                  ok: true,
                });
              } else {
                setMsg({ text: `❌ ${data.error ?? "QBO sync failed"}`, ok: false });
              }
            } catch {
              setMsg({ text: "❌ QBO sync failed — network error.", ok: false });
            }
            setQboSyncing(false);
          }}
          disabled={qboSyncing}
          className="shrink-0 text-xs px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white rounded-lg font-semibold">
          {qboSyncing ? "Syncing…" : "Sync QBO now"}
        </button>
      </div>

      {/* ── QBO customer → project mapping ── */}
      <QboMappingPanel />

      {/* ── Manual file upload (archived: the Google Sheet sync is the path now) ── */}
      {FILE_UPLOAD_ENABLED && (
      <div className="bg-surface rounded-xl border border-border shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-bold text-text uppercase tracking-wide">Upload a File</h2>

        {/* Mode toggle */}
        <div className="flex rounded-lg border border-border-strong overflow-hidden text-sm w-fit">
          {(["bulk", "project"] as const).map(m => (
            <button
              key={m}
              onClick={() => setUploadMode(m)}
              className={`px-4 py-1.5 transition-colors font-medium ${
                uploadMode === m
                  ? "text-white"
                  : "bg-surface text-muted hover:bg-surface-2"
              }`}
              style={uploadMode === m ? { backgroundColor: "#00BAD6" } : {}}>
              {m === "bulk" ? "📊 Bulk (all projects)" : "📋 Single project"}
            </button>
          ))}
        </div>

        {uploadMode === "bulk" ? (
          <div className="flex items-center gap-4">
            <label className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer transition-colors ${
              uploading ? "bg-subtle cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
            }`}>
              {uploading ? "Uploading…" : "📤 Choose File (.xlsx or .csv)"}
              <input
                ref={bulkRef}
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={handleBulkUpload}
                disabled={uploading}
              />
            </label>
            <p className="text-xs text-subtle max-w-md">
              Best file: the SUMMARY_Project KPIs export. Syncs contract, invoiced, materials, hours, stage, foreman, and completion in one shot. Unrecorded hours/materials are preserved automatically, and you review every change before applying. New projects not in Switchboard yet are flagged to add first.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Project selector */}
            <div className="flex flex-col gap-1.5 w-fit">
              <label className="text-xs font-medium text-muted">Select project</label>
              <select
                value={selectedProject}
                onChange={e => setSelectedProject(Number(e.target.value))}
                className="px-3 py-1.5 text-sm border border-border-strong rounded-lg focus:outline-none"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* File vs Paste toggle */}
            <div className="flex rounded-lg border border-border overflow-hidden text-xs w-fit">
              {(["file", "paste"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setInputMethod(m)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    inputMethod === m
                      ? "bg-gray-700 text-white"
                      : "bg-surface text-muted hover:bg-surface-2"
                  }`}>
                  {m === "file" ? "📁 Upload file" : "📋 Paste from QBO"}
                </button>
              ))}
            </div>

            {inputMethod === "file" ? (
              <div className="flex items-center gap-3">
                <label className={`inline-flex items-center gap-2 px-5 py-1.5 rounded-lg text-sm font-semibold text-white cursor-pointer transition-colors ${
                  uploading ? "bg-subtle cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                }`}>
                  {uploading ? "Uploading…" : "📤 Choose File (.xlsx or .csv)"}
                  <input
                    ref={projectRef}
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    onChange={handleProjectUpload}
                    disabled={uploading || !selectedProject}
                  />
                </label>
                <p className="text-xs text-subtle">Accepts .xlsx or .csv exports.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-muted">
                    In QBO, open the Project Profitability report → select all (Ctrl+A) → copy (Ctrl+C) → paste below.
                  </p>
                  <button
                    onClick={handleProjectPaste}
                    disabled={uploading || !pasteText.trim()}
                    className="shrink-0 px-5 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: pasteText.trim() && !uploading ? "#00BAD6" : "#9ca3af" }}>
                    {uploading ? "Parsing…" : "Parse & Stage →"}
                  </button>
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste QBO report here…"
                  rows={6}
                  className="w-full text-xs font-mono border border-border-strong rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00BAD6] resize-y"
                />
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-border">
        {(["pending", "history"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-[#00BAD6] text-[#00BAD6]"
                : "border-transparent text-muted hover:text-text"
            }`}>
            {t === "pending"
              ? `Pending Review${pendingBatches.length > 0 ? ` (${pendingBatches.length})` : ""}`
              : `History${historyBatches.length > 0 ? ` (${historyBatches.length})` : ""}`}
          </button>
        ))}
      </div>

      {/* ── Pending tab ── */}
      {tab === "pending" && (
        <div className="space-y-4">
          {pendingBatches.length === 0 ? (
            <div className="text-center py-16 text-subtle">
              <p className="text-4xl mb-3">📭</p>
              <p className="font-medium">No pending uploads</p>
              <p className="text-sm mt-1">Upload a file above to stage changes for review.</p>
            </div>
          ) : pendingBatches.map(batch => {
            const batchChanges = changesByBatch[batch.id] ?? [];
            const isExpanded   = expandedBatch === batch.id;
            const checkedCount = batchChanges.filter(c => checked.has(c.id)).length;
            const allChecked   = checkedCount === batchChanges.length && batchChanges.length > 0;

            // Group by project for display
            const byProject = new Map<string, StagedChange[]>();
            for (const c of batchChanges) {
              if (!byProject.has(c.project_name)) byProject.set(c.project_name, []);
              byProject.get(c.project_name)!.push(c);
            }

            return (
              <div key={batch.id} className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden">

                {/* Batch header */}
                <div
                  className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-surface-2 transition-colors"
                  onClick={() => handleExpand(batch.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{batch.source === "sheet" ? "🔄" : batch.source === "bulk" ? "📊" : "📋"}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-text truncate">{batch.filename}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {batch.source === "bulk"
                          ? `Bulk upload · ${[...new Set(batchChanges.map(c => c.project_name))].length} project(s)`
                          : `Single project · ${batch.project_name ?? "unknown"}`}
                        {" · "}
                        <span title={fmtDate(batch.uploaded_at)}>{relDate(batch.uploaded_at)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs bg-warning-bg text-warning px-2.5 py-1 rounded-full font-semibold">
                      {batch.change_count} change{batch.change_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-subtle text-sm">{isExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>

                {/* Expanded diff table */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {/* Select-all row */}
                    <div className="flex items-center justify-between px-5 py-2.5 bg-surface-2 border-b border-border">
                      <label className="flex items-center gap-2 text-xs font-medium text-muted cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allChecked}
                          onChange={e => toggleAllInBatch(batch.id, e.target.checked)}
                          className="rounded"
                        />
                        {allChecked ? "Deselect all" : "Select all"} ({checkedCount}/{batchChanges.length})
                      </label>
                      <p className="text-xs text-subtle">Review each change and uncheck any you don't want to apply.</p>
                    </div>

                    {/* Changes grouped by project */}
                    <div className="divide-y divide-border">
                      {[...byProject.entries()].map(([projectName, projectChanges]) => (
                        <div key={projectName}>
                          <div className="px-5 py-2 bg-slate-50">
                            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{projectName}</p>
                          </div>
                          <table className="w-full text-sm">
                            <tbody>
                              {projectChanges.map(c => {
                                const isChecked    = checked.has(c.id);
                                const hasIncrease  = c.old_value !== null && parseFloat(c.new_value) > parseFloat(c.old_value);
                                const hasDecrease  = c.old_value !== null && parseFloat(c.new_value) < parseFloat(c.old_value);
                                return (
                                  <tr
                                    key={c.id}
                                    className={`border-b border-border transition-colors cursor-pointer ${
                                      isChecked ? "bg-surface hover:bg-info-bg/30" : "bg-surface-2/50 hover:bg-surface-2/50 opacity-60"
                                    }`}
                                    onClick={() => toggleChange(c.id)}>
                                    <td className="px-5 py-2.5 w-8">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleChange(c.id)}
                                        onClick={e => e.stopPropagation()}
                                        className="rounded"
                                      />
                                    </td>
                                    <td className="px-3 py-2.5 text-muted text-xs font-medium w-48">
                                      {FIELD_LABELS[c.field] ?? c.field}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-xs text-subtle w-32">
                                      {fmtVal(c.old_value, c.field)}
                                    </td>
                                    <td className="px-3 py-2.5 text-subtle text-center w-8">→</td>
                                    <td className="px-3 py-2.5 font-mono text-xs font-semibold w-32">
                                      <span className={
                                        hasIncrease ? "text-success" :
                                        hasDecrease ? "text-danger"   : "text-text"
                                      }>
                                        {fmtVal(c.new_value, c.field)}
                                        {hasIncrease && " ▲"}
                                        {hasDecrease && " ▼"}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between px-5 py-4 bg-surface-2 border-t border-border">
                      <button
                        onClick={() => handleDiscard(batch.id)}
                        disabled={discarding === batch.id}
                        className="text-sm px-4 py-2 rounded-lg border border-border-strong text-muted hover:bg-surface-2 transition-colors disabled:opacity-50">
                        {discarding === batch.id ? "Discarding…" : "🗑 Discard batch"}
                      </button>
                      <button
                        onClick={() => handleApply(batch.id)}
                        disabled={applying === batch.id || checkedCount === 0}
                        className={`text-sm px-5 py-2 rounded-lg font-semibold text-white transition-colors ${
                          checkedCount > 0 && applying !== batch.id
                            ? "bg-[#00BAD6] hover:bg-[#00a5bf] cursor-pointer"
                            : "bg-subtle cursor-not-allowed opacity-60"
                        }`}>
                        {applying === batch.id
                          ? "Applying…"
                          : `✓ Apply ${checkedCount} selected change${checkedCount !== 1 ? "s" : ""}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div className="space-y-3">
          {historyBatches.length === 0 ? (
            <div className="text-center py-16 text-subtle">
              <p className="text-4xl mb-3">📜</p>
              <p className="font-medium">No upload history yet</p>
            </div>
          ) : historyBatches.map(batch => {
            const statusMap: Record<string, { label: string; badge: string; icon: string }> = {
              applied:   { label: "Applied",   badge: "bg-success-bg text-success",  icon: "✅" },
              reverted:  { label: "Reverted",  badge: "bg-surface-2  text-muted",   icon: "↩️" },
              discarded: { label: "Discarded", badge: "bg-danger-bg   text-danger",    icon: "🗑" },
            };
            const statusConfig = statusMap[batch.status] ?? { label: batch.status, badge: "bg-surface-2 text-muted", icon: "•" };

            return (
              <div key={batch.id} className="bg-surface rounded-xl border border-border shadow-sm px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{batch.source === "sheet" ? "🔄" : batch.source === "bulk" ? "📊" : "📋"}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-text truncate">{batch.filename}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {batch.source === "project" ? `${batch.project_name ?? "—"} · ` : ""}
                      {batch.change_count} change{batch.change_count !== 1 ? "s" : ""}
                      {" · "}
                      <span title={fmtDate(batch.uploaded_at)}>{relDate(batch.uploaded_at)}</span>
                      {batch.applied_at  && ` · Applied ${relDate(batch.applied_at)}`}
                      {batch.reverted_at && ` · Reverted ${relDate(batch.reverted_at)}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusConfig.badge}`}>
                    {statusConfig.icon} {statusConfig.label}
                  </span>
                  {batch.status === "applied" && (
                    <button
                      onClick={() => handleRevert(batch.id)}
                      disabled={reverting === batch.id}
                      className="text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-warning hover:bg-warning-bg transition-colors font-medium disabled:opacity-50">
                      {reverting === batch.id ? "Reverting…" : "↩ Revert"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </main>
  );
}
