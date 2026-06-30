"use client";

import Link from "next/link";
import { fmt$, fmt$k, fmtPct } from "@/lib/format";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function relTime(ts: string): string {
  const dt = new Date(ts.replace(" ", "T") + "Z");
  const d = Math.floor((Date.now() - dt.getTime()) / 86400000);
  const h = Math.floor((Date.now() - dt.getTime()) / 3600000);
  const m = Math.floor((Date.now() - dt.getTime()) / 60000);
  if (m < 1)  return "just now";
  if (h < 1)  return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 2)  return "yesterday";
  if (d < 7)  return `${d}d ago`;
  return dt.toLocaleDateString();
}

function formatDateShort(d: string): { mo: string; day: string } {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return { mo: "", day: d };
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return { mo: months[parseInt(m[2]) - 1], day: String(parseInt(m[3])) };
}

function initialsOf(name: string) {
  return name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function renderBodyWithMentions(body: string, currentFirstName: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return <span key={i}>{part}</span>;
    const name  = part.slice(1);
    const isYou = !!currentFirstName && name.toLowerCase() === currentFirstName.toLowerCase();
    return (
      <span key={i} className={`font-medium ${isYou ? "text-warning" : "text-accent"}`}>{part}</span>
    );
  });
}

interface HomeData {
  userName: string;
  totals: {
    flagged: number; watch: number; onTrack: number; activeProjects: number;
    totalContractValue: number; totalInvoiced: number; upcomingCash: number;
    avgMatBurn: number; avgHoursVsGoal: number; qboDays: number | null;
    pendingChanges: number; pendingBatches: number; lastSync: string | null;
  };
  flaggedList: Array<{ id: number; name: string; foreman: string; status: { key: string; label: string; emoji: string; color: string }; highlight: string; }>;
  upcomingMilestones: Array<{ name: string; milestone: string; receiveDate: string; amount: number }>;
  recentActivity: Array<{ id: number; user_name: string; action: string; details: string | null; created_at: string; project_name: string }>;
  mentions: Array<{ id: number; body: string; user_name: string; created_at: string; project_name: string }>;
  allMentions: Array<{ id: number; body: string; user_name: string; mentions: string; created_at: string; project_id: number; project_name: string; foreman: string }>;
  currentUserFirstName: string;
}

