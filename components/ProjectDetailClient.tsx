"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ChangeOrdersPanel    from "./ChangeOrdersPanel";
import CommentsPanel        from "./CommentsPanel";
import ProjectEditModal     from "./ProjectEditModal";
import ActivateProjectModal from "./ActivateProjectModal";
import { useConfirm }       from "./useConfirm";
import { fmt$, fmtPct }     from "@/lib/format";

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m[2]) - 1]} ${parseInt(m[3])}, ${m[1]}`;
}

function relativeTime(ts: string | null | undefined): { label: string; title: string; stale: boolean } {
  if (!ts) return { label: "Never", title: "No data uploaded yet", stale: true };
  const dt = new Date(ts.replace(" ", "T") + "Z");
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
  return { label, title, stale: diffD > 14 };
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

interface Props {
  project:        any;
  stages:         any[];
  availableUsers: string[];
  role:           string;
  userEmail?:     string;
}

export default function ProjectDetailClient({ project: p, stages, availableUsers, role, userEmail }: Props) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [editing,  setEditing]  = useState(false);
  const [activating, setActivating] = useState(false);
  const [activities, setActivities] = useState<any[] | null>(null);

  const isAdmin   = role === "owner" || role === "admin";
  const isForeman = role === "foreman";

  useEffect(() => {
    fetch(`/api/projects/${p.id}/activity`)
      .then(r => r.json())
      .then(data => setActivities(data.activities ?? []))
      .catch(() => setActivities([]));
  }, [p.id]);

  async function handleDelete() {
    if (!(await confirm("Delete this project? This cannot be undone.", { title: "Delete project", confirmLabel: "Delete", danger: true }))) return;
    await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    router.push("/dashboard");
  }

  const inc = p.incentive;
  const matPct = p.est_materials_budget > 0 ? p.effectiveMaterials / p.est_materials_budget : 0;
  const overMat = matPct > 1;
  const overHrs = inc ? (inc.projectStatus.key === "critical" || inc.projectStatus.key === "at-risk") : false;

  const statusColors: Record<string, string> = {
    green:  "text-success bg-success-bg border border-border",
    blue:   "text-info  bg-info-bg   border border-border",
    yellow: "text-warning bg-warning-bg border border-border",
    orange: "text-warning bg-warning-bg border border-border",
    red:    "text-danger   bg-danger-bg    border border-border",
    gray:   "text-muted  bg-surface-2   border border-border",
  };

  const backHref = p.is_pipeline ? "/dashboard?view=pipeline" : "/dashboard";

  return (
    <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-6 space-y-5">
      {confirmDialog}

      {/* ── Header ── */}
      <div className="space-y-3">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-text transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to {p.is_pipeline ? "Minor Projects" : "Dashboard"}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-text tracking-tight">{p.name}</h1>
            <div className="flex items-center flex-wrap gap-2 mt-1.5 text-sm text-muted">
              <span>{p.foreman}</span>
              <span className="text-subtle">·</span>
              <span className={`px-1.5 py-px rounded font-medium text-xs ${p.stage === "Finish" ? "bg-purple-50 text-purple-600" : p.stage === "Extras" ? "bg-success-bg text-success" : "bg-info-bg text-info"}`}>
                {p.stage}
              </span>
              {p.is_pipeline ? (
                <span className="px-1.5 py-px rounded font-medium text-xs bg-surface-2 text-muted">Minor Project</span>
              ) : inc && (
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold whitespace-nowrap inline-flex items-center gap-1 ${statusColors[inc.projectStatus.color] ?? statusColors.gray}`}>
                  {inc.projectStatus.emoji} {inc.projectStatus.label}
                </span>
              )}
              {p.basecamp_link && (
                <a href={p.basecamp_link} target="_blank" rel="noopener noreferrer" title="Open in Basecamp" className="hover:opacity-70 transition-opacity">
                  <img src="/icons/basecamp.svg" alt="Basecamp" className="w-4 h-4" />
                </a>
              )}
              {p.drive_folder && (
                <a href={p.drive_folder.startsWith("http") ? p.drive_folder : `https://drive.google.com/drive/search?q=${encodeURIComponent(p.drive_folder)}`}
                  target="_blank" rel="noopener noreferrer" title="Open in Google Drive" className="hover:opacity-70 transition-opacity">
                  <img src="/icons/google-drive.svg" alt="Drive" className="w-4 h-4" />
                </a>
              )}
              {(() => {
                const rt = relativeTime(p.updated_at);
                return <span title={rt.title} className={`text-xs ${rt.stale ? "text-warning" : "text-subtle"}`}>{rt.stale ? "⚠ " : ""}{rt.label}</span>;
              })()}
            </div>
          </div>
          <div className="flex gap-2">
            {p.is_pipeline && isAdmin && (
              <button onClick={() => setActivating(true)}
                className="text-sm px-4 py-1.5 rounded-lg font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#00BAD6" }}>
                ✓ Activate
              </button>
            )}
            {isAdmin && (
              <button onClick={() => setEditing(true)}
                className="text-sm px-4 py-1.5 bg-surface border border-border hover:bg-surface-2 text-text rounded-lg font-medium transition-colors">
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Active project: KPIs + progress ── */}
      {!p.is_pipeline && (
        <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 space-y-4">
          {!isForeman && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-subtle uppercase tracking-wide">Contract</p>
                <p className="font-mono font-semibold text-text text-lg">{fmt$(p.contract_value)}</p>
              </div>
              <div>
                <p className="text-[10px] text-subtle uppercase tracking-wide">Invoiced</p>
                <p className="font-mono font-semibold text-text text-lg">{fmt$(p.total_invoiced)}</p>
                <p className="text-xs text-subtle">{fmtPct(p.contract_value > 0 ? p.total_invoiced / p.contract_value : 0)} billed</p>
              </div>
              <div>
                <p className="text-[10px] text-subtle uppercase tracking-wide">Project Complete</p>
                <p className="font-mono font-semibold text-text text-lg">{fmtPct(p.project_completion)}</p>
              </div>
              <div>
                <p className="text-[10px] text-subtle uppercase tracking-wide">Stage Complete</p>
                <p className="font-mono font-semibold text-text text-lg">{fmtPct(p.stage_completion)}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted font-medium">Project Progress</span>
                <span className="text-muted font-medium">{fmtPct(p.project_completion)}</span>
              </div>
              <ProgressBar value={p.project_completion} max={1} color="blue" />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted">Materials</span>
                <span className={`font-semibold ${overMat ? "text-danger" : "text-text"}`}>{fmtPct(matPct)} · {fmt$(p.effectiveMaterials)} of {fmt$(p.est_materials_budget)}</span>
              </div>
              <ProgressBar value={p.effectiveMaterials} max={p.est_materials_budget} color={overMat ? "red" : matPct > 0.8 ? "yellow" : "green"} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted">Hours</span>
                <span className={`font-semibold ${overHrs ? "text-danger" : "text-text"}`}>{p.effectiveHours.toLocaleString()} of {p.goal_hours.toLocaleString()} hrs</span>
              </div>
              <ProgressBar value={p.effectiveHours} max={p.goal_hours} color={overHrs ? "red" : "green"} />
            </div>
          </div>

          {/* Insight line */}
          {inc && (
            <div className="flex items-start gap-2 text-sm text-text border-t border-border pt-3">
              <span className="text-base leading-none mt-0.5">{inc.projectStatus.emoji}</span>
              <span>
                {inc.highlight}
                <span className="ml-2 text-xs text-subtle">
                  ({inc.varianceHours >= 0 ? `${Math.abs(inc.varianceHours).toFixed(0)} hrs under` : `${Math.abs(inc.varianceHours).toFixed(0)} hrs over`}
                  {" · "}{(inc.variancePct * 100).toFixed(1)}% variance)
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Per-stage bonus breakdown ── */}
      {!p.is_pipeline && inc && (
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
            const bgCls = sb.status === "beat" ? "bg-success-bg border-border" : sb.status === "meet" ? "bg-info-bg border-border" : "bg-danger-bg border-border";
            const txtCls = sb.status === "beat" ? "text-success" : sb.status === "meet" ? "text-info" : "text-danger";
            return (
              <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs border ${bgCls}`}>
                <span className={`font-bold ${txtCls}`}>{label}</span>
                <span className={`font-semibold ${txtCls}`}>{sb.label}</span>
                <span className="text-muted font-mono">
                  {sb.actual.toLocaleString()} / {sb.allowed.toLocaleString()} hrs
                  · {good ? "−" : "+"}{Math.abs(sb.variance).toFixed(0)} hrs ({(Math.abs(sb.variancePct) * 100).toFixed(1)}% {good ? "under" : "over"})
                </span>
                {!isForeman && sb.earned > 0 && <span className={`font-bold ${txtCls}`}>{fmt$(sb.earned)}</span>}
              </div>
            );
          })}
          {!isForeman && inc.totalEarned > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-green-600 text-white font-semibold">
              ✓ Confirmed earned: {fmt$(inc.totalEarned)}
            </div>
          )}
        </div>
      )}

      {/* ── Stage schedule ── */}
      {stages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stages.map((s: any, i: number) => {
            const isCurrent = s.stage === p.stage;
            const statusColor =
              s.status === "Complete"    ? { bg: "var(--success-bg)", color: "#16a34a", border: "#bbf7d0" } :
              s.status === "In Progress" ? { bg: "var(--accent-soft)", color: "#00BAD6", border: "#a5f3fc" } :
                                           { bg: "var(--surface-2)", color: "#9ca3af", border: "#e5e7eb" };
            return (
              <div key={i} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs"
                style={{
                  backgroundColor: isCurrent ? statusColor.bg : "var(--surface-2)",
                  border: `1px solid ${isCurrent ? statusColor.border : "var(--border)"}`,
                  fontWeight: isCurrent ? 600 : 400,
                }}>
                <span style={{ color: isCurrent ? statusColor.color : "#9ca3af" }}>{s.stage}</span>
                {(s.start_date || s.end_date) && (
                  <span className="font-mono text-muted">{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</span>
                )}
                <span className="text-xs px-1 py-0.5 rounded-full"
                  style={{ backgroundColor: statusColor.bg, color: statusColor.color, border: `1px solid ${statusColor.border}` }}>
                  {s.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CRM info ── */}
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
        {p.region    && <span>📍 {p.region}</span>}
        {p.builder   && <span>🏗️ <span className="font-medium text-text">{p.builder}</span></span>}
        {p.contacts  && <span>👤 {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</span>}
        {p.project_notes && <span className="italic text-subtle">{p.project_notes}</span>}
        {!p.region && !p.builder && !p.contacts && !p.project_notes && <span className="text-subtle">No CRM details yet.</span>}
      </div>

      {/* ── Profitability ── */}
      {!p.is_pipeline && !isForeman && (() => {
        const wage      = p.blended_hourly_wage ?? 37;
        const estCost   = (p.est_materials_budget ?? 0) + (p.est_total_hours ?? 0) * wage;
        const actCost   = (p.effectiveMaterials ?? 0) + (p.effectiveHours ?? 0) * wage;
        const estProfit = (p.contract_value ?? 0) - estCost;
        const estMargin = p.contract_value > 0 ? estProfit / p.contract_value : 0;
        const burnPct   = estCost > 0 ? actCost / estCost : 0;
        const overBudget = burnPct > 1;
        return (
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-3">💰 Profitability</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Est. Total Cost",  value: fmt$(estCost),   sub: `Mat + $${wage}/hr × est hrs` },
                { label: "Est. Profit",      value: fmt$(estProfit), sub: `${fmtPct(estMargin)} margin`,
                  hi: estMargin > 0.35 ? "text-success" : estMargin > 0.15 ? "text-warning" : "text-danger" },
                { label: "Actual Cost So Far", value: fmt$(actCost), sub: `${fmtPct(burnPct)} of budget`,
                  hi: overBudget ? "text-danger" : burnPct > 0.85 ? "text-warning" : "text-text" },
                { label: "Labor Cost (actual)", value: fmt$((p.effectiveHours ?? 0) * wage),
                  sub: `${(p.effectiveHours ?? 0).toLocaleString()} hrs × $${wage}` },
              ].map(c => (
                <div key={c.label} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
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
      <div className="bg-surface rounded-2xl border border-border shadow-sm p-5">
        <p className="text-xs font-semibold text-subtle uppercase tracking-wide mb-2">📋 Activity Log</p>
        {activities === null ? (
          <p className="text-xs text-subtle">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="text-xs text-subtle">No activity yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {activities.map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 font-medium text-muted min-w-[80px]">{a.user_name}</span>
                <span className="shrink-0 text-subtle px-1.5 py-0.5 rounded bg-surface-2">{a.action}</span>
                <span className="text-muted flex-1">{a.details ?? ""}</span>
                <span className="shrink-0 text-subtle tabular-nums">{new Date(a.created_at.replace(" ", "T") + "Z").toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Change Orders ── */}
      {!p.is_pipeline && !isForeman && <ChangeOrdersPanel projectId={p.id} isAdmin={isAdmin} />}

      {/* ── Comments / @mentions ── */}
      <CommentsPanel projectId={p.id} availableUsers={availableUsers} />

      {/* ── Danger zone ── */}
      {isAdmin && (
        <div className="flex justify-end border-t border-border pt-3">
          <button onClick={handleDelete}
            className="text-xs px-3 py-1.5 rounded-md text-danger hover:bg-danger-bg transition-colors">
            Delete project…
          </button>
        </div>
      )}

      {editing && (
        <ProjectEditModal
          project={p}
          stagesForProject={stages}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); router.refresh(); }}
        />
      )}

      {activating && (
        <ActivateProjectModal
          project={p}
          onClose={() => setActivating(false)}
          onActivated={() => { setActivating(false); router.refresh(); }}
        />
      )}
    </main>
  );
}
