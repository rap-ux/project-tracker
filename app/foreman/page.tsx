export const dynamic = 'force-dynamic';
import { redirect }    from "next/navigation";
import { auth }         from "@/auth";
import db               from "@/lib/db";
import { calcIncentive, calcForemanTotal } from "@/lib/incentive";
import Navbar              from "@/components/Navbar";
import ForemanProjectCard  from "@/components/ForemanProjectCard";
import { fmt$, fmtPct }    from "@/lib/format";

// Bonus tier table — shown at top for reference
const BONUS_TIERS = [
  { label: "<$50K",       meet: 150,  beat: 200,  max: 350  },
  { label: "$50K–$99K",   meet: 300,  beat: 400,  max: 700  },
  { label: "$100K–$249K", meet: 500,  beat: 750,  max: 1250 },
  { label: "$250K–$499K", meet: 750,  beat: 1000, max: 1750 },
  { label: "$500K–$1M+",  meet: 1000, beat: 1500, max: 2500 },
];

export default async function ForemanPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const foremanName = (session.user as any).foremanName as string | undefined;

  const projects = (
    foremanName
      ? db.prepare("SELECT * FROM projects WHERE foreman LIKE ? ORDER BY name").all(`%${foremanName}%`)
      : db.prepare("SELECT * FROM projects ORDER BY name").all()
  ) as any[];

  const enriched = projects.map(p => ({
    ...p,
    inc: calcIncentive(
      p.goal_hours,
      p.actual_total_hours,
      p.contract_value,
      p.stage,
      p.stage_completion,
      p.rough_hours_allowed  ?? 0,
      p.rough_hours_actual   ?? 0,
      p.finish_hours_allowed ?? 0,
      p.finish_hours_actual  ?? 0,
    ),
  }));

  const totals = calcForemanTotal(projects.map(p => ({
    goalHours:       p.goal_hours,
    actualHours:     p.actual_total_hours,
    contractValue:   p.contract_value,
    stage:           p.stage,
    stageCompletion: p.stage_completion,
    roughAllowed:    p.rough_hours_allowed  ?? 0,
    roughActual:     p.rough_hours_actual   ?? 0,
    finishAllowed:   p.finish_hours_allowed ?? 0,
    finishActual:    p.finish_hours_actual  ?? 0,
  })));

  const totalContractValue = projects.reduce((s, p) => s + (p.contract_value  || 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Navbar userName={session.user?.name ?? "Foreman"} role="foreman" userEmail={session.user?.email ?? undefined} userTitle={(session.user as any)?.title ?? undefined} />

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-6 space-y-6">

        {/* ── Greeting ── */}
        <div>
          <h1 className="text-2xl font-bold text-text">Hi, {session.user?.name} 👋</h1>
          <p className="text-muted text-sm mt-1">Here's how your projects are tracking as of today.</p>
        </div>

        {/* ── Bonus Summary Card ── */}
        <div className={`rounded-2xl p-6 shadow-md ${
          totals.totalBonus >= totals.maxPossibleBonus && totals.maxPossibleBonus > 0
            ? "bg-success text-white"
            : totals.totalBonus > 0
            ? "bg-accent text-accent-foreground"
            : "bg-surface-3 text-text"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium opacity-70 uppercase tracking-wide">Current Bonus Eligibility</p>
              <p className="text-4xl font-bold mt-1">{fmt$(totals.totalBonus)}</p>
              <p className="text-sm opacity-70 mt-1">of {fmt$(totals.maxPossibleBonus)} maximum possible</p>
              <p className="text-xs opacity-50 mt-1">Paid at each project's completion milestone</p>
            </div>
            <span className="text-5xl">
              {totals.totalBonus >= totals.maxPossibleBonus && totals.maxPossibleBonus > 0 ? "🏆"
                : totals.totalBonus > 0 ? "✅" : "📋"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-5 w-full bg-current/20 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-current opacity-90 transition-all"
              style={{ width: totals.maxPossibleBonus > 0 ? `${(totals.totalBonus / totals.maxPossibleBonus) * 100}%` : "0%" }}
            />
          </div>

          {/* Stage counts */}
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <div><p className="text-xl font-bold">{totals.jobsBeat}</p><p className="text-xs opacity-70">Beat Budget</p></div>
            <div><p className="text-xl font-bold">{totals.jobsMet}</p><p className="text-xs opacity-70">Met Budget</p></div>
            <div><p className="text-xl font-bold text-danger">{totals.jobsMissed}</p><p className="text-xs opacity-70">Over Budget</p></div>
            <div><p className="text-xl font-bold opacity-50">{totals.jobsLocked ?? 0}</p><p className="text-xs opacity-70">🔒 In Progress</p></div>
          </div>
          <p className="mt-3 text-xs opacity-40 text-center">Counts are per stage — each project has a Rough and Finish stage bonus</p>
        </div>

        {/* ── Bonus Tier Reference ── */}
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4">
          <h3 className="text-sm font-bold text-text mb-3">Bonus Structure by Project Value</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted border-b">
                  <th className="text-left py-1.5 pr-4 font-medium">Project Value</th>
                  <th className="text-center py-1.5 px-3 font-medium bg-warning-bg">Base Bonus<br/><span className="font-normal">(Budget Met ±10%)</span></th>
                  <th className="text-center py-1.5 px-3 font-medium bg-warning-bg">Extra Bonus<br/><span className="font-normal">(Beat &gt;10%)</span></th>
                  <th className="text-center py-1.5 px-3 font-medium">Max Total</th>
                  <th className="text-left py-1.5 pl-3 font-medium text-subtle">Paid When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {BONUS_TIERS.map(t => (
                  <tr key={t.label} className="hover:bg-surface-2">
                    <td className="py-1.5 pr-4 font-medium text-text">{t.label}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-warning bg-warning-bg">{fmt$(t.meet)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-warning bg-warning-bg">{fmt$(t.beat)}</td>
                    <td className="py-1.5 px-3 text-center font-semibold text-text">{fmt$(t.max)}</td>
                    <td className="py-1.5 pl-3 text-subtle">Per stage at 100%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: "Projects",       value: String(projects.length)                                         },
            { label: "Contract Value", value: fmt$(totalContractValue), note: "combined"                      },
            { label: "In Progress",    value: String(projects.filter(p => p.project_completion < 1).length)   },
          ].map(s => (
            <div key={s.label} className="bg-surface rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-muted uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
              {s.note && <p className="text-xs text-subtle">{s.note}</p>}
            </div>
          ))}
        </div>

        {/* ── Per-project cards ── */}
        <h2 className="text-lg font-bold text-text">Your Projects</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enriched.map((p: any) => (
            <ForemanProjectCard key={p.id} project={p} />
          ))}
        </div>

        {projects.length === 0 && (
          <div className="text-center py-16 text-subtle">
            <p className="text-4xl mb-4">📋</p>
            <p>No projects assigned yet.</p>
          </div>
        )}

      </main>
    </div>
  );
}
