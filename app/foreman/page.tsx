export const dynamic = 'force-dynamic';
import { redirect }    from "next/navigation";
import { auth }         from "@/auth";
import db               from "@/lib/db";
import { calcIncentive, calcForemanTotal, getBonusTier } from "@/lib/incentive";
import Navbar           from "@/components/Navbar";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

function Bar({ value, max, color = "blue" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const cls: Record<string, string> = {
    blue: "bg-blue-500", green: "bg-green-500", red: "bg-red-500",
    yellow: "bg-yellow-400", orange: "bg-orange-400", gray: "bg-gray-300",
  };
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all ${cls[color] ?? "bg-blue-500"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  critical:  "bg-red-100 text-red-800 border-red-200",
  "at-risk": "bg-orange-100 text-orange-800 border-orange-200",
  watch:     "bg-yellow-100 text-yellow-800 border-yellow-200",
  "on-track":"bg-blue-100 text-blue-800 border-blue-200",
  ahead:     "bg-green-100 text-green-800 border-green-200",
  gray:      "bg-gray-100 text-gray-600 border-gray-200",
};

const BONUS_STATUS_STYLES: Record<string, string> = {
  beat:          "text-green-700",
  meet:          "text-blue-700",
  miss:          "text-red-600",
  "in-progress": "text-gray-400",
};

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
          {enriched.map((p: any) => {
            const { inc }  = p;
            const matPct   = p.est_materials_budget > 0 ? p.actual_materials / p.est_materials_budget : 0;
            const overMat  = matPct > 1.10;
            const tier     = getBonusTier(p.contract_value);
            const statusSty = STATUS_STYLES[inc.projectStatus.key] ?? STATUS_STYLES.gray;

            return (
              <div key={p.id} className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${
                inc.projectStatus.key === "critical" ? "border-red-300" :
                inc.projectStatus.key === "at-risk"  ? "border-orange-300" :
                inc.projectStatus.key === "watch"    ? "border-yellow-300" : "border-gray-200"
              }`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{p.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{p.stage} Stage · {fmtPct(p.project_completion)} complete</p>
                  </div>
                  <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border font-semibold whitespace-nowrap ${statusSty}`}>
                    {inc.projectStatus.emoji} {inc.projectStatus.label}
                  </span>
                </div>

                {/* Highlight */}
                <div className={`text-xs rounded-lg px-3 py-2 leading-relaxed ${
                  inc.projectStatus.key === "critical" ? "bg-red-50 text-red-800" :
                  inc.projectStatus.key === "at-risk"  ? "bg-orange-50 text-orange-800" :
                  inc.projectStatus.key === "watch"    ? "bg-yellow-50 text-yellow-800" :
                  "bg-green-50 text-green-800"
                }`}>
                  {inc.highlight}
                </div>

                {/* Hours progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 font-medium">Hours vs Goal</span>
                    <span className={`font-semibold ${inc.varianceHours < 0 ? "text-red-600" : "text-green-700"}`}>
                      {p.actual_total_hours.toLocaleString()} / {p.goal_hours.toLocaleString()} hrs
                      {p.goal_hours > 0 && (
                        <span className="ml-1">
                          ({inc.varianceHours >= 0 ? "−" : "+"}{Math.abs(inc.varianceHours).toFixed(0)} hrs, {fmtPct(Math.abs(inc.variancePct))})
                        </span>
                      )}
                    </span>
                  </div>
                  <Bar
                    value={p.actual_total_hours} max={p.goal_hours}
                    color={
                      inc.projectStatus.key === "critical" ? "red" :
                      inc.projectStatus.key === "at-risk"  ? "orange" :
                      inc.projectStatus.key === "watch"    ? "yellow" :
                      inc.projectStatus.key === "ahead"    ? "green" : "blue"
                    }
                  />
                </div>

                {/* Materials progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 font-medium">Materials Used</span>
                    <span className={`font-semibold ${overMat ? "text-red-600" : "text-gray-700"}`}>
                      {fmt$(p.actual_materials)} / {fmt$(p.est_materials_budget)} ({fmtPct(matPct)})
                    </span>
                  </div>
                  <Bar value={p.actual_materials} max={p.est_materials_budget}
                    color={overMat ? "red" : matPct > 0.85 ? "yellow" : "green"} />
                </div>

                {/* Project completion */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-500 font-medium">Project Progress</span>
                    <span className="font-semibold text-gray-700">{fmtPct(p.project_completion)}</span>
                  </div>
                  <Bar value={p.project_completion} max={1} color="blue" />
                </div>

                {/* Per-stage bonus breakdown */}
                <div className="bg-gray-50 rounded-lg p-3 space-y-2.5 text-xs">
                  <p className="font-semibold text-gray-700">Stage Bonuses</p>
                  {([
                    { label: "Rough",  sb: inc.rough  },
                    { label: "Finish", sb: inc.finish },
                  ] as const).map(({ label, sb }) => {
                    if (sb.status === "no-data") return (
                      <div key={label} className="flex items-center justify-between text-gray-400">
                        <span className="font-medium">{label}</span>
                        <span>No budget set</span>
                      </div>
                    );
                    if (sb.status === "too-early") return (
                      <div key={label} className="flex items-center justify-between text-gray-400">
                        <span className="font-medium text-gray-500">{label}</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                          Mobilization phase — tracking starts after 10%
                        </span>
                      </div>
                    );
                    if (sb.status === "locked") return (
                      <div key={label} className="flex items-center justify-between">
                        <span className="font-medium text-gray-600">{label}</span>
                        <span className="flex items-center gap-1.5 text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          🔒 <span>Not yet assessable — stage must reach 100%</span>
                        </span>
                      </div>
                    );
                    const earned = sb.earned;
                    const varPct = (Math.abs(sb.variancePct) * 100).toFixed(1) + "%";
                    const varHrs = Math.abs(sb.variance).toFixed(0);
                    const isGood = sb.variance >= 0;
                    return (
                      <div key={label} className={`rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 ${
                        sb.status === "beat" ? "bg-green-50 border border-green-200" :
                        sb.status === "meet" ? "bg-blue-50  border border-blue-200"  :
                                              "bg-red-50   border border-red-200"
                      }`}>
                        <div>
                          <span className="font-semibold text-gray-800">{label} — </span>
                          <span className={
                            sb.status === "beat" ? "text-green-700 font-semibold" :
                            sb.status === "meet" ? "text-blue-700 font-semibold"  :
                                                  "text-red-700 font-semibold"
                          }>{sb.label}</span>
                          <span className="ml-2 text-gray-500">
                            {sb.actual.toLocaleString()} / {sb.allowed.toLocaleString()} hrs
                            · {isGood ? "−" : "+"}{varHrs} hrs ({varPct} {isGood ? "under" : "over"})
                          </span>
                        </div>
                        {earned > 0 && (
                          <span className="shrink-0 font-bold text-green-700 text-sm">+{fmt$(earned)}</span>
                        )}
                      </div>
                    );
                  })}
                  {/* Confirmed total */}
                  {inc.totalEarned > 0 ? (
                    <div className="flex justify-between pt-1.5 border-t border-gray-200 font-semibold">
                      <span className="text-gray-700">Confirmed earned</span>
                      <span className="text-green-700">{fmt$(inc.totalEarned)}</span>
                    </div>
                  ) : (
                    <p className="text-gray-400 pt-1 border-t border-gray-200">
                      No bonus confirmed yet — eligible stages must reach 100%.
                    </p>
                  )}
                </div>

                {/* Footer */}
                <div className="flex justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
                  <span>Invoiced: {fmt$(p.total_invoiced)}</span>
                  <span>Stage: {fmtPct(p.stage_completion)} done</span>
                </div>
              </div>
            );
          })}
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
