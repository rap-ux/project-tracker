"use client";

import { useEffect, useState } from "react";

interface Comment {
  id: number;
  user_name: string;
  body: string;
  mentions: string | null;
  created_at: string;
}

function relTime(ts: string): string {
  const dt = new Date(ts.replace(" ", "T") + "Z");
  const diffMs = Date.now() - dt.getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMs / 3600000);
  const d = Math.floor(diffMs / 86400000);
  if (m < 1) return "just now";
  if (h < 1) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 2) return "yesterday";
  if (d < 7) return `${d}d ago`;
  return dt.toLocaleDateString();
}

// Render body with @mentions highlighted
function renderBody(body: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-semibold" style={{ color: "#00BAD6" }}>{part}</span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function CommentsPanel({ projectId, availableUsers = [] }: {
  projectId: number;
  availableUsers?: string[];
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft,    setDraft]    = useState("");
  const [saving,   setSaving]   = useState(false);
  const [showMentions, setShowMentions] = useState(false);

  async function fetchComments() {
    const res = await fetch(`/api/projects/${projectId}/comments`);
    const data = await res.json();
    setComments(data.comments ?? []);
  }

  useEffect(() => { fetchComments(); }, [projectId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setDraft("");
      fetchComments();
    }
  }

  // Simple @mention autocomplete detection
  function onDraftChange(val: string) {
    setDraft(val);
    const lastAt = val.lastIndexOf("@");
    setShowMentions(lastAt >= 0 && !val.slice(lastAt).includes(" "));
  }

  function insertMention(name: string) {
    const firstName = name.split(" ")[0];
    const lastAt = draft.lastIndexOf("@");
    if (lastAt < 0) return;
    setDraft(draft.slice(0, lastAt) + `@${firstName} `);
    setShowMentions(false);
  }

  const mentionFilter = (() => {
    const lastAt = draft.lastIndexOf("@");
    if (lastAt < 0) return "";
    return draft.slice(lastAt + 1).toLowerCase();
  })();
  const filteredMentions = availableUsers.filter(u => u.toLowerCase().includes(mentionFilter));

  if (comments === null) {
    return (
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">💬 Comments</p>
        <p className="text-xs text-gray-400 mt-1">Loading…</p>
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pt-3">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
        💬 Comments {comments.length > 0 && `(${comments.length})`}
      </p>

      {comments.length > 0 && (
        <div className="space-y-2 mb-3 max-h-60 overflow-y-auto pr-1">
          {comments.map(c => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                style={{ backgroundColor: "#00BAD6" }}>
                {c.user_name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-gray-800">{c.user_name}</span>
                  <span className="text-[10px] text-gray-400">{relTime(c.created_at)}</span>
                </div>
                <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{renderBody(c.body)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative">
        <textarea
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          placeholder="Add a comment… use @name to mention someone"
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": "#00BAD6" } as React.CSSProperties}
        />

        {showMentions && filteredMentions.length > 0 && (
          <div className="absolute left-0 bottom-full mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 min-w-[160px]">
            {filteredMentions.slice(0, 5).map(u => (
              <button key={u} type="button" onMouseDown={e => e.preventDefault()}
                onClick={() => insertMention(u)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{ backgroundColor: "#00BAD6" }}>
                  {u.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                {u}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center mt-1.5">
          <span className="text-[10px] text-gray-400">
            {draft.includes("@") && "💡 Use @name to mention someone"}
          </span>
          <button type="submit" disabled={saving || !draft.trim()}
            className="text-xs px-3 py-1 rounded font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#00BAD6" }}>
            {saving ? "…" : "Post"}
          </button>
        </div>
      </form>
    </div>
  );
}
