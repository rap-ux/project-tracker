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

  // ── Chart geometry ────────────────────────────────────────────────────────
  const W = Math.max(600, trendRows.length * 90);
  const H = 280;
  const PAD_L = 50;
  const PAD_R = 20;
  const PAD_T = 20;
  const PAD_B = 50;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allMargins = trendRows.flatMap(r => [r.m.estPct, r.m.actualPct]);
  const yMin = Math.min(-0.2, ...allMargins) - 0.05;
  const yMax = Math.max(0.8, ...allMargins) + 0.05;
  const yRange = yMax - yMin;

  const xPos = (i: number) => PAD_L + (trendRows.length > 1 ? (i / (trendRows.length - 1)) * chartW : chartW / 2);
  const yPos = (v: number) => PAD_T + chartH - ((v - yMin) / yRange) * chartH;

  // Y axis tick lines (every 10%)
  const yTicks: number[] = [];
  for (let v = Math.floor(yMin * 10) / 10; v <= yMax; v += 0.1) yTicks.push(Math.round(v * 100) / 100);

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
              <h2 className="text-sm font-semibold text-gray-800">Margin Over Time</h2>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#00BAD6" }} />Actual</span>
                <span className="flex items-center gap-1.5"><div className="w-3 h-0.5" style={{ backgroundColor: "#9ca3af", borderTop: "2px dashed #9ca3af" }} />Estimate</span>
              </div>
            </div>

            {trendRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-10 text-center">
                Not enough data yet. Projects with contract values and dates will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <svg width={W} height={H} className="min-w-full">
                  {/* Y axis grid + labels */}
                  {yTicks.map((v, i) => (
                    <g key={i}>
                      <line
                        x1={PAD_L} x2={W - PAD_R}
                        y1={yPos(v)} y2={yPos(v)}
                        stroke={v === 0 ? "#374151" : "#f3f4f6"}
                        strokeWidth={v === 0 ? 1.5 : 1} />
                      <text x={PAD_L - 8} y={yPos(v) + 3}
                        fontSize="10" fill="#6b7280" textAnchor="end">
                        {(v * 100).toFixed(0)}%
                      </text>
                    </g>
                  ))}

                  {/* Avg line */}
                  <line
                    x1={PAD_L} x2={W - PAD_R}
                    y1={yPos(avgActualMargin)} y2={yPos(avgActualMargin)}
                    stroke="#00BAD6" strokeWidth={1} strokeDasharray="2 4" opacity={0.4} />

                  {/* Actual margin line */}
                  <polyline
                    fill="none" stroke="#00BAD6" strokeWidth={2.5}
                    points={trendRows.map((r, i) => `${xPos(i)},${yPos(r.m.actualPct)}`).join(" ")} />

                  {/* Estimated margin line (dashed) */}
                  <polyline
                    fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3"
                    points={trendRows.map((r, i) => `${xPos(i)},${yPos(r.m.estPct)}`).join(" ")} />

                  {/* Points */}
                  {trendRows.map((r, i) => (
                    <g key={r.id}>
                      {/* Est marker */}
                      <circle cx={xPos(i)} cy={yPos(r.m.estPct)} r={3} fill="#9ca3af" opacity={0.6} />
                      {/* Actual marker */}
                      <circle cx={xPos(i)} cy={yPos(r.m.actualPct)} r={5}
                        fill={r.isCompleted ? "#00BAD6" : "#ffffff"}
                        stroke="#00BAD6" strokeWidth={2} />
                      <title>{r.name} — Est {fmtPct(r.m.estPct)} / Actual {fmtPct(r.m.actualPct)}</title>
                    </g>
                  ))}

                  {/* X axis labels — project names rotated */}
                  {trendRows.map((r, i) => (
                    <text key={r.id}
                      x={xPos(i)} y={H - PAD_B + 15}
                      fontSize="10" fill="#6b7280"
                      textAnchor="end"
                      transform={`rotate(-35, ${xPos(i)}, ${H - PAD_B + 15})`}>
                      {r.name.length > 14 ? r.name.slice(0, 12) + "…" : r.name}
                    </text>
                  ))}
                </svg>
              </div>
            )}
            <p className="text-[10px] text-gray-400">Hollow dots = in-progress · Solid dots = completed</p>
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
            <p className="text-xs text-gray-400">Aggregates across all active projects</p>
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
