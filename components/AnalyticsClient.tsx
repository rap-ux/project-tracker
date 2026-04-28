"use client";

import { useMemo, useState } from "react";

const fmt$   = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => ((n ?? 0) * 100).toFixed(1) + "%";

interface Project {
  id: number;
  name: string;
  foreman: string;
  stage: string;
  stage_completion: number;
  project_completion: number;
  contract_value: number;
  total_invoiced: number;
  actual_materials: number;
  unrecorded_materials: number;
  est_materials_budget: number;
  actual_total_hours: number;
  unrecorded_hours: number;
  goal_hours: number;
  est_total_hours: number;
  updated_at: string;
  builder: string | null;
  blended_hourly_wage: number;
  gross_margin: number;
}

function marginForProject(p: Project): { est: number; actual: number; estPct: number; actualPct: number } {
  const wage       = p.blended_hourly_wage ?? 37;
  const effMat     = (p.actual_materials ?? 0) + (p.unrecorded_materials ?? 0);
  const effHours   = (p.actual_total_hours ?? 0) + (p.unrecorded_hours ?? 0);
  const estCost    = (p.est_materials_budget ?? 0) + (p.est_total_hours ?? 0) * wage;
  const actualCost = effMat + effHours * wage;
  const est        = (p.contract_value ?? 0) - estCost;
  const actual     = (p.contract_value ?? 0) - actualCost;
  const estPct     = p.contract_value > 0 ? est / p.contract_value : 0;
  const actualPct  = p.contract_value > 0 ? actual / p.contract_value : 0;
  return { est, actual, estPct, actualPct };
}