export default function HomeClient({ data }: { data: HomeData }) {
  const t = data.totals;
  const firstName = data.userName.split(" ")[0] ?? "there";

  // ── Build the attention feed ────────────────────────────────────────────────
  type Tone = "danger" | "warning" | "info" | "success" | "accent";
  const items: Array<{ key: string; tone: Tone; icon: string; title: string; sub: string; href: string }> = [];

  if (t.pendingChanges > 0) {
    items.push({ key: "sync", tone: "info", icon: "refresh",
      title: `${t.pendingChanges} change${t.pendingChanges === 1 ? "" : "s"} to apply`,
      sub: `From ${t.pendingBatches} sync${t.pendingBatches === 1 ? "" : "s"} · review and apply`, href: "/uploads" });
  }
  for (const p of data.flaggedList) {
    items.push({ key: `proj-${p.id}`, tone: p.status.key === "critical" ? "danger" : "warning",
      icon: "alert", title: p.name, sub: `${p.foreman} · ${p.status.label}`, href: "/dashboard" });
  }
  if (data.mentions.length > 0) {
    items.push({ key: "mentions", tone: "accent", icon: "at",
      title: `${data.mentions.length} mention${data.mentions.length === 1 ? "" : "s"} for you`,
      sub: data.mentions[0] ? `${data.mentions[0].user_name} on ${data.mentions[0].project_name}` : "", href: "#mentions" });
  }
  if (t.qboDays !== null && t.qboDays >= 7) {
    items.push({ key: "qbo", tone: t.qboDays >= 14 ? "danger" : "warning", icon: "clock",
      title: `Data is ${t.qboDays} days old`, sub: "Materials and hours may be stale", href: "/uploads" });
  }

  const toneCls: Record<Tone, string> = {
    danger:  "bg-danger-bg text-danger",
    warning: "bg-warning-bg text-warning",
    info:    "bg-info-bg text-info",
    success: "bg-success-bg text-success",
    accent:  "bg-accent-soft text-accent",
  };

  return (
    <main className="flex-1 w-full px-4 sm:px-6 py-7 max-w-screen-xl mx-auto space-y-7 theme-fade">

      {/* ── Greeting + attention count ── */}
      <header>
        <p className="text-sm text-muted">{greeting(new Date().getHours())}, {firstName}</p>
        <h1 className="text-2xl sm:text-3xl font-medium text-text tracking-tight mt-0.5">
          {items.length === 0 ? "You're all caught up" : `${items.length} thing${items.length === 1 ? "" : "s"} need you`}
        </h1>
      </header>

      {/* ── Attention feed ── */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface px-5 py-8 flex items-center gap-4">
          <Glyph name="check" className="text-success" size={26} />
          <div>
            <p className="font-medium text-text">Nothing needs attention</p>
            <p className="text-sm text-muted mt-0.5">No flagged projects, no pending syncs, no mentions.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map(it => (
            <Link key={it.key} href={it.href}
              className="group rounded-2xl border border-border bg-surface p-4 hover:border-border-strong transition-colors">
              <div className="flex items-start gap-3">
                <span className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${toneCls[it.tone]}`}>
                  <Glyph name={it.icon} size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text truncate">{it.title}</p>
                  <p className="text-sm text-muted truncate mt-0.5">{it.sub}</p>
                </div>
                <Glyph name="chevron" size={16} className="text-subtle group-hover:text-muted transition-colors mt-1" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* ── Portfolio snapshot ── */}
      <section>
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle">Tracked portfolio</h2>
          <span className="text-xs text-subtle"
            title={t.lastSync ? new Date(t.lastSync.replace(" ", "T") + "Z").toLocaleString() : undefined}>
            {t.lastSync ? `Data as of ${relTime(t.lastSync)}` : "No sync yet"}
          </span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Upcoming cash" value={fmt$(t.upcomingCash)} sub="next 30 days" href="/forecast" accent />
          <Stat label="Contract value" value={fmt$k(t.totalContractValue)} sub={`${t.activeProjects} projects`} href="/dashboard" />
          <Stat label="Invoiced" value={fmt$k(t.totalInvoiced)}
            sub={`${fmtPct(t.totalContractValue > 0 ? t.totalInvoiced / t.totalContractValue : 0)} billed`} href="/dashboard" />
          <Stat label="Health" value={`${t.onTrack} ok`} sub={`${t.flagged} flagged · ${t.watch} watch`}
            tone={t.flagged > 0 ? "danger" : t.watch > 0 ? "warning" : "success"} href="/dashboard" />
        </div>
      </section>

      {/* ── Milestones + activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Upcoming milestones" action={<Link href="/forecast" className="text-sm text-muted hover:text-text">Forecast</Link>}>
          {data.upcomingMilestones.length === 0 ? (
            <Empty>No milestones landing in the next 30 days.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {data.upcomingMilestones.map((m, i) => {
                const d = formatDateShort(m.receiveDate);
                return (
                  <li key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-11 text-center shrink-0">
                      <p className="text-[11px] text-subtle uppercase tracking-wide">{d.mo}</p>
                      <p className="text-base font-medium text-text leading-tight">{d.day}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-text truncate">{m.name}</p>
                      <p className="text-sm text-muted capitalize truncate">{m.milestone}</p>
                    </div>
                    <span className="font-medium text-accent tabular-nums">{fmt$(m.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Recent activity" action={<span className="text-sm text-subtle">Team</span>}>
          {data.recentActivity.length === 0 ? (
            <Empty>No activity yet.</Empty>
          ) : (
            <ul className="divide-y divide-border max-h-[340px] overflow-y-auto">
              {data.recentActivity.map(a => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar name={a.user_name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="text-sm font-medium text-text">{a.user_name}</span>
                      <span className="text-sm text-muted">{a.action.toLowerCase()}</span>
                      <span className="text-sm font-medium text-text">{a.project_name}</span>
                      <span className="text-xs text-subtle ml-auto">{relTime(a.created_at)}</span>
                    </div>
                    {a.details && <p className="text-sm text-muted mt-0.5 line-clamp-1">{a.details}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── Mentions ── */}
      <section id="mentions">
        <Panel
          title="Mentions"
          action={
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent font-medium">{data.allMentions.length} recent</span>
              {data.mentions.length > 0 && <span className="px-2 py-0.5 rounded-full bg-warning-bg text-warning font-medium">{data.mentions.length} for you</span>}
            </div>
          }>
          {data.allMentions.length === 0 ? (
            <Empty>
              No mentions yet. Use <span className="font-mono bg-surface-2 px-1.5 py-0.5 rounded text-muted">@name</span> in a project comment to tag a teammate.
            </Empty>
          ) : (
            <ul className="divide-y divide-border max-h-[360px] overflow-y-auto">
              {data.allMentions.map(m => {
                const mentioned = m.mentions.split(",").map(s => s.trim()).filter(Boolean);
                const youMentioned = !!data.currentUserFirstName && mentioned.some(n => n.toLowerCase() === data.currentUserFirstName.toLowerCase());
                return (
                  <li key={m.id} className={`flex items-start gap-3 px-4 py-3 ${youMentioned ? "bg-accent-soft/40" : ""}`}>
                    <Avatar name={m.user_name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-text">{m.user_name}</span>
                        <span className="text-sm text-muted">mentioned</span>
                        {mentioned.map((name, i) => {
                          const isYou = !!data.currentUserFirstName && name.toLowerCase() === data.currentUserFirstName.toLowerCase();
                          return (
                            <span key={i} className={`text-xs font-medium px-1.5 py-0.5 rounded ${isYou ? "bg-warning-bg text-warning" : "bg-accent-soft text-accent"}`}>
                              @{name}{isYou && " (you)"}
                            </span>
                          );
                        })}
                        <span className="text-sm text-muted">on {m.project_name}</span>
                        <span className="text-xs text-subtle ml-auto">{relTime(m.created_at)}</span>
                      </div>
                      <p className="text-sm text-muted mt-1 line-clamp-2">{renderBodyWithMentions(m.body, data.currentUserFirstName)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </section>

      {/* ── Quick actions ── */}
      <section>
        <SectionLabel>Jump to</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickLink href="/dashboard" icon="grid"     label="Dashboard"  sub="All projects" />
          <QuickLink href="/forecast"  icon="trend"    label="Forecast"   sub="Cash projection" />
          <QuickLink href="/analytics" icon="chart"    label="Analytics"  sub="Margin trends" />
          <QuickLink href="/uploads"   icon="upload"   label="Sync"       sub="Review changes" />
        </div>
      </section>

    </main>
  );
}

// ── Building blocks ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">{children}</h2>;
}

function Stat({ label, value, sub, href, accent, tone }: {
  label: string; value: string; sub?: string; href?: string; accent?: boolean;
  tone?: "danger" | "warning" | "success";
}) {
  const valCls = accent ? "text-accent"
    : tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-text";
  const inner = (
    <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 h-full hover:border-border-strong transition-colors">
      <p className="text-xs text-subtle font-medium">{label}</p>
      <p className={`text-2xl font-medium mt-1 tabular-nums tracking-tight ${valCls}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h2 className="font-medium text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted text-center px-4 py-8">{children}</p>;
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium shrink-0 bg-accent-soft text-accent">
      {initialsOf(name)}
    </div>
  );
}

function QuickLink({ href, icon, label, sub }: { href: string; icon: string; label: string; sub: string }) {
  return (
    <Link href={href}
      className="rounded-2xl border border-border bg-surface hover:border-accent hover:bg-accent-soft/40 px-4 py-3.5 transition-colors">
      <Glyph name={icon} size={20} className="text-muted" />
      <p className="text-sm font-medium text-text mt-2">{label}</p>
      <p className="text-xs text-subtle mt-0.5">{sub}</p>
    </Link>
  );
}

// ── Inline icon set (outline, inherits color) ────────────────────────────────
function Glyph({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "refresh": return <svg {...p}><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>;
    case "alert":   return <svg {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>;
    case "at":      return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>;
    case "clock":   return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case "check":   return <svg {...p}><path d="M20 6 9 17l-5-5"/></svg>;
    case "chevron": return <svg {...p}><path d="m9 18 6-6-6-6"/></svg>;
    case "grid":    return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>;
    case "trend":   return <svg {...p}><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>;
    case "chart":   return <svg {...p}><line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="9"/><rect x="11" y="6" width="3" height="14"/><rect x="16" y="13" width="3" height="7"/></svg>;
    case "upload":  return <svg {...p}><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><polyline points="8 9 12 5 16 9"/><line x1="12" y1="5" x2="12" y2="16"/></svg>;
    default:        return <svg {...p}><circle cx="12" cy="12" r="9"/></svg>;
  }
}
