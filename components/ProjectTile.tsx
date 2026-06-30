"use client";

import { useRouter } from "next/navigation";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

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
  p:          any;
  isAdmin:    boolean;
  isForeman:  boolean;
  onEdit:     (p: any) => void;
  onActivate?: (p: any) => void;
}

// A calm project card — used for the desktop tile-view grid and as the mobile
// card for both Tracked and Minor Projects. The whole card links to the
// project's dedicated page; Edit/Activate are explicit buttons that stop
// propagation so they don't also trigger navigation.
export default function ProjectTile({ p, isAdmin, isForeman, onEdit, onActivate }: Props) {
  const router = useRouter();
  const goToDetail = () => router.push(`/projects/${p.id}`);

  if (p.is_pipeline) {
    return (
      <div
        onClick={goToDetail}
        role="link" tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter") goToDetail(); }}
        className="cursor-pointer bg-surface rounded-xl border border-border shadow-sm p-4 space-y-2 hover:border-border-strong hover:shadow-md transition-all">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-text">{p.name}</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-info-bg text-info shrink-0">{p.stage}</span>
        </div>
        <div className="text-xs text-muted space-y-0.5">
          <p><span className="text-subtle">Foreman:</span> {p.foreman}</p>
          {p.region  && <p><span className="text-subtle">📍</span> {p.region}</p>}
          {p.builder && <p><span className="text-subtle">🏗️</span> {p.builder}</p>}
          {p.contacts && <p><span className="text-subtle">👤</span> {p.contacts}{p.phone ? ` · ${p.phone}` : ""}</p>}
          {p.project_notes && <p className="italic text-subtle">{p.project_notes}</p>}
        </div>
        {isAdmin && (
          <div className="flex gap-1.5 pt-2 border-t border-border" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onActivate?.(p)}
              className="flex-1 text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
              style={{ backgroundColor: "#00BAD6" }}>
              ✓ Activate
            </button>
            <button onClick={() => onEdit(p)}
              className="text-xs px-3 py-1.5 bg-surface-2 hover:bg-surface-3 rounded-lg">Edit</button>
          </div>
        )}
      </div>
    );
  }

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
    <div
      onClick={goToDetail}
      role="link" tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter") goToDetail(); }}
      className={`cursor-pointer rounded-xl border shadow-sm p-4 space-y-3 hover:border-border-strong hover:shadow-md transition-all ${statusBg}`}>
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

      {(p.basecamp_link || p.drive_folder) && (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
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

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <span className="text-[10px] text-subtle">
          {relativeTime(p.updated_at).label}
        </span>
        {isAdmin && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(p); }}
            className="text-xs px-2.5 py-1 bg-info-bg border border-border text-info hover:bg-info-bg rounded transition-colors">
            ✏️ Edit
          </button>
        )}
      </div>
    </div>
  );
}
