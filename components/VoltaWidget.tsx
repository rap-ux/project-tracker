"use client";
// Volta: floating assistant, bottom-right on every signed-in page.
// Conversation lives in sessionStorage (per tab); the server keeps an audit log.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Msg = { role: "user" | "assistant"; content: string; error?: boolean };
const PUBLIC = ["/login", "/signed-out", "/privacy", "/terms"];
const STORE = "volta:conversation";

const SUGGESTIONS = [
  "Which projects are over their hours goal?",
  "How is Pyramid doing?",
  "What's left to invoice across all jobs?",
  "What happened at Woods Drive this week?",
];

/** Very small markdown renderer: bold, inline code, links, bullets, tables. */
function render(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  const inline = (s: string) => {
    const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/\S+)/g);
    return parts.map((p, k) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={k}>{p.slice(2, -2)}</strong>;
      if (/^`[^`]+`$/.test(p)) return <code key={k} className="rounded bg-surface-3 px-1 text-[12px]">{p.slice(1, -1)}</code>;
      const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (m) return <a key={k} href={m[2]} className="text-accent underline" target={m[2].startsWith("/") ? "_self" : "_blank"} rel="noreferrer">{m[1]}</a>;
      if (/^https?:\/\/\S+$/.test(p)) return <a key={k} href={p} className="text-accent underline" target="_blank" rel="noreferrer">{p}</a>;
      return <span key={k}>{p}</span>;
    });
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows: string[][] = [];
      const head = l.split("|").slice(1, -1).map((c) => c.trim());
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim())); i++; }
      out.push(
        <div key={out.length} className="overflow-x-auto my-1.5">
          <table className="text-[12px] border-collapse">
            <thead><tr>{head.map((h, k) => <th key={k} className="text-left border-b border-border-strong px-2 py-1 font-semibold">{inline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, k) => <td key={k} className="border-b border-border px-2 py-1 align-top">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      out.push(<ul key={out.length} className="list-disc pl-4 my-1 space-y-0.5">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      out.push(<ol key={out.length} className="list-decimal pl-4 my-1 space-y-0.5">{items.map((it, k) => <li key={k}>{inline(it)}</li>)}</ol>);
      continue;
    }
    if (/^#{1,6}\s/.test(l)) { out.push(<p key={out.length} className="font-semibold mt-2">{inline(l.replace(/^#{1,6}\s/, ""))}</p>); i++; continue; }
    if (l.trim() === "") { i++; continue; }
    out.push(<p key={out.length} className="my-1">{inline(l)}</p>);
    i++;
  }
  return out;
}

export default function VoltaWidget() {
  const path = usePathname();
  const [ready, setReady] = useState<{ name: string; available: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isPublic = PUBLIC.includes(path) || path.startsWith("/drop/");

  useEffect(() => {
    if (isPublic) return;
    fetch("/api/volta/chat").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.ok) return;
      let saved: Msg[] = [];
      try { const s = sessionStorage.getItem(STORE); if (s) saved = JSON.parse(s); } catch {}
      setMsgs(saved);
      setReady({ name: j.name, available: j.available });
    }).catch(() => {});
  }, [isPublic]);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch {}
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  if (isPublic || !ready) return null;

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/volta/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const j = await res.json();
      setMsgs([...next, res.ok ? { role: "assistant", content: j.text } : { role: "assistant", content: j.error ?? "Something went wrong.", error: true }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Couldn't reach Volta. Try again.", error: true }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open Volta"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-accent text-accent-foreground pl-3 pr-4 py-2.5 shadow-lg hover:bg-accent-strong transition-colors print:hidden"
        >
          <Bolt />
          <span className="text-sm font-semibold">Volta</span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col w-[min(420px,calc(100vw-2rem))] h-[min(640px,calc(100vh-6rem))] rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden print:hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border" style={{ backgroundColor: "#101010" }}>
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ backgroundColor: "#00BAD6" }}><Bolt /></span>
              <div>
                <div className="text-sm font-semibold leading-tight">Volta</div>
                <div className="text-[11px] text-white/50 leading-tight">Switchboard assistant · read-only</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setMsgs([])} title="New conversation" className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10 text-xs">Clear</button>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1.5 rounded-md text-white/60 hover:text-white hover:bg-white/10">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm text-text">
            {!ready.available && (
              <div className="rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning">Volta is not configured on this server yet (ANTHROPIC_API_KEY).</div>
            )}
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted">Hi {ready.name.split(" ")[0]}. Ask me about any project, the numbers, the schedule, or what happened on a job.</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-text hover:border-border-strong">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, k) => (
              <div key={k} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[92%] rounded-2xl px-3 py-2 ${m.role === "user" ? "bg-accent text-accent-foreground rounded-br-sm" : m.error ? "bg-danger-bg text-danger rounded-bl-sm" : "bg-surface-2 rounded-bl-sm"}`}>
                  {m.role === "user" ? <p className="whitespace-pre-wrap">{m.content}</p> : render(m.content)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-surface-2 px-3 py-2 text-muted text-xs">Looking that up…</div></div>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); send(input); }}
            className="border-t border-border p-2 flex items-end gap-2"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              rows={1}
              placeholder="Ask Volta…"
              className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:border-accent max-h-32"
            />
            <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-accent text-accent-foreground px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-accent-strong">Send</button>
          </form>
        </div>
      )}
    </>
  );
}

function Bolt() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/></svg>
  );
}
