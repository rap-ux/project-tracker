"use client";

import { useEffect, useRef, useState } from "react";

interface Activity {
  id: number;
  user_name: string;
  action: string;
  details: string | null;
  created_at: string;
  project_id: number;
  project_name: string;
  foreman: string;
}

function relTime(ts: string): string {
  const dt = new Date(ts.replace(" ", "T") + "Z");
  const diffMs = Date.now() - dt.getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  const d = Math.floor(diffMs / 86400000);
  if (m < 1)  return "just now";
  if (h < 1)  return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 2)  return "yesterday";
  if (d < 7)  return `${d}d ago`;
  return dt.toLocaleDateString();
}

function actionPill(action: string) {
  const map: Record<string, { bg: string; color: string }> = {
    "Quick Update": { bg: "#f0fdfe", color: "#00BAD6" },
    "Edited":       { bg: "#eff6ff", color: "#2563eb" },
    "Created":      { bg: "#f0fdf4", color: "#16a34a" },
  };
  const s = map[action] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{ backgroundColor: s.bg, color: s.color }}>
      {action}
    </span>
  );
}

export default function GlobalActivityButton() {
  const [open,       setOpen]       = useState(false);
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [loading,    setLoading]    = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchActivities() {
    setLoading(true);
    try {
      const res = await fetch("/api/activity");
      const data = await res.json();
      setActivities(data.activities ?? []);
    } catch { setActivities([]); }
    setLoading(false);
  }

  // Fetch on first open
  useEffect(() => {
    if (open && activities === null) fetchActivities();
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Activity log"
        className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors border border-white/10 hover:border-white/25 text-xs"
        style={{ color: "rgba(235,241,245,0.85)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2h12l4 8-10 12L2 10z" />
          <path d="M2 10h20" />
          <path d="M12 2v8" />
        </svg>
        Activity
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[420px] max-h-[540px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
            <div>
              <p className="text-sm font-bold text-gray-800">Activity Log</p>
              <p className="text-xs text-gray-400">Latest changes across all projects</p>
            </div>
            <button
              onClick={fetchActivities}
              disabled={loading}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">
              {loading ? "…" : "↻ Refresh"}
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {activities === null || loading ? (
              <p className="text-xs text-gray-400 py-10 text-center">Loading…</p>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400 py-10 text-center">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {activities.map(a => (
                  <li key={a.id} className="px-4 py-2.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-semibold text-gray-800 truncate">{a.project_name}</span>
                        {actionPill(a.action)}
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0 tabular-nums" title={a.created_at}>
                        {relTime(a.created_at)}
                      </span>
                    </div>
                    {a.details && (
                      <p className="text-xs text-gray-600 mt-0.5 break-words">{a.details}</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      by <span className="font-medium">{a.user_name}</span>
                      {a.foreman && <span className="ml-1">· {a.foreman}</span>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t bg-gray-50 text-[10px] text-gray-400 text-center">
            Showing up to 100 recent entries
          </div>
        </div>
      )}
    </div>
  );
}
