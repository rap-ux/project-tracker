"use client";

import { useState, useMemo } from "react";
import { toCSV, downloadCSV } from "@/lib/csv";

// ── Constants ──────────────────────────────────────────────────────────────────
const MILESTONES = [
  { key: "underground_start", label: "Underground Start", pct: 0.10, shortLabel: "UG Start"    },
  { key: "rough_start",       label: "Rough Start",       pct: 0.25, shortLabel: "Rough Start"  },
  { key: "rough_completion",  label: "Rough Completion",  pct: 0.25, shortLabel: "Rough Done"   },
  { key: "finish_start",      label: "Finish Start",      pct: 0.30, shortLabel: "Finish Start" },
  { key: "finish_completion", label: "Completion",        pct: 0.10, shortLabel: "Completion"   },
] as const;

const RECEIPT_DELAY_DAYS = 30;
const TODAY = new Date();

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d;
}
function toYYYYMM(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(yyyymm: string) {
  const [y, m] = yyyymm.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}
function isPast(date: Date): boolean {
  return date.getTime() <= TODAY.getTime();
}

interface Payment {
  projectId:   number;
  projectName: string;
  foreman:     string;
  milestone:   string;
  receiveDate: Date;
  amount:      number;
  monthKey:    string;
  past:        boolean;
}

function computePayments(row: any): Payment[] {
  const cv = row.contract_value ?? 0;
  if (!cv) return [];
  return MILESTONES
    .map(m => {
      const dateStr = row[m.key];
      if (!dateStr) return null;
      const receiveDate = addDays(dateStr, RECEIPT_DELAY_DAYS);
      return {
        projectId:   row.id,
        projectName: row.name,
        foreman:     row.foreman,
        milestone:   m.shortLabel,
        receiveDate,
        amount:      cv * m.pct,
        monthKey:    toYYYYMM(receiveDate),
        past:        isPast(receiveDate),
      } satisfies Payment;
    })
    .filter(Boolean) as Payment[];
}

// How many of 5 milestone dates actually have a value
function datesFilled(row: any): number {
  return MILESTONES.filter(m => row[m.key]).length;
}

// How many of those came from Timeline (inherited) vs were manually overridden
function timelineInheritCount(row: any): number {
  if (!row.sources) return 0;
  return Object.values(row.sources).filter(v => v === "timeline").length;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { rows: any[]; role: string; }

export default function ForecastClient({ rows, role }: Props) {
  const [data,    setData]    = useState<any[]>(rows);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft,   setDraft]   = useState<any>(null);
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState("");
  const isAdmin = role === "owner" || role === "admin";

  // ── Filters ────────────────────────────────────────────────────────────────
  const [includeMinor, setIncludeMinor] = useState(false);
  const allForemen = useMemo(
    () => Array.from(new Set(data.filter(r => !r.is_pipeline).map(r => r.foreman))).sort(),
    [data]
  );
  const [hiddenForemen, setHiddenForemen] = useState<Set<string>>(new Set());
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function toggleForeman(name: string) {
    setHiddenForemen(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  // Split into active and minor — these are computed separately
  const activeData = useMemo(
    () => data.filter(r => !r.is_pipeline && !hiddenForemen.has(r.foreman)),
    [data, hiddenForemen]
  );
  const minorData = useMemo(
    () => data.filter(r => r.is_pipeline),
    [data]
  );

  // ── Cash-flow matrix (active projects only) ────────────────────────────────
  const { monthKeys, byMonth, totalByMonth, pastTotal, futureTotal } = useMemo(() => {
    const allPayments: Payment[] = activeData.flatMap(computePayments);
    const months = new Set<string>();
    allPayments.forEach(p => months.add(p.monthKey));
    const monthKeys = Array.from(months).sort();

    const byMonth: Record<string, Payment[]> = {};
    monthKeys.forEach(mk => { byMonth[mk] = allPayments.filter(p => p.monthKey === mk); });
    const totalByMonth: Record<string, number> = {};
    monthKeys.forEach(mk => { totalByMonth[mk] = byMonth[mk].reduce((s, p) => s + p.amount, 0); });

    const pastTotal   = allPayments.filter(p => p.past).reduce((s, p) => s + p.amount, 0);
    const futureTotal = allPayments.filter(p => !p.past).reduce((s, p) => s + p.amount, 0);

    return { monthKeys, byMonth, totalByMonth, pastTotal, futureTotal };
  }, [activeData]);

  const maxMonth = Math.max(...Object.values(totalByMonth), 1);

  // Actually received (from QBO)
  const actualInvoiced = activeData.reduce((s, r) => s + (r.total_invoiced ?? 0), 0);
  const reconcileDiff  = actualInvoiced - pastTotal;

  // Remaining unbilled (contract − invoiced) across active
  const activeRemainingTotal = activeData.reduce((s, r) => s + (r.remaining_value ?? 0), 0);
  const activeContractTotal  = activeData.reduce((s, r) => s + (r.contract_value  ?? 0), 0);

  // Minor summary (no milestone math — just contract / invoiced / remaining)
  const minorContractTotal  = minorData.reduce((s, r) => s + (r.contract_value  ?? 0), 0);
  const minorInvoicedTotal  = minorData.reduce((s, r) => s + (r.total_invoiced   ?? 0), 0);
  const minorRemainingTotal = minorContractTotal - minorInvoicedTotal;

  // ── Editing helpers ────────────────────────────────────────────────────────
  function startEdit(row: any) {
    setEditing(row.id);
    setDraft({ ...row });
  }
  function changeField(field: string, val: string) {
    setDraft((d: any) => ({ ...d, [field]: val }));
  }
  async function save() {
    setSaving(true);
    setMsg("");
    const res  = await fetch("/api/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, project_id: draft.id }),
    });
    const json = await res.json();
    setSaving(false);
    if (json.ok) {
      setData(d => d.map(r => r.id === draft.id ? { ...r, ...draft } : r));
      setEditing(null);
      setMsg("✅ Saved");
      setTimeout(() => setMsg(""), 2500);
    } else {
      setMsg("❌ Failed to save");
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Revenue Forecasting</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Dates from Timeline · 10 / 25 / 25 / 30 / 10% split · {RECEIPT_DELAY_DAYS}-day receipt delay
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 font-medium mr-0.5">Foreman:</span>
            {allForemen.map(f => {
              const active = !hiddenForemen.has(f);
              return (
                <button key={f} onClick={() => toggleForeman(f)}
                  className="text-xs px-3 py-1 rounded-full border font-medium transition-all"
                  style={active
                    ? { backgroundColor: "#00BAD6", borderColor: "#00BAD6", color: "#fff" }
                    : { backgroundColor: "#fff", borderColor: "#d1d5db", color: "#9ca3af" }}>
                  {f}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setIncludeMinor(v => !v)}
            className="text-xs px-3 py-1 rounded-full border font-medium transition-all"
            style={includeMinor
              ? { backgroundColor: "#101010", borderColor: "#101010", color: "#fff" }
              : { backgroundColor: "#fff", borderColor: "#d1d5db", color: "#9ca3af" }}>
            {includeMinor ? "Minor Projects: Shown" : "Minor Projects: Hidden"}
          </button>

          <button
            onClick={() => {
              // Export monthly cash flow + milestone table
              const monthRows = monthKeys.map(mk => ({
                month: monthLabel(mk),
                total: totalByMonth[mk],
                past: mk < toYYYYMM(TODAY) ? "Past" : "Upcoming",
                breakdown: byMonth[mk].map(p => `${p.projectName} (${p.milestone}: ${fmt$(p.amount)})`).join(" | "),
              }));
              const csv = toCSV(monthRows, [
                { key: "month", label: "Month" },
                { key: "total", label: "Total $" },
                { key: "past",  label: "When"   },
                { key: "breakdown", label: "Breakdown" },
              ]);
              downloadCSV(`forecast-cashflow-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
            className="text-xs px-3 py-1 rounded-full border border-gray-300 bg-white font-medium text-gray-700 hover:bg-gray-50">
            ⬇ CSV
          </button>

          {msg && <p className="text-sm text-gray-700 bg-white border rounded-lg px-4 py-2 shadow-sm">{msg}</p>}
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {[
          { label: "Active Contract Value",    value: fmt$(activeContractTotal) },
          { label: "Already Received",          value: fmt$(pastTotal),     sub: "milestones passed", hi: "#16a34a" },
          { label: "Upcoming Cash",             value: fmt$(futureTotal),   sub: "future milestones", hi: "#00BAD6" },
          { label: "Active Remaining Unbilled", value: fmt$(activeRemainingTotal), sub: "contract − invoiced" },
          { label: "Active Projects",           value: String(activeData.length) },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide">{card.label}</p>
            <p className="text-xl font-bold mt-0.5" style={card.hi ? { color: card.hi } : { color: "#111827" }}>
              {card.value}
            </p>
            {card.sub && <p className="text-[10px] text-gray-400 mt-0.5">{card.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Reconciliation banner ── */}
      {pastTotal > 0 && (
        <div className={`rounded-xl p-3 text-xs flex items-center gap-3 ${
          Math.abs(reconcileDiff) < 5000 ? "bg-green-50 border border-green-200"
          : reconcileDiff > 0            ? "bg-blue-50 border border-blue-200"
                                         : "bg-yellow-50 border border-yellow-200"
        }`}>
          <span className="text-base">
            {Math.abs(reconcileDiff) < 5000 ? "✅" : reconcileDiff > 0 ? "ℹ️" : "⚠️"}
          </span>
          <span className="text-gray-700">
            <strong>Reconciliation:</strong>{" "}
            {Math.abs(reconcileDiff) < 5000
              ? <>Past milestones forecast ({fmt$(pastTotal)}) closely matches actual invoiced ({fmt$(actualInvoiced)}) — projections are on track.</>
              : reconcileDiff > 0
                ? <>Actual invoiced ({fmt$(actualInvoiced)}) is {fmt$(Math.abs(reconcileDiff))} <strong>ahead</strong> of past-milestone forecast ({fmt$(pastTotal)}). You may be billing faster than the milestone model predicts.</>
                : <>Actual invoiced ({fmt$(actualInvoiced)}) is {fmt$(Math.abs(reconcileDiff))} <strong>behind</strong> past-milestone forecast ({fmt$(pastTotal)}). Check for missed invoicing or milestone dates that shifted.</>
            }
          </span>
        </div>
      )}

      {/* ── Monthly Cash-Flow Summary ── */}
      {monthKeys.length > 0 ? (() => {
        // Compute running cumulative totals
        const cumByMonth: Record<string, number> = {};
        let running = 0;
        monthKeys.forEach(mk => { running += totalByMonth[mk]; cumByMonth[mk] = running; });
        const maxCum = Math.max(...Object.values(cumByMonth), 1);
        const totalForecast = running;

        // Chart geometry
        const W_PER_MONTH = 70;
        const CHART_H     = 220;
        const PAD_T       = 20;
        const PAD_B       = 48;
        const PAD_X       = 24;
        const innerW      = Math.max(monthKeys.length - 1, 1) * W_PER_MONTH;
        const svgW        = innerW + PAD_X * 2;
        const plotH       = CHART_H - PAD_T - PAD_B;

        const xFor    = (i: number) => PAD_X + i * W_PER_MONTH;
        const yMonthly = (v: number) => PAD_T + plotH * (1 - (maxMonth > 0 ? v / maxMonth : 0));
        const yCum     = (v: number) => PAD_T + plotH * (1 - (maxCum   > 0 ? v / maxCum   : 0));

        const monthlyPts = monthKeys.map((mk, i) => ({ x: xFor(i), y: yMonthly(totalByMonth[mk]) }));
        const cumPts     = monthKeys.map((mk, i) => ({ x: xFor(i), y: yCum(cumByMonth[mk]) }));

        // Smooth cubic bezier through points
        const smooth = (pts: { x: number; y: number }[]) => {
          if (pts.length === 0) return "";
          if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
          let d = `M ${pts[0].x},${pts[0].y}`;
          for (let i = 1; i < pts.length; i++) {
            const prev = pts[i - 1], cur = pts[i];
            const cx = (prev.x + cur.x) / 2;
            d += ` C ${cx},${prev.y} ${cx},${cur.y} ${cur.x},${cur.y}`;
          }
          return d;
        };

        const areaPath = smooth(monthlyPts) +
          ` L ${monthlyPts[monthlyPts.length - 1].x},${CHART_H - PAD_B}` +
          ` L ${monthlyPts[0].x},${CHART_H - PAD_B} Z`;
        const monthlyLine = smooth(monthlyPts);
        const cumLine     = smooth(cumPts);

        const todayKey = toYYYYMM(TODAY);
        const nowIdx   = monthKeys.findIndex(mk => mk === todayKey);

        const hovered = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < monthKeys.length
          ? { mk: monthKeys[hoverIdx], idx: hoverIdx } : null;

        return (
        <div className="bg-white rounded-2xl border border-gray-200/70 shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 tracking-tight">Projected Cash Flow</h2>
              <p className="text-xs text-gray-500 mt-1">Monthly inflow (area) with running total banked (line)</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-2 rounded-sm" style={{ background: "linear-gradient(180deg, rgba(0,186,214,0.55), rgba(0,186,214,0.08))" }} />
                Monthly
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-[2px] rounded-full bg-amber-500" />Running total
              </div>
            </div>
          </div>

          {/* Summary ribbon */}
          <div className="flex flex-wrap gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Total forecast</div>
              <div className="text-lg font-bold text-gray-900 tabular-nums">{fmt$(totalForecast)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Peak month</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: "#00BAD6" }}>{fmt$(maxMonth)}</div>
            </div>
            {nowIdx >= 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Banked thru this month</div>
                <div className="text-lg font-bold text-amber-600 tabular-nums">{fmt$(cumByMonth[todayKey] ?? 0)}</div>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="relative overflow-x-auto
                          [&::-webkit-scrollbar]:h-3
                          [&::-webkit-scrollbar-track]:bg-gray-100
                          [&::-webkit-scrollbar-track]:rounded-full
                          [&::-webkit-scrollbar-thumb]:bg-gray-400
                          [&::-webkit-scrollbar-thumb]:rounded-full
                          [&::-webkit-scrollbar-thumb]:border-2
                          [&::-webkit-scrollbar-thumb]:border-gray-100
                          hover:[&::-webkit-scrollbar-thumb]:bg-gray-500">
            <svg width={svgW} height={CHART_H} className="block">
              <defs>
                <linearGradient id="cf-area" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%"   stopColor="#00BAD6" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#00BAD6" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* horizontal gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
                <line key={i}
                  x1={PAD_X} x2={svgW - PAD_X}
                  y1={PAD_T + plotH * f} y2={PAD_T + plotH * f}
                  stroke="#f3f4f6" strokeDasharray={i === 4 ? "0" : "3 4"} />
              ))}

              {/* "NOW" vertical marker */}
              {nowIdx >= 0 && (
                <g>
                  <line
                    x1={xFor(nowIdx)} x2={xFor(nowIdx)}
                    y1={PAD_T}        y2={CHART_H - PAD_B}
                    stroke="#f59e0b" strokeDasharray="3 3" strokeWidth="1.5" opacity="0.7" />
                  <rect x={xFor(nowIdx) - 18} y={PAD_T - 12} width="36" height="16" rx="8" fill="#fef3c7" />
                  <text x={xFor(nowIdx)} y={PAD_T - 1} textAnchor="middle"
                    className="fill-amber-700" fontSize="9" fontWeight="700" letterSpacing="1">NOW</text>
                </g>
              )}

              {/* Monthly area */}
              <path d={areaPath} fill="url(#cf-area)" />
              <path d={monthlyLine} fill="none" stroke="#00BAD6" strokeWidth="2" />

              {/* Cumulative line */}
              <path d={cumLine} fill="none" stroke="#f59e0b" strokeWidth="2.5"
                strokeLinecap="round" strokeDasharray="0" />

              {/* Dots + hover targets */}
              {monthKeys.map((mk, i) => {
                const isPast = mk < todayKey;
                const isNow  = mk === todayKey;
                const px = xFor(i);
                return (
                  <g key={mk}
                    onMouseEnter={() => setHoverIdx(i)}
                    onMouseLeave={() => setHoverIdx(null)}
                    style={{ cursor: "default" }}>
                    {/* Invisible hit area */}
                    <rect x={px - W_PER_MONTH / 2} y={PAD_T}
                      width={W_PER_MONTH} height={plotH}
                      fill="transparent" />
                    {/* Monthly dot */}
                    <circle cx={px} cy={monthlyPts[i].y} r={hoverIdx === i ? 5 : 3}
                      fill={isPast ? "#9ca3af" : isNow ? "#f59e0b" : "#00BAD6"}
                      stroke="white" strokeWidth="1.5" />
                    {/* Cumulative dot */}
                    <circle cx={px} cy={cumPts[i].y} r={hoverIdx === i ? 4.5 : 2.5}
                      fill="#f59e0b" stroke="white" strokeWidth="1.5" />
                    {/* Month label */}
                    <text x={px} y={CHART_H - PAD_B + 14} textAnchor="middle"
                      fontSize="10" className={isNow ? "fill-amber-700 font-semibold" : "fill-gray-500"}>
                      {monthLabel(mk)}
                    </text>
                    {/* Cumulative value (subtle, below month) */}
                    <text x={px} y={CHART_H - PAD_B + 28} textAnchor="middle"
                      fontSize="9" className="fill-gray-400 tabular-nums">
                      {fmt$(cumByMonth[mk])}
                    </text>
                  </g>
                );
              })}

              {/* Hover vertical guide */}
              {hovered && (
                <line
                  x1={xFor(hovered.idx)} x2={xFor(hovered.idx)}
                  y1={PAD_T} y2={CHART_H - PAD_B}
                  stroke="#9ca3af" strokeDasharray="2 3" strokeWidth="1" opacity="0.5" />
              )}
            </svg>

            {/* Floating tooltip */}
            {hovered && (() => {
              const leftPx = xFor(hovered.idx);
              const placeRight = leftPx > svgW / 2;
              return (
                <div className="pointer-events-none absolute bg-gray-900 text-white rounded-lg shadow-xl px-3 py-2 text-[11px] space-y-0.5"
                  style={{
                    top: PAD_T + 4,
                    left: placeRight ? undefined : leftPx + 12,
                    right: placeRight ? svgW - leftPx + 12 : undefined,
                    minWidth: "150px",
                  }}>
                  <div className="font-semibold text-white/90 mb-1">{monthLabel(hovered.mk)}</div>
                  <div className="flex justify-between gap-3">
                    <span className="text-cyan-300">Monthly</span>
                    <span className="font-semibold tabular-nums">{fmt$(totalByMonth[hovered.mk])}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-amber-300">Running total</span>
                    <span className="font-semibold tabular-nums">{fmt$(cumByMonth[hovered.mk])}</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Month detail table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-1 font-medium">Month</th>
                  <th className="pb-1 font-medium text-right">Total</th>
                  <th className="pb-1 font-medium text-center">When</th>
                  <th className="pb-1 pl-4 font-medium">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthKeys.map(mk => {
                  const isMonthPast = mk < toYYYYMM(TODAY);
                  return (
                    <tr key={mk} className="hover:bg-gray-50">
                      <td className="py-1.5 font-medium text-gray-700">{monthLabel(mk)}</td>
                      <td className="py-1.5 text-right font-mono font-semibold text-gray-800">{fmt$(totalByMonth[mk])}</td>
                      <td className="py-1.5 text-center">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          isMonthPast ? "bg-gray-100 text-gray-500" : "bg-cyan-50 text-cyan-700"
                        }`}>
                          {isMonthPast ? "Past" : "Upcoming"}
                        </span>
                      </td>
                      <td className="py-1.5 pl-4 text-gray-500">
                        {byMonth[mk].map((p, i) => (
                          <span key={i} className="mr-3">
                            <span className="font-medium">{p.projectName}</span>
                            <span className="text-gray-400"> ({p.milestone} · {fmt$(p.amount)})</span>
                          </span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        );
      })() : (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
          📅 No milestone dates available. Add stage start/end dates on the <strong>Timeline</strong> page — they'll flow here automatically.
        </div>
      )}

      {/* ── Active Milestone Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Active Projects — Milestone Dates</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Dates marked <span className="font-semibold text-cyan-600">T</span> are inherited from Timeline ·{" "}
              <span className="font-semibold text-amber-600">M</span> means manually overridden here
            </p>
          </div>
          <p className="text-xs text-gray-400">Cash received = milestone date + {RECEIPT_DELAY_DAYS} days</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left sticky left-0 bg-slate-800 z-10">Project</th>
                <th className="px-4 py-3 text-left">Foreman</th>
                <th className="px-4 py-3 text-center">Dates Set</th>
                <th className="px-4 py-3 text-right">Contract</th>
                <th className="px-4 py-3 text-right">Invoiced</th>
                {MILESTONES.map(m => (
                  <th key={m.key} className="px-3 py-3 text-center whitespace-nowrap">
                    <div>{m.shortLabel}</div>
                    <div className="text-white/50 normal-case font-normal tracking-normal">({(m.pct * 100).toFixed(0)}%)</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Remaining</th>
                {isAdmin && <th className="px-4 py-3 text-center">Override</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeData.length === 0 && (
                <tr><td colSpan={isAdmin ? 11 : 10} className="px-4 py-10 text-center text-gray-400 text-sm">No active projects match filters.</td></tr>
              )}
              {activeData.map((row: any) => {
                const isEditing = editing === row.id;
                const d = isEditing ? draft : row;
                const filled = datesFilled(row);
                const inherited = timelineInheritCount(row);
                const invoicedPct = row.contract_value > 0 ? (row.total_invoiced ?? 0) / row.contract_value : 0;

                return (
                  <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${isEditing ? "bg-blue-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-inherit">
                      <div>{row.name}</div>
                      {row.stage && <div className="text-[10px] text-gray-400 font-normal">{row.stage} · {((row.stage_completion ?? 0) * 100).toFixed(0)}%</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.foreman}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-xs font-bold text-gray-700">{filled}/5</span>
                        {inherited > 0 && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-cyan-50 text-cyan-700 font-semibold"
                            title={`${inherited} dates inherited from Timeline`}>
                            T{inherited}
                          </span>
                        )}
                        {filled - inherited > 0 && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold"
                            title={`${filled - inherited} dates manually overridden`}>
                            M{filled - inherited}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt$(row.contract_value)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      <div className="font-mono text-xs">{fmt$(row.total_invoiced ?? 0)}</div>
                      <div className="text-[10px] text-gray-400">{(invoicedPct * 100).toFixed(0)}% billed</div>
                    </td>

                    {MILESTONES.map(m => {
                      const dateVal  = d[m.key] ?? "";
                      const payAmt   = (row.contract_value ?? 0) * m.pct;
                      const source   = row.sources?.[m.key];
                      const isDatePast = dateVal ? isPast(addDays(dateVal, RECEIPT_DELAY_DAYS)) : false;
                      return (
                        <td key={m.key} className="px-3 py-3 text-center">
                          {isEditing ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="date"
                                value={dateVal}
                                onChange={e => changeField(m.key, e.target.value)}
                                className="text-xs px-1.5 py-1 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              {source === "timeline" && (
                                <span className="text-[9px] text-cyan-600">← Timeline</span>
                              )}
                            </div>
                          ) : dateVal ? (
                            <div className="flex flex-col items-center">
                              <div className="flex items-center gap-1">
                                <span className={`text-xs ${isDatePast ? "text-gray-500" : "text-gray-800 font-medium"}`}>{dateVal}</span>
                                {source === "timeline" && (
                                  <span className="text-[9px] px-1 rounded bg-cyan-50 text-cyan-700 font-bold" title="Inherited from Timeline">T</span>
                                )}
                                {source === "override" && (
                                  <span className="text-[9px] px-1 rounded bg-amber-50 text-amber-700 font-bold" title="Manually overridden">M</span>
                                )}
                              </div>
                              <span className={`text-[10px] font-mono ${isDatePast ? "text-green-600" : "text-gray-400"}`}>
                                {fmt$(payAmt)}{isDatePast ? " ✓" : ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}

                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input
                          type="number" step="any"
                          value={d.remaining_value ?? ""}
                          onChange={e => changeField("remaining_value", e.target.value)}
                          className="w-24 text-xs px-1.5 py-1 border border-blue-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="text-xs font-mono text-gray-700">{fmt$(d.remaining_value)}</span>
                      )}
                    </td>

                    {isAdmin && (
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex gap-1 justify-center">
                            <button onClick={save} disabled={saving}
                              className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors">
                              {saving ? "…" : "Save"}
                            </button>
                            <button onClick={() => setEditing(null)}
                              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(row)}
                            title="Override a milestone date or remaining value"
                            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                            Override
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* Totals footer */}
            {activeData.length > 0 && (
              <tfoot>
                <tr className="text-xs font-semibold border-t-2 border-gray-300" style={{ backgroundColor: "#f0fdfe" }}>
                  <td className="px-4 py-3 sticky left-0 font-bold" style={{ backgroundColor: "#f0fdfe", color: "#00BAD6" }}>
                    Totals ({activeData.length})
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt$(activeContractTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt$(actualInvoiced)}</td>
                  {MILESTONES.map(m => {
                    const milestoneTotal = activeData.reduce((s, r) => {
                      return s + (r[m.key] ? (r.contract_value ?? 0) * m.pct : 0);
                    }, 0);
                    return (
                      <td key={m.key} className="px-3 py-3 text-center font-mono text-gray-900">
                        {milestoneTotal > 0 ? fmt$(milestoneTotal) : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right font-mono text-gray-900">{fmt$(activeRemainingTotal)}</td>
                  {isAdmin && <td className="px-4 py-3" />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Minor Projects (separate section — no milestone math) ── */}
      {includeMinor && minorData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-800">Minor Projects — Remaining to Bill</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Milestone split doesn't apply to small jobs. Showing contract vs. invoiced only.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-white text-xs uppercase tracking-wide">
                  <th className="px-4 py-2.5 text-left">Project</th>
                  <th className="px-4 py-2.5 text-left">Foreman</th>
                  <th className="px-4 py-2.5 text-left">Stage</th>
                  <th className="px-4 py-2.5 text-right">Contract</th>
                  <th className="px-4 py-2.5 text-right">Invoiced</th>
                  <th className="px-4 py-2.5 text-right">Remaining</th>
                  <th className="px-4 py-2.5 text-left">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {minorData.map(p => {
                  const remaining = (p.contract_value ?? 0) - (p.total_invoiced ?? 0);
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.foreman}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{p.stage}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt$(p.contract_value)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-600">{fmt$(p.total_invoiced)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{fmt$(remaining)}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400 italic max-w-[240px] truncate" title={p.payment_notes ?? ""}>
                        {p.payment_notes || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="text-xs font-semibold border-t-2 border-gray-300 bg-gray-50">
                  <td className="px-4 py-2.5">Minor Totals ({minorData.length})</td>
                  <td colSpan={2}></td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-900">{fmt$(minorContractTotal)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-700">{fmt$(minorInvoicedTotal)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-900">{fmt$(minorRemainingTotal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>* Milestone split: Underground Start 10% · Rough Start 25% · Rough Completion 25% · Finish Start 30% · Completion 10%</p>
        <p>* Default dates come from Timeline's stage start/end. Click "Override" to set a custom milestone date for a specific project.</p>
        <p>* Minor projects are excluded from milestone math — their remaining bill is simply contract − invoiced.</p>
      </div>

    </main>
  );
}
