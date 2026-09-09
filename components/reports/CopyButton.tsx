"use client";
import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      // Older iOS Safari: fall back to a selectable textarea
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:bg-accent-strong transition-colors"
    >
      {done ? "Copied" : label}
    </button>
  );
}
