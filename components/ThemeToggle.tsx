"use client";

import { useEffect, useState } from "react";

// All pages are migrated to the design tokens, so light/dark/auto is live.
const THEME_TOGGLE_ENABLED = true;

type Mode = "light" | "dark" | "auto";

function apply(mode: Mode) {
  const dark = mode === "dark"
    || (mode === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

// Cycles light → dark → auto. Persists choice; "auto" follows the device.
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    if (!THEME_TOGGLE_ENABLED) {
      // Demo-safe: force light everywhere until all pages are migrated.
      localStorage.setItem("theme", "light");
      document.documentElement.classList.remove("dark");
      return;
    }
    const saved = (localStorage.getItem("theme") as Mode) || "auto";
    setMode(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if ((localStorage.getItem("theme") || "auto") === "auto") apply("auto"); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  if (!THEME_TOGGLE_ENABLED) return null;

  function cycle() {
    const next: Mode = mode === "light" ? "dark" : mode === "dark" ? "auto" : "light";
    setMode(next);
    localStorage.setItem("theme", next);
    apply(next);
  }

  const label = mode === "light" ? "Light" : mode === "dark" ? "Dark" : "Auto";
  const icon = mode === "light"
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
    : mode === "dark"
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor" stroke="none"/></svg>;

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label} (click to change)`}
      aria-label={`Theme: ${label}`}
      className={compact
        ? "flex items-center justify-center w-8 h-8 rounded-lg text-white/70 hover:text-white hover:bg-surface/10 transition-colors"
        : "inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-muted hover:text-text hover:bg-surface-2 transition-colors"}>
      {icon}
      {!compact && <span>{label}</span>}
    </button>
  );
}
