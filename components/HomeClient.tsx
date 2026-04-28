"use client";

import Link from "next/link";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function dayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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

function formatDateShort(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m[2]) - 1]} ${parseInt(m[3])}`;
}

// Render a comment body with @mentions highlighted; highlight stronger if it's the current user
function renderBodyWithMentions(body: string, currentFirstName: string): React.ReactNode {
  const parts = body.split(/(@[A-Za-z0-9_.-]+)/g);
  return parts.map((part, i) => {
    if (!part.startsWith("@")) return <span key={i}>{part}</span>;
    const name  = part.slice(1);
    const isYou = !!currentFirstName && name.toLowerCase() === currentFirstName.toLowerCase();
    return (
      <span key={i} className={`font-semibold ${isYou ? "text-amber-700" : ""}`}
        style={!isYou ? { color: "#00BAD6" } : {}}>
        {part}
      </span>
    );
  });
}

interface HomeData {
  userName: string;
  totals: {
    flagged:           number;
    watch:             number;
    onTrack:           number;
    activeProjects:    number;
    totalContractValue:number;
    totalInvoiced:     number;
    upcomingCash:      number;
    avgMatBurn:        number;
    avgHoursVsGoal:    number;
    qboDays:           number | null;
  };
  flaggedList: Array<{ id: number; name: string; foreman: string; status: { key: string; label: string; emoji: string; color: string }; highlight: string; }>;
  upcomingMilestones: Array<{ name: string; milestone: string; receiveDate: string; amount: number }>;
  recentActivity: Array<{ id: number; user_name: string; action: string; details: string | null; created_at: string; project_name: string }>;
  mentions: Array<{ id: number; body: string; user_name: string; created_at: string; project_name: string }>;
  allMentions: Array<{ id: number; body: string; user_name: string; mentions: string; created_at: string; project_id: number; project_name: string; foreman: string }>;
  currentUserFirstName: string;
}

export default function HomeClient({ data }: { data: HomeData }) {
  const now       = new Date();
  const firstName = data.userName.split(" ")[0] ?? "there";
  const nothingToDo = data.totals.flagged === 0 && data.totals.watch === 0 && data.mentions.length === 0;

  return (
    <main className="flex-1 w-full px-4 py-6 max-w-screen-xl mx-auto space-y-6">

      {/* ── Greeting ── */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{greeting(now.getHours())}, {firstName} 👋</h1>
        <p className="text-sm text-gray-500 mt-1">
          Here's your {dayLabel()} at Totally Wired Electric.
        </p>
      </div>

      {/* ── What needs your attention ── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">⚡ What needs your attention</h2>
          <Link href="/dashboard" className="text-xs text-gray-500 hover:text-gray-700">View all →</Link>
        </div>

        <div className="p-5 space-y-3">
          {nothingToDo && (
            <div className="flex items-center gap-3 text-sm text-gray-600 py-4">
              <span className="text-3xl">✅</span>
              <div>
                <p className="font-semibold text-gray-800">All clear</p>
                <p className="text-xs text-gray-500">No critical projects, no @mentions. Nice work, team.</p>
              </div>
            </div>
          )}

          {/* Flagged projects */}
          {data.flaggedList.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-2">
                🚨 {data.totals.flagged} flagged {data.totals.flagged === 1 ? "project" : "projects"}
                {data.totals.watch > 0 && <span className="text-gray-400 font-medium normal-case tracking-normal ml-2">· {data.totals.watch} on watch</span>}
              </p>
              <div className="space-y-2">
                {data.flaggedList.map(p => (
                  <Link key={p.id} href="/dashboard"
                    className={`flex items-start gap-3 px-3 py-2 rounded-lg border transition-colors hover:shadow-sm ${
                      p.status.key === "critical" ? "border-red-200 bg-red-50/50 hover:bg-red-50"
                      : "border-orange-200 bg-orange-50/50 hover:bg-orange-50"
                    }`}>
                    <span className="text-lg leading-none mt-0.5">{p.status.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{p.name}</span>
                        <span className="text-xs text-gray-500">· {p.foreman}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          p.status.key === "critical" ? "bg-red-100 text-red-700"
                          : "bg-orange-100 text-orange-700"
                        }`}>{p.status.label}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{p.highlight}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* @mentions */}
          {data.mentions.length > 0 && (
            <div className={data.flaggedList.length > 0 ? "pt-3 border-t border-gray-100" : ""}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#00BAD6" }}>
                💬 {data.mentions.length} mention{data.mentions.length === 1 ? "" : "s"}
              </p>
              <div className="space-y-2">
                {data.mentions.map(m => (
                  <Link key={m.id} href="/dashboard"
                    className="flex items-start gap-3 px-3 py-2 rounded-lg border border-cyan-200 bg-cyan-50/40 hover:bg-cyan-50 transition-colors">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: "#00BAD6" }}>
                      {m.user_name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-gray-800">{m.user_name}</span>
                        <span className="text-xs text-gray-400">on {m.project_name} · {relTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{m.body}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Portfolio snapshot ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-800 mb-3">📊 Portfolio snapshot</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card
            label="Upcoming Cash (30 days)"
            value={fmt$(data.totals.upcomingCash)}
            sub="projected receipts"
            hi="#00BAD6"
            href="/forecast"
          />
          <Card
            label="Active Projects"
            value={String(data.totals.activeProjects)}
            sub={`${data.totals.onTrack} on track · ${data.totals.flagged} flagged`}
            href="/dashboard"
          />
          <Card
            label="Avg Materials Burn"
            value={fmtPct(data.totals.avgMatBurn)}
            sub="of budget used"
            hi={data.totals.avgMatBurn > 1 ? "#dc2626" : data.totals.avgMatBurn > 0.85 ? "#d97706" : "#16a34a"}
            href="/dashboard"
          />
          <Card
            label="Hours vs Goal"
            value={(data.totals.avgHoursVsGoal >= 0 ? "+" : "") + fmtPct(data.totals.avgHoursVsGoal)}
            sub={data.totals.avgHoursVsGoal > 0 ? "slightly over" : "under goal"}
            hi={data.totals.avgHoursVsGoal > 0.05 ? "#dc2626" : data.totals.avgHoursVsGoal > -0.02 ? "#d97706" : "#16a34a"}
            href="/dashboard"
          />
        </div>

        {/* QBO staleness hint */}
        {data.totals.qboDays !== null && data.totals.qboDays >= 7 && (
          <div className={`mt-3 rounded-xl border-l-4 px-4 py-2.5 text-xs flex items-center gap-2 ${
            data.totals.qboDays >= 14 ? "bg-red-50 border-red-500" : "bg-amber-50 border-amber-500"
          }`}>
            <span className="text-base">{data.totals.qboDays >= 14 ? "🚨" : "⚠️"}</span>
            <span className="text-gray-700">
              <strong>QBO data is {data.totals.qboDays} days old.</strong> Materials / hours may be out of date.
            </span>
            <Link href="/uploads" className="ml-auto text-xs px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded font-medium">
              Upload now →
            </Link>
          </div>
        )}
      </section>

      {/* ── Upcoming milestones + recent activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming cash detail */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">💰 Upcoming milestones</h2>
            <Link href="/forecast" className="text-xs text-gray-500 hover:text-gray-700">Forecast →</Link>
          </div>
          <div className="p-2">
            {data.upcomingMilestones.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No milestones landing in the next 30 days.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.upcomingMilestones.map((m, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="w-10 text-center">
                      <p className="text-[10px] text-gray-400 uppercase">{formatDateShort(m.receiveDate).split(" ")[0]}</p>
                      <p className="text-sm font-bold text-gray-800">{formatDateShort(m.receiveDate).split(" ")[1]}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                      <p className="text-[10px] text-gray-500 capitalize">{m.milestone}</p>
                    </div>
                    <span className="font-mono font-bold text-sm" style={{ color: "#00BAD6" }}>{fmt$(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Recent activity */}
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">📋 Recent activity</h2>
            <span className="text-xs text-gray-400">Team updates</span>
          </div>
          <div className="p-2">
            {data.recentActivity.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No activity yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[320px] overflow-y-auto">
                {data.recentActivity.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: "#00BAD6" }}>
                      {a.user_name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">{a.user_name}</span>
                        <span className="text-[11px] text-gray-500">{a.action.toLowerCase()}</span>
                        <span className="text-[11px] font-medium text-gray-700">{a.project_name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{relTime(a.created_at)}</span>
                      </div>
                      {a.details && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{a.details}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Recent Mentions log ── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-bold text-gray-800">💬 Recent Mentions</h2>
            <p className="text-[11px] text-gray-400">Team @mentions across all projects</p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: "#f0fdfe", color: "#00BAD6" }}>
              {data.allMentions.length} recent
            </span>
            {data.mentions.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                {data.mentions.length} for you
              </span>
            )}
          </div>
        </div>
        <div className="p-2">
          {data.allMentions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-2xl mb-2">💭</p>
              <p className="text-xs text-gray-400">No mentions yet.</p>
              <p className="text-[10px] text-gray-400 mt-1">Use <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">@name</span> in any project comment to tag a teammate.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[360px] overflow-y-auto">
              {data.allMentions.map(m => {
                const mentionedList = m.mentions.split(",").map(s => s.trim()).filter(Boolean);
                const youMentioned  = !!data.currentUserFirstName && mentionedList.some(
                  n => n.toLowerCase() === data.currentUserFirstName.toLowerCase()
                );
                const initials = m.user_name.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

                return (
                  <div key={m.id}
                    className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
                      youMentioned ? "bg-cyan-50/40 hover:bg-cyan-50/60" : "hover:bg-gray-50"
                    }`}>
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ backgroundColor: "#00BAD6" }}>
                      {initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">{m.user_name}</span>
                        <span className="text-[11px] text-gray-400">mentioned</span>
                        {mentionedList.map((name, i) => {
                          const isYou = !!data.currentUserFirstName &&
                                        name.toLowerCase() === data.currentUserFirstName.toLowerCase();
                          return (
                            <span key={i} className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                              isYou ? "bg-amber-100 text-amber-700" : "bg-cyan-50"
                            }`}
                              style={!isYou ? { color: "#00BAD6" } : {}}>
                              @{name}{isYou && " (you)"}
                            </span>
                          );
                        })}
                        <span className="text-[11px] text-gray-400">on</span>
                        <span className="text-[11px] font-medium text-gray-700">{m.project_name}</span>
                        <span className="text-[10px] text-gray-400 ml-auto">{relTime(m.created_at)}</span>
                      </div>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {renderBodyWithMentions(m.body, data.currentUserFirstName)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Quick actions ── */}
      <section>
        <h2 className="text-sm font-bold text-gray-800 mb-3">⚡ Quick actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <QuickLink href="/dashboard" label="📊 Full Dashboard"    sub="All projects"    />
          <QuickLink href="/forecast"  label="💰 Revenue Forecast"  sub="Cash projection" />
          <QuickLink href="/analytics" label="📈 Analytics"          sub="Margin trends"   />
          <QuickLink href="/report"    label="🖨 Weekly Report"      sub="Printable PDF"   />
        </div>
      </section>

    </main>
  );
}

function Card({ label, value, sub, hi, href }: { label: string; value: string; sub?: string; hi?: string; href?: string }) {
  const inner = (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 hover:shadow-md hover:border-gray-300 transition-all">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={hi ? { color: hi } : { color: "#111827" }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function QuickLink({ href, label, sub }: { href: string; label: string; sub: string }) {
  return (
    <Link href={href}
      className="bg-white rounded-xl border border-gray-200 hover:border-cyan-400 hover:bg-cyan-50/40 shadow-sm hover:shadow-md px-4 py-3 transition-all">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>
    </Link>
  );
}
