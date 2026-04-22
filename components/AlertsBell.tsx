"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Alert {
  key:       string;
  severity:  "critical" | "warning" | "info";
  title:     string;
  detail:    string;
  projectId?: number;
  href?:     string;
}

export default function AlertsBell() {
  const [open,    setOpen]    = useState(false);
  const [alerts,  setAlerts]  = useState<Alert[] | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchAlerts() {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      const data = await res.json();
      setAlerts(data.alerts ?? []);
    } catch { setAlerts([]); }
    setLoading(false);
  }

  useEffect(() => { fetchAlerts(); }, []);
  useEffect(() => {
    // Refresh every 60s
    const t = setInterval(fetchAlerts, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (open && alerts === null) fetchAlerts();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function dismiss(alertKey: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await fetch("/api/alerts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_key: alertKey }),
    });
    setAlerts(prev => prev?.filter(a => a.key !== alertKey) ?? null);
  }

  const count        = alerts?.length ?? 0;
  const criticalCount = alerts?.filter(a => a.severity === "critical").length ?? 0;
  const hasAlerts    = count > 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        title={count > 0 ? `${count} alert${count === 1 ? "" : "s"}` : "No alerts"}
        className="relative flex items-center px-2 sm:px-3 py-1.5 rounded-md transition-colors border border-white/10 hover:border-white/25"
        style={{ color: "rgba(235,241,245,0.85)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        {hasAlerts && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: criticalCount > 0 ? "#dc2626" : "#f59e0b" }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute right-2 sm:right-0 top-[52px] sm:top-full sm:mt-2 left-2 sm:left-auto sm:w-[420px] max-h-[calc(100vh-80px)] sm:max-h-[540px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
            <div>
              <p className="text-sm font-bold text-gray-800">Alerts</p>
              <p className="text-xs text-gray-400">
                {count === 0 ? "Nothing needs attention ✅" :
                 criticalCount > 0 ? `${criticalCount} critical · ${count - criticalCount} warnings` :
                 `${count} item${count === 1 ? "" : "s"}`}
              </p>
            </div>
            <button onClick={fetchAlerts} disabled={loading}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-white disabled:opacity-50">
              {loading ? "…" : "↻"}
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {alerts === null || loading ? (
              <p className="text-xs text-gray-400 py-10 text-center">Loading…</p>
            ) : alerts.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-medium text-gray-600">All clear</p>
                <p className="text-xs text-gray-400 mt-1">No active alerts</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {alerts.map(a => {
                  const bg =
                    a.severity === "critical" ? "border-l-4 border-red-500 bg-red-50/40" :
                    a.severity === "warning"  ? "border-l-4 border-amber-500 bg-amber-50/40" :
                                                "border-l-4 border-blue-500 bg-blue-50/40";
                  const icon =
                    a.severity === "critical" ? "🚨" :
                    a.severity === "warning"  ? "⚠️" : "ℹ️";
                  const inner = (
                    <div className={`px-4 py-3 hover:bg-gray-50 transition-colors ${bg}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-none mt-0.5">{icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800">{a.title}</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">{a.detail}</p>
                        </div>
                        <button onClick={e => dismiss(a.key, e)}
                          title="Dismiss"
                          className="shrink-0 text-gray-300 hover:text-gray-600 text-base leading-none">×</button>
                      </div>
                    </div>
                  );
                  return (
                    <li key={a.key}>
                      {a.href ? (
                        <Link href={a.href} onClick={() => setOpen(false)}>{inner}</Link>
                      ) : inner}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
