"use client";

import { useEffect, useRef, useState } from "react";

interface PresenceUser {
  id:           number;
  name:         string;
  email:        string;
  role:         string;
  title:        string | null;
  last_seen:    string | null;
  last_page:    string | null;
  user_agent:   string | null;
  ip_address:   string | null;
  city:         string | null;
  region:       string | null;
  country:      string | null;
  country_code: string | null;
}

function locationLabel(u: PresenceUser): string {
  if (!u.city && !u.country) return "";
  if (u.city && u.country) {
    // Compact: "Los Angeles, US" rather than full country name
    const cc = u.country_code ?? u.country;
    return `${u.city}, ${cc}`;
  }
  return u.city || u.country || "";
}

function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return "🌐";
  const codePoints = cc.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

type Status = "online" | "away" | "offline";

function statusOf(lastSeenIso: string | null): Status {
  if (!lastSeenIso) return "offline";
  const dt = new Date(lastSeenIso.replace(" ", "T") + "Z");
  if (isNaN(dt.getTime())) return "offline";
  const minutes = (Date.now() - dt.getTime()) / 60_000;
  if (minutes <= 2)  return "online";
  if (minutes <= 15) return "away";
  return "offline";
}

function relTime(ts: string | null): string {
  if (!ts) return "never";
  const dt = new Date(ts.replace(" ", "T") + "Z");
  const m  = Math.floor((Date.now() - dt.getTime()) / 60_000);
  const h  = Math.floor((Date.now() - dt.getTime()) / 3_600_000);
  const d  = Math.floor((Date.now() - dt.getTime()) / 86_400_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 2)  return "yesterday";
  if (d < 7)  return `${d}d ago`;
  return dt.toLocaleDateString();
}

function deviceOf(ua: string | null): string {
  if (!ua) return "";
  const s = ua.toLowerCase();
  if (s.includes("iphone")) return "📱 iPhone";
  if (s.includes("ipad"))   return "📱 iPad";
  if (s.includes("android"))return "📱 Android";
  if (s.includes("mac"))    return "💻 Mac";
  if (s.includes("windows"))return "🖥️ Windows";
  if (s.includes("linux"))  return "🐧 Linux";
  return "";
}

const STATUS_COLOR: Record<Status, string> = {
  online:  "#22c55e",  // green
  away:    "#f59e0b",  // amber
  offline: "#9ca3af",  // gray
};

export default function PresenceIndicator() {
  const [users,   setUsers]   = useState<PresenceUser[] | null>(null);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchUsers() {
    setLoading(true);
    try {
      const res = await fetch("/api/presence");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch { setUsers([]); }
    setLoading(false);
  }

  // Initial load + poll every 30s
  useEffect(() => {
    fetchUsers();
    const t = setInterval(fetchUsers, 30_000);
    return () => clearInterval(t);
  }, []);

  // Refresh on open (so a freshly-opened panel is always current)
  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const onlineCount = users?.filter(u => statusOf(u.last_seen) === "online").length ?? 0;
  const awayCount   = users?.filter(u => statusOf(u.last_seen) === "away").length ?? 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        title={`${onlineCount} online · ${awayCount} away`}
        className="relative flex items-center justify-center p-2 rounded-md border border-white/10 hover:border-white/30 hover:bg-surface/10 transition-colors"
        style={{ color: "rgba(235,241,245,0.85)" }}
        aria-label="Who's online">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.5"/>
          <path d="M3 20c0-3 3-5 6-5s6 2 6 5"/>
          <circle cx="17.5" cy="9" r="2.5"/>
          <path d="M15 18c0-2 2-4 4-4s2 1 2 1"/>
        </svg>
        {onlineCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white"
            style={{ backgroundColor: "#22c55e" }}>
            {onlineCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute right-2 sm:right-0 top-[52px] sm:top-full sm:mt-2 left-2 sm:left-auto sm:w-[340px] max-h-[calc(100vh-80px)] sm:max-h-[540px] bg-surface rounded-xl shadow-2xl border border-border overflow-hidden z-50 flex flex-col">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-surface-2">
            <div>
              <p className="text-sm font-bold text-text">Who's online</p>
              <p className="text-[11px] text-subtle">
                {users === null ? "Loading…"
                  : users.length === 0 ? "No users yet"
                  : <>
                      <span className="text-success font-semibold">{onlineCount} online</span>
                      {awayCount > 0 && <> · <span className="text-warning font-semibold">{awayCount} away</span></>}
                    </>}
              </p>
            </div>
            <button onClick={fetchUsers} disabled={loading}
              className="text-xs px-2 py-1 rounded border border-border text-muted hover:bg-surface disabled:opacity-50">
              {loading ? "…" : "↻"}
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {users === null ? (
              <p className="text-xs text-subtle text-center py-10">Loading…</p>
            ) : users.length === 0 ? (
              <p className="text-xs text-subtle text-center py-10">No users registered.</p>
            ) : (
              <ul className="divide-y divide-border">
                {users.map(u => {
                  const status   = statusOf(u.last_seen);
                  const initials = u.name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
                  const device   = deviceOf(u.user_agent);
                  const displayRole = u.title || u.role;
                  return (
                    <li key={u.id} className="px-4 py-2.5 hover:bg-surface-2">
                      <div className="flex items-center gap-3">
                        {/* Avatar + status dot */}
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white"
                            style={{ backgroundColor: "#00BAD6" }}>
                            {initials}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white"
                            style={{ backgroundColor: STATUS_COLOR[status] }}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-text truncate">{u.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize shrink-0"
                              style={{ backgroundColor: "var(--accent-soft)", color: "#00BAD6" }}>
                              {displayRole}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted truncate">
                            {status === "online" && (
                              <>
                                <span className="text-success font-medium">● Online</span>
                                {u.last_page && <> · on <span className="font-mono">{u.last_page}</span></>}
                              </>
                            )}
                            {status === "away" && (
                              <>
                                <span className="text-warning font-medium">● Away</span> · {relTime(u.last_seen)}
                              </>
                            )}
                            {status === "offline" && (
                              <>
                                <span className="text-subtle font-medium">○ Offline</span> · last seen {relTime(u.last_seen)}
                              </>
                            )}
                          </p>
                          {(device || locationLabel(u)) && status !== "offline" && (
                            <p className="text-[10px] text-subtle flex items-center gap-1.5 flex-wrap">
                              {device && <span>{device}</span>}
                              {locationLabel(u) && (
                                <span className="flex items-center gap-1">
                                  <span>{flagEmoji(u.country_code)}</span>
                                  <span>{locationLabel(u)}</span>
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="px-4 py-2 border-t bg-surface-2 text-[10px] text-subtle text-center">
            Auto-refreshes every 30 seconds
          </div>
        </div>
      )}
    </div>
  );
}
