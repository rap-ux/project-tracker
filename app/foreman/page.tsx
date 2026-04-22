export const dynamic = 'force-dynamic';
import { redirect }    from "next/navigation";
import { auth }         from "@/auth";
import db               from "@/lib/db";
import { calcIncentive, calcForemanTotal } from "@/lib/incentive";
import Navbar              from "@/components/Navbar";
import ForemanProjectCard  from "@/components/ForemanProjectCard";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

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
  const totalInvoiced      = projects.reduce((s, p) => s + (p.total_invoiced   || 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar userName={session.user?.name ?? "Foreman"} role="foreman" />

      <main className="flex-1 max-w-screen-lg mx-auto w-full px-4 py-6 space-y-6">

        {/* ── Greeting ── */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hi, {session.user?.name} 👋</h1>
          <p className="text-gray-500 text-sm mt-1">Here's how your projects are tracking as of today.</p>
        </div>

        {/* ── Bonus Summary Card ── */}
        <div className={`rounded-2xl p-6 shadow-md text-white ${
          totals.totalBonus >= totals.maxPossibleBonus && totals.maxPossibleBonus > 0
            ? "bg-gradient-to-br from-green-600 to-emerald-700"
            : totals.totalBonus > 0
            ? "bg-gradient-to-br from-blue-600 to-blue-800"
            : "bg-gradient-to-br from-slate-700 to-slate-800"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-white/70 uppercase tracking-wide">Current Bonus Eligibility</p>
              <p className="text-4xl font-bold mt-1">{fmt$(totals.totalBonus)}</p>
              <p className="text-sm text-white/70 mt-1">of {fmt$(totals.maxPossibleBonus)} maximum possible</p>
              <p className="text-xs text-white/50 mt-1">Paid at each project's completion milestone</p>
            </div>
            <span className="text-5xl">
              {totals.totalBonus >= totals.maxPossibleBonus && totals.maxPossibleBonus > 0 ? "🏆"
                : totals.totalBonus > 0 ? "✅" : "📋"}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-5 w-full bg-white/20 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-white transition-all"
              style={{ width: totals.maxPossibleBonus > 0 ? `${(totals.totalBonus / totals.maxPossibleBonus) * 100}%` : "0%" }}
            />
          </div>

          {/* Stage counts */}
          <div className="mt-4 grid grid-cols-4 gap-3 text-center">
            <div><p className="text-xl font-bold">{totals.jobsBeat}</p><p className="text-xs text-white/70">Beat Budget</p></div>
            <div><p className="text-xl font-bold">{totals.jobsMet}</p><p className="text-xs text-white/70">Met Budget</p></div>
            <div><p className="text-xl font-bold text-red-300">{totals.jobsMissed}</p><p className="text-xs text-white/70">Over Budget</p></div>
            <div><p className="text-xl font-bold text-white/50">{totals.jobsLocked ?? 0}</p><p className="text-xs text-white/70">🔒 In Progress</p></div>
          </div>
          <p className="mt-3 text-xs text-white/40 text-center">Counts are per stage — each project has a Rough and Finish stage bonus</p>
        </div>

        {/* ── Bonus Tier Reference ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Bonus Structure by Project Value</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th className="text-left py-1.5 pr-4 font-medium">Project Value</th>
                  <th className="text-center py-1.5 px-3 font-medium bg-yellow-50">Base Bonus<br/><span className="font-normal">(Budget Met ±10%)</span></th>
                  <th className="text-center py-1.5 px-3 font-medium bg-yellow-50">Extra Bonus<br/><span className="font-normal">(Beat &gt;10%)</span></th>
                  <th className="text-center py-1.5 px-3 font-medium">Max Total</th>
                  <th className="text-left py-1.5 pl-3 font-medium text-gray-400">Paid When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {BONUS_TIERS.map(t => (
                  <tr key={t.label} className="hover:bg-gray-50">
                    <td className="py-1.5 pr-4 font-medium text-gray-700">{t.label}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-yellow-700 bg-yellow-50">{fmt$(t.meet)}</td>
                    <td className="py-1.5 px-3 text-center font-bold text-yellow-700 bg-yellow-50">{fmt$(t.beat)}</td>
                    <td className="py-1.5 px-3 text-center font-semibold text-gray-800">{fmt$(t.max)}</td>
                    <td className="py-1.5 pl-3 text-gray-400">Per stage at 100%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Projects",       value: String(projects.length)                    },
            { label: "Contract Value", value: fmt$(totalContractValue), note: "combined" },
            { label: "Invoiced",       value: fmt$(totalInvoiced),
              note: fmtPct(totalContractValue > 0 ? totalInvoiced / totalContractValue : 0) },
            { label: "Active",         value: String(projects.filter(p => p.project_completion < 1).length) },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border p-4 shadow-sm">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
              {s.note && <p className="text-xs text-gray-400">{s.note}</p>}
            </div>
          ))}
        </div>

        {/* ── Per-project cards ── */}
        <h2 className="text-lg font-bold text-gray-800">Your Projects</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enriched.map((p: any) => (
            <ForemanProjectCard key={p.id} project={p} />
          ))}
        </div>

        {projects.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-4">📋</p>
            <p>No projects assigned yet.</p>
          </div>
        )}

      </main>
    </div>
  );
}