export default function AnalyticsClient({ projects, finishDateByProject }: {
  projects: Project[]; finishDateByProject: Record<number, string>;
}) {
  const [view, setView] = useState<"margin" | "foreman" | "builder">("margin");
  const [marginChartView, setMarginChartView] = useState<"bar" | "pie">("bar");

  // ── Margin per project ────────────────────────────────────────────────────
  const marginRows = useMemo(() => {
    return projects.map(p => ({ ...p, m: marginForProject(p), finishDate: finishDateByProject[p.id] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, finishDateByProject]);

  // Sort by date for trend — use finish date if completed, else updated_at
  const trendRows = useMemo(() => {
    return marginRows
      .map(r => ({
        ...r,
        sortDate: r.finishDate ?? (r.updated_at ?? "").slice(0, 10),
        isCompleted: !!r.finishDate || (r.project_completion ?? 0) >= 1,
      }))
      .filter(r => r.sortDate && r.contract_value > 0)
      .sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  }, [marginRows]);

  const avgActualMargin = trendRows.length > 0
    ? trendRows.reduce((s, r) => s + r.m.actualPct, 0) / trendRows.length
    : 0;
  const avgEstMargin = trendRows.length > 0
    ? trendRows.reduce((s, r) => s + r.m.estPct, 0) / trendRows.length
    : 0;

  // ── Foreman aggregates ────────────────────────────────────────────────────
  const foremanAgg = useMemo(() => {
    const map: Record<string, { projects: number; contract: number; margin$: number; marginPct: number[]; hoursVarPct: number[] }> = {};
    for (const r of marginRows) {
      if (!map[r.foreman]) map[r.foreman] = { projects: 0, contract: 0, margin$: 0, marginPct: [], hoursVarPct: [] };
      map[r.foreman].projects += 1;
      map[r.foreman].contract += r.contract_value ?? 0;
      map[r.foreman].margin$  += r.m.actual;
      if (r.contract_value > 0) map[r.foreman].marginPct.push(r.m.actualPct);
      if (r.goal_hours > 0) {
        const effHrs = (r.actual_total_hours ?? 0) + (r.unrecorded_hours ?? 0);
        map[r.foreman].hoursVarPct.push((effHrs - r.goal_hours) / r.goal_hours);
      }
    }
    return Object.entries(map).map(([foreman, agg]) => ({
      foreman,
      projects:   agg.projects,
      contract:   agg.contract,
      margin$:    agg.margin$,
      marginPct:  agg.marginPct.length   > 0 ? agg.marginPct.reduce((s, v) => s + v, 0)   / agg.marginPct.length   : 0,
      hoursVarPct:agg.hoursVarPct.length > 0 ? agg.hoursVarPct.reduce((s, v) => s + v, 0) / agg.hoursVarPct.length : 0,
    })).sort((a, b) => b.margin$ - a.margin$);
  }, [marginRows]);

  // ── Builder aggregates ────────────────────────────────────────────────────
  const builderAgg = useMemo(() => {
    const map: Record<string, { projects: number; contract: number; margin$: number; marginPct: number[] }> = {};
    for (const r of marginRows) {
      const b = r.builder || "Unknown";
      if (!map[b]) map[b] = { projects: 0, contract: 0, margin$: 0, marginPct: [] };
      map[b].projects += 1;
      map[b].contract += r.contract_value ?? 0;
      map[b].margin$  += r.m.actual;
      if (r.contract_value > 0) map[b].marginPct.push(r.m.actualPct);
    }
    return Object.entries(map).map(([builder, agg]) => ({
      builder,
      projects:  agg.projects,
      contract:  agg.contract,
      margin$:   agg.margin$,
      marginPct: agg.marginPct.length > 0 ? agg.marginPct.reduce((s, v) => s + v, 0) / agg.marginPct.length : 0,
    })).sort((a, b) => b.contract - a.contract);
  }, [marginRows]);

  return (
    <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Margin trends, per-foreman performance, and per-builder profitability
          </p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([
            { v: "margin",  label: "📊 Margin Trend" },
            { v: "foreman", label: "👷 Foreman"       },
            { v: "builder", label: "🏗️ Builder"      },
          ] as const).map(o => (
            <button key={o.v} onClick={() => setView(o.v)}
              className="px-3 py-1.5 font-medium transition-colors"
              style={view === o.v
                ? { backgroundColor: "#101010", color: "#fff" }
                : { backgroundColor: "#fff", color: "#6b7280" }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Margin Trend ── */}
      {view === "margin" && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Kpi label="Avg Est. Margin"    value={fmtPct(avgEstMargin)} />
            <Kpi label="Avg Actual Margin"  value={fmtPct(avgActualMargin)}
              hi={avgActualMargin >= avgEstMargin ? "#16a34a" : "#dc2626"} />
            <Kpi label="Spread"             value={fmtPct(avgActualMargin - avgEstMargin)}
              sub={avgActualMargin >= avgEstMargin ? "Beating estimates" : "Under estimates"} />
            <Kpi label="Projects Analyzed"  value={String(trendRows.length)} />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-800">
                {marginChartView === "bar" && "Margin by Project"}
                {marginChartView === "pie" && "Portfolio Cost Structure"}
              </h2>
              <div className="flex items-center gap-3">
                {/* Legend changes per view */}
                <div className="flex items-center gap-4 text-xs">
                  {marginChartView === "bar" && <>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500"   />Loss</span>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" />Thin</span>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500" />Healthy</span>
                    <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-600" />Great+</span>
                  </>}
                </div>
                {/* View switcher */}
                <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-xs bg-gray-50">
                  {([
                    { key: "bar", label: "Bar", icon: "📊" },
                    { key: "pie", label: "Pie", icon: "🥧" },
                  ] as const).map(v => (
                    <button key={v.key} onClick={() => setMarginChartView(v.key)}
                      className={`px-2.5 py-1 font-medium transition-colors ${
                        marginChartView === v.key
                          ? "text-white"
                          : "text-gray-600 hover:bg-white hover:text-gray-900"
                      }`}
                      style={marginChartView === v.key ? { backgroundColor: "#00BAD6" } : {}}>
                      <span className="mr-1">{v.icon}</span>{v.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {trendRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-10 text-center">
                Not enough data yet. Projects with contract values and dates will appear here.
              </p>
            ) : (
              <>
              {/* ═══ BAR view ═══ */}
              {marginChartView === "bar" && (() => {
                const bars = [...trendRows].sort((a, b) => b.m.actualPct - a.m.actualPct);
                const BW     = 44;
                const BGAP   = 14;
                const BPL    = 52;
                const BPR    = 20;
                const BPT    = 24;
                const BPB    = 80;
                const innerW = bars.length * (BW + BGAP);
                const sw     = Math.max(innerW + BPL + BPR, 600);
                const sh     = 320;
                const plotH  = sh - BPT - BPB;
                const maxPct = Math.max(...bars.map(b => b.m.actualPct), 0.3);
                const minPct = Math.min(...bars.map(b => b.m.actualPct), 0);
                const range  = Math.max(maxPct - minPct, 0.01);
                const zeroY  = BPT + plotH * (maxPct / range);
                const yFor   = (v: number) => BPT + plotH * ((maxPct - v) / range);
                const colorFor = (p: number) =>
                  p < 0    ? "#ef4444" :
                  p < 0.15 ? "#f59e0b" :
                  p < 0.30 ? "#10b981" :
                             "#059669";
                const ticks: number[] = [];
                for (let v = Math.floor(minPct * 10) / 10; v <= maxPct + 0.05; v += 0.1) ticks.push(Math.round(v * 100) / 100);
                return (
                  <div className="overflow-x-auto">
                    <svg width={sw} height={sh} className="min-w-full">
                      {/* gridlines + y labels */}
                      {ticks.map((v, i) => (
                        <g key={i}>
                          <line x1={BPL} x2={sw - BPR}
                            y1={yFor(v)} y2={yFor(v)}
                            stroke={v === 0 ? "#374151" : "#f3f4f6"}
                            strokeWidth={v === 0 ? 1.5 : 1} strokeDasharray={v === 0 ? "0" : "3 4"} />
                          <text x={BPL - 8} y={yFor(v) + 3}
                            fontSize="10" fill="#6b7280" textAnchor="end">
                            {(v * 100).toFixed(0)}%
                          </text>
                        </g>
                      ))}
                      {/* Avg line */}
                      <line x1={BPL} x2={sw - BPR}
                        y1={yFor(avgActualMargin)} y2={yFor(avgActualMargin)}
                        stroke="#00BAD6" strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
                      <text x={sw - BPR - 2} y={yFor(avgActualMargin) - 3}
                        fontSize="9" fill="#00BAD6" textAnchor="end" fontWeight="600">
                        avg {fmtPct(avgActualMargin)}
                      </text>
                      {/* Bars */}
                      {bars.map((r, i) => {
                        const cx     = BPL + i * (BW + BGAP) + BW / 2;
                        const actual = r.m.actualPct;
                        const estY   = yFor(r.m.estPct);
                        const topY   = yFor(Math.max(actual, 0));
                        const botY   = yFor(Math.min(actual, 0));
                        const barH   = Math.max(botY - topY, 1);
                        return (
                          <g key={r.id}>
                            <rect x={cx - BW / 2} y={topY}
                              width={BW} height={barH}
                              rx="3"
                              fill={colorFor(actual)}
                              opacity={r.isCompleted ? 1 : 0.55}
                              stroke={r.isCompleted ? "transparent" : colorFor(actual)}
                              strokeWidth={r.isCompleted ? 0 : 1.5}
                              strokeDasharray={r.isCompleted ? "0" : "3 2"} />
                            {/* Estimate marker */}
                            <line
                              x1={cx - BW / 2 - 2} x2={cx + BW / 2 + 2}
                              y1={estY} y2={estY}
                              stroke="#374151" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
                            {/* Value label */}
                            <text x={cx} y={actual >= 0 ? topY - 4 : botY + 12}
                              fontSize="10" fontWeight="600"
                              fill={colorFor(actual)} textAnchor="middle">
                              {fmtPct(actual)}
                            </text>
                            {/* Project label (rotated) */}
                            <text x={cx} y={sh - BPB + 14}
                              fontSize="10" fill="#6b7280" textAnchor="end"
                              transform={`rotate(-35, ${cx}, ${sh - BPB + 14})`}>
                              {r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name}
                            </text>
                            <title>{r.name} — Actual {fmtPct(actual)} · Est {fmtPct(r.m.estPct)}</title>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                );
              })()}

              {/* ═══ PIE view — Portfolio Cost Structure ═══ */}
              {marginChartView === "pie" && (() => {
                // Roll up every project's cost structure across the portfolio.
                let totalMat = 0, totalLabor = 0, totalContract = 0;
                for (const r of trendRows) {
                  const wage     = r.blended_hourly_wage ?? 37;
                  const effMat   = (r.actual_materials    ?? 0) + (r.unrecorded_materials ?? 0);
                  const effHours = (r.actual_total_hours  ?? 0) + (r.unrecorded_hours     ?? 0);
                  totalMat      += effMat;
                  totalLabor    += effHours * wage;
                  totalContract += (r.contract_value ?? 0);
                }
                const totalMargin = totalContract - totalMat - totalLabor;
                const inOverrun   = totalMargin < 0;

                // When margin is positive, all 3 slices add up to the contract total.
                // When margin is negative, show Materials + Labor only and flag the overrun separately.
                const slices0 = inOverrun
                  ? [
                      { key: "mat",   label: "Materials", color: "#f59e0b", value: totalMat   },
                      { key: "labor", label: "Labor",     color: "#6366f1", value: totalLabor },
                    ]
                  : [
                      { key: "mat",    label: "Materials", color: "#f59e0b", value: totalMat    },
                      { key: "labor",  label: "Labor",     color: "#6366f1", value: totalLabor  },
                      { key: "margin", label: "Margin",    color: "#10b981", value: totalMargin },
                    ];
                const sum = slices0.reduce((s, x) => s + x.value, 0);

                const cx = 150, cy = 150, R = 110, inner = 66;
                let ang = -Math.PI / 2;
                const slices = slices0.map(s => {
                  const frac = sum > 0 ? s.value / sum : 0;
                  const a0 = ang, a1 = ang + frac * Math.PI * 2;
                  ang = a1;
                  const large = a1 - a0 > Math.PI ? 1 : 0;
                  const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
                  const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
                  const xi0 = cx + inner * Math.cos(a0), yi0 = cy + inner * Math.sin(a0);
                  const xi1 = cx + inner * Math.cos(a1), yi1 = cy + inner * Math.sin(a1);
                  const d = frac > 0 ? (frac >= 1
                    ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} Z`
                    : `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${inner} ${inner} 0 ${large} 0 ${xi0} ${yi0} Z`
                  ) : "";
                  const midA = (a0 + a1) / 2;
                  const labelR = (R + inner) / 2;
                  return {
                    ...s, frac, d,
                    labelX: cx + labelR * Math.cos(midA),
                    labelY: cy + labelR * Math.sin(midA),
                  };
                });
                const centerLabel = inOverrun ? "IN OVERRUN" : "MARGIN";
                const centerValue = inOverrun ? fmt$(totalMargin) : fmt$(totalMargin);
                return (
                  <div className="flex flex-col md:flex-row items-center gap-6 py-2">
                    <svg width="300" height="300" className="shrink-0">
                      {slices.map(s => s.frac > 0 && (
                        <g key={s.key}>
                          <path d={s.d} fill={s.color} stroke="white" strokeWidth="2"
                            className="hover:brightness-110 transition" />
                          {s.frac > 0.06 && (
                            <text x={s.labelX} y={s.labelY} textAnchor="middle"
                              fontSize="11" fontWeight="700" fill="white">
                              {(s.frac * 100).toFixed(0)}%
                            </text>
                          )}
                          <title>{s.label} — {fmt$(s.value)} ({(s.frac * 100).toFixed(1)}%)</title>
                        </g>
                      ))}
                      <text x={cx} y={cy - 8} textAnchor="middle"
                        fontSize="20" fontWeight="800"
                        fill={inOverrun ? "#dc2626" : "#10b981"}>
                        {centerValue}
                      </text>
                      <text x={cx} y={cy + 10} textAnchor="middle"
                        fontSize="9" fill="#6b7280" letterSpacing="1.5" fontWeight="600">
                        {centerLabel}
                      </text>
                      <text x={cx} y={cy + 26} textAnchor="middle"
                        fontSize="10" fill="#9ca3af">
                        of {fmt$(totalContract)}
                      </text>
                    </svg>
                    <div className="flex-1 w-full space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-2">
                        Where every contract dollar goes
                      </div>
                      {slices0.map(s => {
                        const pct = sum > 0 ? (s.value / sum * 100) : 0;
                        return (
                          <div key={s.key} className="border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.color }} />
                                <span className="text-sm font-semibold text-gray-700">{s.label}</span>
                              </div>
                              <span className="text-sm font-bold tabular-nums text-gray-900">
                                {fmt$(s.value)}
                                <span className="text-gray-400 font-medium ml-2 text-xs">
                                  {pct.toFixed(1)}%
                                </span>
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: s.color }} />
                            </div>
                          </div>
                        );
                      })}
                      {!inOverrun && totalMargin > 0 && (
                        <div className="text-[11px] text-gray-500 pt-1">
                          Across <strong className="text-gray-700">{trendRows.length}</strong> project{trendRows.length === 1 ? "" : "s"}, we keep <strong className="text-green-600">{((totalMargin / totalContract) * 100).toFixed(1)}%</strong> as margin on <strong className="text-gray-700">{fmt$(totalContract)}</strong> of contracts.
                        </div>
                      )}
                      {inOverrun && (
                        <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded p-2 mt-2">
                          ⚠ Portfolio-wide costs exceed contracts by <strong>{fmt$(Math.abs(totalMargin))}</strong>. Review high-burn projects on the table below.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
              </>
            )}
            <p className="text-[10px] text-gray-400">
              {marginChartView === "bar"  && "Bar color = margin band · Dashed line across each bar = estimate · Faded/outlined bars = in-progress"}
              {marginChartView === "pie"  && "Portfolio-wide: every dollar of contract value broken into Materials, Labor, and retained Margin"}
            </p>
          </div>

          {/* Project-by-project margin table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b">
              <h2 className="text-sm font-semibold text-gray-800">Per-Project Margins</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white text-xs uppercase tracking-wide bg-slate-800">
                    <th className="px-4 py-2 text-left">Project</th>
                    <th className="px-4 py-2 text-left">Foreman</th>
                    <th className="px-4 py-2 text-right">Contract</th>
                    <th className="px-4 py-2 text-right">Est Margin $</th>
                    <th className="px-4 py-2 text-right">Est %</th>
                    <th className="px-4 py-2 text-right">Actual Margin $</th>
                    <th className="px-4 py-2 text-right">Actual %</th>
                    <th className="px-4 py-2 text-right">Δ (vs est)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {marginRows.map(r => {
                    const delta = r.m.actualPct - r.m.estPct;
                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-2 text-gray-600 text-xs">{r.foreman}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt$(r.contract_value)}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{fmt$(r.m.est)}</td>
                        <td className="px-4 py-2 text-right text-xs text-gray-500">{fmtPct(r.m.estPct)}</td>
                        <td className={`px-4 py-2 text-right font-mono font-semibold ${r.m.actual >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fmt$(r.m.actual)}
                        </td>
                        <td className={`px-4 py-2 text-right text-xs font-semibold ${r.m.actualPct >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fmtPct(r.m.actualPct)}
                        </td>
                        <td className={`px-4 py-2 text-right text-xs font-medium ${delta >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {delta >= 0 ? "+" : ""}{fmtPct(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Foreman aggregates ── */}
      {view === "foreman" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b">
            <h2 className="text-sm font-semibold text-gray-800">Per-Foreman Performance</h2>
            <p className="text-xs text-gray-400">Aggregates across all tracked projects</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white text-xs uppercase tracking-wide bg-slate-800">
                  <th className="px-4 py-2 text-left">Foreman</th>
                  <th className="px-4 py-2 text-center">Projects</th>
                  <th className="px-4 py-2 text-right">Total Contract</th>
                  <th className="px-4 py-2 text-right">Total Margin $</th>
                  <th className="px-4 py-2 text-right">Avg Margin %</th>
                  <th className="px-4 py-2 text-right">Avg Hours Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {foremanAgg.map(f => (
                  <tr key={f.foreman} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-800">{f.foreman}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{f.projects}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt$(f.contract)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${f.margin$ >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt$(f.margin$)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold ${f.marginPct >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtPct(f.marginPct)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold ${f.hoursVarPct <= 0 ? "text-green-700" : "text-red-600"}`}>
                      {f.hoursVarPct > 0 ? "+" : ""}{fmtPct(f.hoursVarPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Builder aggregates ── */}
      {view === "builder" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b">
            <h2 className="text-sm font-semibold text-gray-800">Per-Builder Profitability</h2>
            <p className="text-xs text-gray-400">Sorted by total contract value</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white text-xs uppercase tracking-wide bg-slate-800">
                  <th className="px-4 py-2 text-left">Builder / GC</th>
                  <th className="px-4 py-2 text-center">Projects</th>
                  <th className="px-4 py-2 text-right">Total Contract</th>
                  <th className="px-4 py-2 text-right">Total Margin $</th>
                  <th className="px-4 py-2 text-right">Avg Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {builderAgg.map(b => (
                  <tr key={b.builder} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-semibold text-gray-800">{b.builder}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{b.projects}</td>
                    <td className="px-4 py-2 text-right font-mono text-gray-700">{fmt$(b.contract)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-semibold ${b.margin$ >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt$(b.margin$)}</td>
                    <td className={`px-4 py-2 text-right text-xs font-semibold ${b.marginPct >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtPct(b.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </main>
  );
}

function Kpi({ label, value, sub, hi }: { label: string; value: string; sub?: string; hi?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold mt-0.5" style={hi ? { color: hi } : { color: "#111827" }}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
