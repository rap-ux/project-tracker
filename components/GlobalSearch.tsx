"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const fmt$ = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

interface Project {
  id: number; name: string; foreman: string; stage: string;
  is_pipeline: number; region: string | null; builder: string | null;
  contacts: string | null; phone: string | null; project_notes: string | null;
}

interface Comment  { id: number; body: string; user_name: string; project_id: number; project_name: string; created_at: string; }
interface CO       { id: number; description: string; amount: number; status: string; project_id: number; project_name: string; }

interface Results {
  projects: Project[];
  comments: Comment[];
  changeOrders: CO[];
  totalCount: number;
}

function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-yellow-200 px-0.5 rounded-sm">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export default function GlobalSearch() {
  const router = useRouter();
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<Results | null>(null);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [selected, setSelected] = useState(0);
  const panelRef  = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  // Flat list of all selectable results for keyboard nav
  const flat: Array<{ type: "project" | "comment" | "co"; id: number; label: string; href: string; detail: string }> =
    results ? [
      ...results.projects.map(p => ({
        type: "project" as const, id: p.id,
        label: p.name,
        detail: [p.foreman, p.stage, p.builder].filter(Boolean).join(" · "),
        href: p.is_pipeline ? "/clients" : "/dashboard",
      })),
      ...results.changeOrders.map(c => ({
        type: "co" as const, id: c.id,
        label: `CO: ${c.description}`,
        detail: `${c.project_name} · ${c.status} · ${fmt$(c.amount)}`,
        href: "/dashboard",
      })),
      ...results.comments.map(c => ({
        type: "comment" as const, id: c.id,
        label: c.body.length > 70 ? c.body.slice(0, 67) + "…" : c.body,
        detail: `${c.user_name} on ${c.project_name}`,
        href: "/dashboard",
      })),
    ] : [];

  // Debounced fetch
  useEffect(() => {
    if (!query.trim()) { setResults(null); setSelected(0); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(data);
        setSelected(0);
      } catch { setResults(null); }
      setLoading(false);
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  // Cmd/Ctrl+K to open
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 10);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function go(item: typeof flat[number]) {
    router.push(item.href);
    setOpen(false);
    setQuery("");
  }

  function onKeyDownInput(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(s => Math.min(s + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    else if (e.key === "Enter"   && flat[selected]) { e.preventDefault(); go(flat[selected]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Compact trigger — icon on mobile, expanded pill on larger screens */}
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 10); }}
        title="Search (⌘K)"
        className="flex items-center gap-2 px-2 md:px-3 py-1.5 rounded-md border border-white/15 hover:border-white/30 transition-colors md:w-56 xl:w-64"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", color: "rgba(235,241,245,0.55)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span className="hidden md:inline text-xs flex-1 text-left">Search…</span>
        <kbd className="hidden md:inline text-[10px] font-mono px-1.5 py-0.5 rounded border border-white/15"
          style={{ color: "rgba(235,241,245,0.6)" }}>
          ⌘K
        </kbd>
      </button>

      {/* Full search panel */}
      {open && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />
          <div className="fixed left-1/2 -translate-x-1/2 top-[60px] w-[95vw] max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDownInput}
                placeholder="Search projects, builders, contacts, comments, change orders…"
                className="flex-1 text-sm outline-none placeholder-gray-400"
              />
              {loading && <span className="text-xs text-gray-400">…</span>}
              <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-200 text-gray-400">Esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {!query.trim() && (
                <div className="px-4 py-6 text-center text-xs text-gray-400">
                  <p className="mb-1">Start typing to search…</p>
                  <p className="text-[10px]">Projects · Clients · Builders · Contacts · Phone · Notes · Comments · Change Orders</p>
                </div>
              )}

              {query.trim() && results && results.totalCount === 0 && !loading && (
                <div className="px-4 py-10 text-center text-sm text-gray-400">
                  <p className="text-2xl mb-2">🔍</p>
                  No matches for "<span className="font-semibold text-gray-600">{query}</span>"
                </div>
              )}

              {results && results.projects.length > 0 && (
                <SectionHeader label={`Projects (${results.projects.length})`} />
              )}
              {results?.projects.map((p, i) => {
                const idx    = i;
                const active = idx === selected;
                return (
                  <ResultRow
                    key={`p${p.id}`}
                    active={active}
                    icon={p.is_pipeline ? "📋" : "📊"}
                    title={highlight(p.name, query)}
                    sub={
                      <>
                        <span className="text-gray-500">{p.foreman}</span>
                        <span className="text-gray-300 mx-1.5">·</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{
                          backgroundColor:
                            p.stage === "Finish" ? "#f5f3ff" :
                            p.stage === "Rough" ? "#eff6ff" :
                            p.stage === "Underground" ? "#fff7ed" : "#f3f4f6",
                          color:
                            p.stage === "Finish" ? "#7c3aed" :
                            p.stage === "Rough" ? "#2563eb" :
                            p.stage === "Underground" ? "#ea580c" : "#6b7280",
                        }}>{p.stage}</span>
                        {p.builder && (<><span className="text-gray-300 mx-1.5">·</span><span className="text-gray-500">{highlight(p.builder, query)}</span></>)}
                        {p.region && (<><span className="text-gray-300 mx-1.5">·</span><span className="text-gray-400 text-xs">📍 {highlight(p.region, query)}</span></>)}
                      </>
                    }
                    badge={p.is_pipeline ? "Minor" : undefined}
                    onClick={() => go(flat[idx])}
                    onHover={() => setSelected(idx)}
                  />
                );
              })}

              {results && results.changeOrders.length > 0 && (
                <SectionHeader label={`Change Orders (${results.changeOrders.length})`} />
              )}
              {results?.changeOrders.map((co, i) => {
                const idx    = (results.projects.length) + i;
                const active = idx === selected;
                return (
                  <ResultRow
                    key={`co${co.id}`}
                    active={active}
                    icon="📝"
                    title={highlight(co.description, query)}
                    sub={
                      <>
                        <span className="font-medium text-gray-700">{co.project_name}</span>
                        <span className="text-gray-300 mx-1.5">·</span>
                        <span className="text-gray-500">{co.status}</span>
                        <span className="text-gray-300 mx-1.5">·</span>
                        <span className="font-mono text-gray-600">{fmt$(co.amount)}</span>
                      </>
                    }
                    onClick={() => go(flat[idx])}
                    onHover={() => setSelected(idx)}
                  />
                );
              })}

              {results && results.comments.length > 0 && (
                <SectionHeader label={`Comments (${results.comments.length})`} />
              )}
              {results?.comments.map((c, i) => {
                const idx    = (results.projects.length) + (results.changeOrders.length) + i;
                const active = idx === selected;
                return (
                  <ResultRow
                    key={`c${c.id}`}
                    active={active}
                    icon="💬"
                    title={highlight(c.body.length > 70 ? c.body.slice(0, 67) + "…" : c.body, query)}
                    sub={
                      <>
                        <span className="font-medium text-gray-700">{c.user_name}</span>
                        <span className="text-gray-300 mx-1.5">on</span>
                        <span className="text-gray-500">{c.project_name}</span>
                      </>
                    }
                    onClick={() => go(flat[idx])}
                    onHover={() => setSelected(idx)}
                  />
                );
              })}
            </div>

            <div className="px-4 py-2 border-t bg-gray-50 flex items-center gap-4 text-[10px] text-gray-400">
              <span><kbd className="px-1 py-0.5 rounded border border-gray-300 bg-white font-mono">↑↓</kbd> navigate</span>
              <span><kbd className="px-1 py-0.5 rounded border border-gray-300 bg-white font-mono">Enter</kbd> open</span>
              <span><kbd className="px-1 py-0.5 rounded border border-gray-300 bg-white font-mono">Esc</kbd> close</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 bg-gray-50 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-t border-gray-100 first:border-t-0">
      {label}
    </div>
  );
}

function ResultRow({ active, icon, title, sub, badge, onClick, onHover }: {
  active: boolean;
  icon: string;
  title: React.ReactNode;
  sub: React.ReactNode;
  badge?: string;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors"
      style={{ backgroundColor: active ? "#f0fdfe" : "transparent" }}>
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{title}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{sub}</p>
      </div>
      {badge && (
        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{badge}</span>
      )}
      {active && (
        <span className="shrink-0 text-xs" style={{ color: "#00BAD6" }}>↵</span>
      )}
    </button>
  );
}
