"use client";

import { useState } from "react";

const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
const fmt$   = (n: number) => "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });

interface Props { inputs: any[]; role: string; }

export default function InputsClient({ inputs, role }: Props) {
  const [rows,         setRows]         = useState<any[]>(inputs);
  const [editing,      setEditing]      = useState<number | null>(null);
  const [draft,        setDraft]        = useState<any>(null);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState("");
  const [showPipeline, setShowPipeline] = useState(false);

  const visibleRows = showPipeline ? rows : rows.filter(r => !r.is_pipeline);

  const isAdmin = role === "owner" || role === "admin";

  function startEdit(row: any) {
    setEditing(row.id);
    setDraft({ ...row });
  }

  function change(field: string, val: string) {
    setDraft((d: any) => ({ ...d, [field]: parseFloat(val) || 0 }));
  }

  async function save() {
    setSaving(true);
    setMsg("");
    const res  = await fetch("/api/inputs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, project_id: draft.id }),
    });
    const data = await res.json();
    setSaving(false);
    if (data.ok) {
      setRows(r => r.map(row => row.id === draft.id ? { ...row, ...draft } : row));
      setEditing(null);
      setMsg("✅ Saved");
      setTimeout(() => setMsg(""), 2500);
    } else {
      setMsg("❌ Failed to save");
    }
  }

  const fields = [
    { key: "gross_margin",        label: "Gross Margin",          pct: true  },
    { key: "materials_share",     label: "Materials Share",       pct: true  },
    { key: "wages_share",         label: "Wages Share",           pct: true  },
    { key: "blended_hourly_rate", label: "Blended Hourly Rate",   pct: false },
    { key: "blended_hourly_wage", label: "Blended Hourly Wage",   pct: false },
    { key: "rough_hours_est",     label: "Rough Hours Est.",      pct: false },
    { key: "finish_hours_est",    label: "Finish Hours Est.",     pct: false },
  ];

  return (
    <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Project Inputs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Financial assumptions and planned stage-hour totals per project. These are the totals we&apos;re aiming for, not progress-to-date.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowPipeline(p => !p)}
            className="text-xs px-3 py-1.5 rounded-full border font-medium transition-all"
            style={showPipeline
              ? { backgroundColor: "#101010", borderColor: "#101010", color: "#fff" }
              : { backgroundColor: "#fff", borderColor: "#d1d5db", color: "#9ca3af" }}>
            {showPipeline ? "Minor Projects: On" : "Minor Projects: Off"}
          </button>
          {msg && <p className="text-sm text-gray-700 bg-white border rounded-lg px-4 py-2 shadow-sm">{msg}</p>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
                <th className="px-4 py-3 text-left sticky left-0 bg-gray-50 z-10">Project</th>
                <th className="px-4 py-3 text-left">Foreman</th>
                <th className="px-4 py-3 text-right">Contract Value</th>
                <th className="px-4 py-3 text-center">Gross Margin</th>
                <th className="px-4 py-3 text-center">Materials Share</th>
                <th className="px-4 py-3 text-center">Wages Share</th>
                <th className="px-4 py-3 text-center">Blend Rate/hr</th>
                <th className="px-4 py-3 text-center">Wage/hr</th>
                <th className="px-4 py-3 text-center">Rough Hrs Est.</th>
                <th className="px-4 py-3 text-center">Finish Hrs Est.</th>
                {isAdmin && <th className="px-4 py-3 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibleRows.map((row: any) => {
                const isEditing = editing === row.id;
                const d = isEditing ? draft : row;

                return (
                  <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${isEditing ? "bg-blue-50" : ""} ${row.is_pipeline ? "opacity-75" : ""}`}>
                    <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-inherit">
                      <span>{row.name}</span>
                      {row.is_pipeline ? <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 font-normal">Minor</span> : null}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.foreman}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700">
                      {"$" + (row.contract_value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </td>

                    {fields.map(f => (
                      <td key={f.key} className="px-4 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number" step="any"
                            value={f.pct ? (d[f.key] * 100).toFixed(2) : d[f.key]}
                            onChange={e => change(f.key, f.pct ? String(parseFloat(e.target.value) / 100) : e.target.value)}
                            className="w-20 px-2 py-1 text-xs text-center border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <span className="text-gray-700">
                            {f.pct ? fmtPct(d[f.key]) : f.key.includes("rate") || f.key.includes("wage") ? fmt$(d[f.key]) : d[f.key]?.toLocaleString()}
                          </span>
                        )}
                      </td>
                    ))}

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
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        * Check column = Materials Share + Wages Share. Gross Margin = 1 − Check.
        Hourly Rate drives estimated hours budgets. Changes here affect KPI calculations.
      </p>
    </main>
  );
}
