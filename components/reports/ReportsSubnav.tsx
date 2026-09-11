"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/reports/uploads", label: "Uploads" },
  { href: "/reports/journal", label: "Journal" },
  { href: "/reports/ask", label: "Ask" },
];

export default function ReportsSubnav() {
  const path = usePathname();
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-text">Operations Log</h1>
        <p className="text-xs text-muted">End-of-day call transcripts and daily reports, one per job per day. Beta.</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/reports/new" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:bg-accent-strong">
          + Paste transcript
        </Link>
      <nav className="flex gap-1 rounded-lg bg-surface border border-border p-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(t.href + "/")
            || (t.href === "/reports/uploads" && /^\/reports\/(inbox|new|\d+)/.test(path))
            || (t.href === "/reports/journal" && /^\/reports\/(today|jobs)/.test(path));
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                active ? "bg-accent text-accent-foreground" : "text-muted hover:text-text hover:bg-surface-2"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      </div>
    </div>
  );
}
