"use client";

import { useState, useMemo } from "react";

// ── Constants ──────────────────────────────────────────────────────────────────
const MILESTONES = [
  { key: "underground_start", label: "Underground Start", pct: 0.10, shortLabel: "UG Start"    },
  { key: "rough_start",       label: "Rough Start",       pct: 0.25, shortLabel: "Rough Start"  },
  { key: "rough_completion",  label: "Rough Completion",  pct: 0.25, shortLabel: "Rough Done"   },
  { key: "finish_start",      label: "Finish Start",      pct: 0.30, shortLabel: "Finish Start" },
  { key: "finish_completion", label: "Completion",        pct: 0.10, shortLabel: "Completion"   },
] as const;

const DESIGNATIONS = ["S", "L", "CUST"] as const;
const RECEIPT_DELAY_DAYS = 30;

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

interface Payment {
  projectId:   number;
  projectName: string;
  milestone:   string;
  receiveDate: Date;
  amount:      number;
  monthKey:    string;
}

function computePayments(row: any): Payment[] {
  const cv = row.contract_value ?? 0;
  return MILESTONES
    .map(m => {
      const dateStr = row[m.key];
      if (!dateStr) return null;
      const receiveDate = addDays(dateStr, RECEIPT_DELAY_DAYS);
      return {
        projectId:   row.id,
        projectName: row.name,
        milestone:   m.shortLabel,
        receiveDate,
        amount:      cv * m.pct,
        monthKey:    toYYYYMM(receiveDate),
      } satisfies Payment;
    })
    .filter(Boolean) as Payment[];
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { rows: any[]; role: string; }

export default function ForecastClient({ rows, role }: Props) {
  const [data,           setData]           = useState<any[]>(rows);
  const [editing,        setEditing]        = useState<number | null>(null);
  const [draft,          setDraft]          = useState<any>(null);
  const [saving,         setSaving]         = useState(false);
  const [msg,            setMsg]            = useState("");
  const isAdmin = role === "owner" || role === "admin";

  // ── Filters ────────────────────────────────────────────────────────────────
  const [showPipeline,  setShowPipeline]  = useState(true);
  const allForemen = useMemo(
    () => Array.from(new Set(data.map(r => r.foreman))).sort(),
    [data]
  );
  const [hiddenForemen, setHiddenForemen] = useState<Set<string>>(new Set());

  function toggleForeman(name: string) {
    setHiddenForemen(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const filteredData = useMemo(
    () => data.filter(r =>
      !hiddenForemen.has(r.foreman) &&
      (showPipeline || !r.is_pipeline)
    ),
    [data, hiddenForemen, showPipeline]
  );

  // ── Cash-flow matrix (responds to foreman filter) ──────────────────────────
  const { monthKeys, byMonth, totalByMonth } = useMemo(() => {
    const allPayments: Payment[] = filteredData.flatMap(computePayments);
    const months = new Set<string>();
    allPayments.forEach(p => months.add(p.monthKey));
    const monthKeys = Array.from(months).sort();

    const byMonth: Record<string, Payment[]> = {};
    monthKeys.forEach(mk => { byMonth[mk] = allPayments.filter(p => p.monthKey === mk); });
    const totalByMonth: Record<string, number> = {};
    monthKeys.forEach(mk => { totalByMonth[mk] = byMonth[mk].reduce((s, p) => s + p.amount, 0); });

    return { monthKeys, byMonth, totalByMonth };
  }, [filteredData]);

  const grandTotal      = Object.values(totalByMonth).reduce((s, v) => s + v, 0);
  const maxMonth        = Math.max(...Object.values(totalByMonth), 1);

  // ── Milestone table totals ─────────────────────────────────────────────────
  const tableTotals = useMemo(() => {
    const contractTotal   = filteredData.reduce((s, r) => s + (r.contract_value  ?? 0), 0);
    const remainingTotal  = filteredData.reduce((s, r) => s + (r.remaining_value ?? 0), 0);
    return { contractTotal, remainingTotal };
  }, [filteredData]);

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

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Revenue Forecasting</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Payment milestones · {RECEIPT_DELAY_DAYS}-day receipt delay · 10 / 25 / 25 / 30 / 10 % split
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Foreman filter chips */}
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

          {/* Pipeline toggle */}
          <button
            onClick={() => setShowPipeline(p => !p)}
            className="text-xs px-3 py-1 rounded-full border font-medium transition-all"
            style={showPipeline
              ? { backgroundColor: "#101010", borderColor: "#101010", color: "#fff" }
              : { backgroundColor: "#fff", borderColor: "#d1d5db", color: "#9ca3af" }}>
            {showPipeline ? "Minor Projects: On" : "Minor Projects: Off"}
          </button>

          {msg && <p className="text-sm text-gray-700 bg-white border rounded-lg px-4 py-2 shadow-sm">{msg}</p>}
        </div>
      </div>

      {/* Overall totals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Contract Value",   value: fmt$(filteredData.reduce((s,r) => s+(r.contract_value??0),  0)) },
          { label: "Total Projected Cash",   value: fmt$(grandTotal),                                              highlight: true },
          { label: "Remaining Unbilled",     value: fmt$(tableTotals.remainingTotal) },
          { label: "Projects in View",       value: String(filteredData.length) },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{card.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${card.highlight ? "" : "text-gray-900"}`}
              style={card.highlight ? { color: "#00BAD6" } : {}}>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Monthly Cash-Flow Summary ── */}
      {monthKeys.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">Projected Monthly Cash Flow</h2>
            <span className="text-sm font-bold text-gray-700">Total: {fmt$(grandTotal)}</span>
          </div>

          {/* Bar chart */}
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {monthKeys.map(mk => {
              const total = totalByMonth[mk];
              const heightPct = (total / maxMonth) * 100;
              return (
                <div key={mk} className="flex flex-col items-center gap-1 min-w-[3.5rem]">
                  <span className="text-xs text-gray-600 font-medium">{fmt$(total)}</span>
                  <div className="w-full rounded-t-sm transition-all" style={{ height: `${heightPct}%`, minHeight: "4px", backgroundColor: "#00BAD6" }} />
                  <span className="text-xs text-gray-400 whitespace-nowrap">{monthLabel(mk)}</span>
                </div>
              );
            })}
          </div>

          {/* Month detail table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-1 font-medium">Month</th>
                  <th className="pb-1 font-medium text-right">Total</th>
                  <th className="pb-1 pl-4 font-medium">Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthKeys.map(mk => (
                  <tr key={mk} className="hover:bg-gray-50">
                    <td className="py-1.5 font-medium text-gray-700">{monthLabel(mk)}</td>
                    <td className="py-1.5 text-right font-mono font-semibold text-gray-800">{fmt$(totalByMonth[mk])}</td>
                    <td className="py-1.5 pl-4 text-gray-500">
                      {byMonth[mk].map((p, i) => (
                        <span key={i} className="mr-3">
                          {p.projectName} <span className="text-gray-400">({p.milestone} · {fmt$(p.amount)})</span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {monthKeys.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-800">
          📅 No milestone dates entered yet. Add dates in the table below to generate cash flow projections.
        </div>
      )}

      {/* ── Milestone Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Project Milestone Dates</h2>
          <p className="text-xs text-gray-400">Cash received = milestone date + {RECEIPT_DELAY_DAYS} days</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 text-white text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left sticky left-0 bg-slate-800 z-10">Project</th>
                <th className="px-4 py-3 text-left">Foreman</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-right">Contract</th>
                {MILESTONES.map(m => (
                  <th key={m.key} className="px-3 py-3 text-center whitespace-nowrap">
                    <div>{m.shortLabel}</div>
                    <div className="text-white/50 normal-case font-normal tracking-normal">({(m.pct * 100).toFixed(0)}%)</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-right">Remaining</th>
                {isAdmin && <th className="px-4 py-3 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((row: any) => {
                const isEditing = editing === row.id;
                const d = isEditing ? draft : row;

                return (
                  <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${isEditing ? "bg-blue-50" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-inherit">{row.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{row.foreman}</td>
                    <td className="px-4 py-3 text-center">
                      {isEditing ? (
                        <select
                          value={d.designation}
                          onChange={e => changeField("designation", e.target.value)}
                          className="text-xs px-1.5 py-1 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400">
                          {DESIGNATIONS.map(dg => <option key={dg} value={dg}>{dg}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          d.designation === "L"    ? "bg-purple-100 text-purple-700" :
                          d.designation === "CUST" ? "bg-orange-100 text-orange-700" :
                                                     "bg-blue-100   text-blue-700"
                        }`}>{d.designation}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">{fmt$(row.contract_value)}</td>

                    {MILESTONES.map(m => {
                      const dateVal  = d[m.key] ?? "";
                      const payAmt   = row.contract_value * m.pct;
                      return (
                        <td key={m.key} className="px-3 py-3 text-center">
                          {isEditing ? (
                            <input
                              type="date"
                              value={dateVal}
                              onChange={e => changeField(m.key, e.target.value)}
                              className="text-xs px-1.5 py-1 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                          ) : dateVal ? (
                            <div className="flex flex-col items-center">
                              <span className="text-xs text-gray-700">{dateVal}</span>
                              <span className="text-xs text-gray-400">{fmt$(payAmt)}</span>
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
                            className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors">
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {/* Totals footer */}
            <tfoot>
              <tr className="text-xs font-semibold border-t-2 border-gray-300" style={{ backgroundColor: "#f0fdfe" }}>
                <td className="px-4 py-3 sticky left-0 font-bold" style={{ backgroundColor: "#f0fdfe", color: "#00BAD6" }}>
                  Totals ({filteredData.length})
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right font-mono text-gray-900">
                  {fmt$(tableTotals.contractTotal)}
                </td>
                {MILESTONES.map(m => {
                  const milestoneTotal = filteredData.reduce((s, r) => {
                    return s + (r[m.key] ? (r.contract_value ?? 0) * m.pct : 0);
                  }, 0);
                  return (
                    <td key={m.key} className="px-3 py-3 text-center font-mono text-gray-900">
                      {milestoneTotal > 0 ? fmt$(milestoneTotal) : <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-right font-mono text-gray-900">
                  {fmt$(tableTotals.remainingTotal)}
                </td>
                {isAdmin && <td className="px-4 py-3" />}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="text-xs text-gray-400 space-y-1">
        <p>* Payment split: Underground Start (10%) · Rough Start (25%) · Rough Completion (25%) · Finish Start (30%) · Completion (10%)</p>
        <p>* Cash receipt = milestone date + {RECEIPT_DELAY_DAYS} days · Type: S = Standard, L = Luxury, CUST = Custom</p>
      </div>

    </main>
  );
}
