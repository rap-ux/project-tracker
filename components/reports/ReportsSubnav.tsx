"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/reports/inbox", label: "Inbox" },
  { href: "/reports/new", label: "New report" },
  { href: "/reports/today", label: "Today" },
  { href: "/reports/jobs", label: "Jobs" },
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
      <nav className="flex gap-1 rounded-lg bg-surface border border-border p-1 overflow-x-auto">
        {TABS.map((t) => {
          const active = path === t.href || (t.href !== "/reports/inbox" && path.startsWith(t.href + "/"));
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
  );
}
