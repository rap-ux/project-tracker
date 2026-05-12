"use client";

import { useMemo, useState } from "react";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

const BONUS_TIERS = [
  { label: "<$50K",       meet: 150,  beat: 200,  max: 350  },
  { label: "$50K–$99K",   meet: 300,  beat: 400,  max: 700  },
  { label: "$100K–$249K", meet: 500,  beat: 750,  max: 1250 },
  { label: "$250K–$499K", meet: 750,  beat: 1000, max: 1750 },
  { label: "$500K–$1M+",  meet: 1000, beat: 1500, max: 2500 },
];

interface StageBonus {
  allowed: number; actual: number; variance: number; variancePct: number;
  eligible: boolean; status: string; earned: number; label: string;
  tier: { meet: number; beat: number; max: number };
}

interface Project {
  id: number; name: string; foreman: string; stage: string;
  stage_completion: number; project_completion: number;
  contract_value: number; effective_hours: number; goal_hours: number;
  tier: { meet: number; beat: number; max: number };
  inc: {
    rough: StageBonus; finish: StageBonus;
    totalEarned: number;
    projectStatus: { key: string; label: string; emoji: string; color: string };
    highlight: string;
  };
}

function stageStatusStyle(status: string): { bg: string; text: string; border: string; label: string } {
  switch (status) {
    case "beat":     return { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  label: "Beat" };
    case "meet":     return { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",   label: "Met"   };
    case "miss":     return { bg: "bg-red-50",    text: "text-red-600",    border: "border-red-200",    label: "Over"  };
    case "locked":   return { bg: "bg-gray-50",   text: "text-gray-500",   border: "border-gray-200",   label: "🔒 In progress" };
    case "too-early":return { bg: "bg-gray-50",   text: "text-gray-400",   border: "border-gray-100",   label: "Too early" };
    default:         return { bg: "bg-gray-50",   text: "text-gray-400",   border: "border-gray-100",   label: "—"     };
  }
}

export default function BonusesClient({ projects }: { projects: Project[] }) {
  const [foremanFilter, setForemanFilter] = useState("all");

  const foremen = useMemo(() => ["all", ...Array.from(new Set(projects.map(p => p.foreman))).sort()], [projects]);

  const filtered = useMemo(
    () => foremanFilter === "all" ? projects : projects.filter(p => p.foreman === foremanFilter),
    [projects, foremanFilter]
  );

  // Per-foreman aggregates
  const foremanAgg = useMemo(() => {
    const map: Record<string, {
      foreman: string; projects: number; earned: number; possible: number;
      beat: number; meet: number; miss: number; locked: number;
    }> = {};
    for (const p of projects) {
      if (!map[p.foreman]) map[p.foreman] = { foreman: p.foreman, projects: 0, earned: 0, possible: 0, beat: 0, meet: 0, miss: 0, locked: 0 };
      const m = map[p.foreman];
      m.projects += 1;
      m.earned   += p.inc.totalEarned;
      // Max possible = rough tier max + finish tier max
      m.possible += p.tier.max * 2;
      for (const sb of [p.inc.rough, p.inc.finish]) {
        if (sb.status === "beat")   m.beat   += 1;
        if (sb.status === "meet")   m.meet   += 1;
        if (sb.status === "miss")   m.miss   += 1;
        if (sb.status === "locked" || sb.status === "too-early") m.locked += 1;
      }
    }
    return Object.values(map).sort((a, b) => b.earned - a.earned);
  }, [projects]);

  const grandTotals = useMemo(() => {
    const earned = filtered.reduce((s, p) => s + p.inc.totalEarned, 0);
    const possible = filtered.reduce((s, p) => s + p.tier.max * 2, 0);
    return { earned, possible };
  }, [filtered]);

  return (
    <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Bonus Eligibility</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Per-foreman incentive tracking · Rough and Finish stage bonuses assessed at each stage's 100% mark
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 font-medium mr-0.5">Foreman:</span>
          {foremen.map(f => {
            const active = foremanFilter === f;
            return (
              <button key={f} onClick={() => setForemanFilter(f)}
                className="text-xs px-3 py-1 rounded-full border font-medium transition-all"
                style={active
                  ? { backgroundColor: "#00BAD6", borderColor: "#00BAD6", color: "#fff" }
                  : { backgroundColor: "#fff", borderColor: "#d1d5db", color: "#6b7280" }}>
                {f === "all" ? "All" : f}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Earned"      value={fmt$(grandTotals.earned)}   sub="confirmed" hi="#16a34a" />
        <KpiCard label="Max Possible"      value={fmt$(grandTotals.possible)} sub={`across ${filtered.length} projects`} />
        <KpiCard label="Foremen Tracked"   value={String(foremanAgg.length)}  />
        <KpiCard label="Avg Earned / Proj" value={fmt$(filtered.length > 0 ? grandTotals.earned / filtered.length : 0)} />
      </div>

      {/* Per-foreman scorecard */}
      {foremanAgg.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-gray-800 mb-3">👷 By Foreman</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {foremanAgg.map(f => {
              const pct = f.possible > 0 ? (f.earned / f.possible) * 100 : 0;
              return (
                <div key={f.foreman} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-gray-900">{f.foreman}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{f.projects} tracked project{f.projects === 1 ? "" : "s"}</p>
                    </div>
                    <span className="text-2xl">{pct >= 70 ? "🏆" : pct >= 40 ? "💪" : "📋"}</span>
                  </div>
                  <div className="mt-4">
                    <p className="text-2xl font-bold" style={{ color: "#00BAD6" }}>{fmt$(f.earned)}</p>
                    <p className="text-[11px] text-gray-500">of {fmt$(f.possible)} possible · {pct.toFixed(0)}%</p>
                  </div>
                  <div className="mt-3 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: "#00BAD6" }} />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-1 text-center">
                    <StageChip label="Beat"   count={f.beat}   color="text-green-700 bg-green-50 border-green-200" />
                    <StageChip label="Met"    count={f.meet}   color="text-blue-700  bg-blue-50  border-blue-200"  />
                    <StageChip label="Over"   count={f.miss}   color="text-red-700   bg-red-50   border-red-200"   />
                    <StageChip label="🔒 WIP" count={f.locked} color="text-gray-500  bg-gray-50  border-gray-200"  />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Project-level bonus table */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-800">Per-Project Bonus Detail</h2>
          <p className="text-[11px] text-gray-400">Rough = 70% of project · Finish = 30% · Each stage has its own allowed hours and bonus tier</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Project</th>
                <th className="px-4 py-2.5 text-left">Foreman</th>
                <th className="px-4 py-2.5 text-right">Contract</th>
                <th className="px-4 py-2.5 text-left">Per-Stage Tier</th>
                <th className="px-4 py-2.5 text-center">Rough</th>
                <th className="px-4 py-2.5 text-center">Finish</th>
                <th className="px-4 py-2.5 text-right">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                  No projects match the selected foreman.
                </td></tr>
              )}
              {filtered.map(p => {
                const roughSty  = stageStatusStyle(p.inc.rough.status);
                const finishSty = stageStatusStyle(p.inc.finish.status);
                const tierLabel = `${fmt$(p.tier.max)} per stage (rough + finish = up to ${fmt$(p.tier.max * 2)} total) · ${fmt$(p.tier.meet)} met / ${fmt$(p.tier.beat)} beat`;

                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div>{p.name}</div>
                      <div className="text-[10px] text-gray-400 font-normal">{p.stage} · {fmtPct(p.stage_completion)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{p.foreman}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">{fmt$(p.contract_value)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500" title={tierLabel}>
                      <span className="font-mono">{fmt$(p.tier.max)}/stage</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StageBadge sb={p.inc.rough} sty={roughSty} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StageBadge sb={p.inc.finish} sty={finishSty} />
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-bold ${p.inc.totalEarned > 0 ? "text-green-700" : "text-gray-400"}`}>
                      {p.inc.totalEarned > 0 ? fmt$(p.inc.totalEarned) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-300 text-xs font-semibold" style={{ backgroundColor: "#f0fdfe" }}>
                  <td className="px-4 py-3 font-bold" style={{ color: "#00BAD6" }}>Totals ({filtered.length})</td>
                  <td colSpan={5}></td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-green-700">{fmt$(grandTotals.earned)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Bonus tier reference */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-bold text-gray-800">📐 Bonus Structure by Project Value</h2>
          <p className="text-[11px] text-gray-400">
            Bonus is earned per stage (Rough and Finish separately) when the stage reaches 100% complete
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b text-xs">
                <th className="px-4 py-2 text-left font-medium">Project Value</th>
                <th className="px-4 py-2 text-center font-medium bg-yellow-50">Budget Met (±10%)</th>
                <th className="px-4 py-2 text-center font-medium bg-yellow-50">{"Beat (>10% under)"}</th>
                <th className="px-4 py-2 text-center font-medium">Max per Stage</th>
                <th className="px-4 py-2 text-center font-medium">Max per Project</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {BONUS_TIERS.map(t => (
                <tr key={t.label} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">{t.label}</td>
                  <td className="px-4 py-2 text-center font-bold text-yellow-700 bg-yellow-50">{fmt$(t.meet)}</td>
                  <td className="px-4 py-2 text-center font-bold text-yellow-700 bg-yellow-50">{fmt$(t.beat)}</td>
                  <td className="px-4 py-2 text-center font-semibold text-gray-800">{fmt$(t.max)}</td>
                  <td className="px-4 py-2 text-center font-semibold text-gray-900">{fmt$(t.max * 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  );
}

function KpiCard({ label, value, sub, hi }: { label: string; value: string; sub?: string; hi?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5" style={hi ? { color: hi } : { color: "#111827" }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function StageChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-md border px-1.5 py-1 ${color}`}>
      <p className="text-base font-bold leading-none">{count}</p>
      <p className="text-[9px] font-medium uppercase tracking-wide">{label}</p>
    </div>
  );
}

function StageBadge({ sb, sty }: { sb: StageBonus; sty: ReturnType<typeof stageStatusStyle> }) {
  if (sb.status === "no-data") {
    return <span className="text-xs text-gray-300">—</span>;
  }
  return (
    <div className={`inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 border ${sty.bg} ${sty.border}`}>
      <span className={`text-[10px] font-bold uppercase ${sty.text}`}>{sty.label}</span>
      <span className={`text-[10px] font-mono ${sty.text}`}>
        {sb.actual.toLocaleString()} / {sb.allowed.toLocaleString()} hrs
      </span>
      {sb.earned > 0 && (
        <span className="text-[10px] font-bold text-green-700">+{fmt$(sb.earned)}</span>
      )}
    </div>
  );
}
