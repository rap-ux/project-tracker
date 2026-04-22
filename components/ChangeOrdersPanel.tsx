"use client";

import { useEffect, useState } from "react";

const fmt$ = (n: number) => "$" + (n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

interface CO {
  id: number;
  description: string;
  amount: number;
  status: string;
  co_date: string | null;
  created_by: string;
  created_at: string;
}

const STATUSES = ["Quoted", "Approved", "Invoiced", "Rejected"] as const;

function statusColor(s: string): string {
  return s === "Approved" ? "bg-green-100 text-green-700"
       : s === "Invoiced" ? "bg-blue-100 text-blue-700"
       : s === "Rejected" ? "bg-red-100 text-red-600"
                           : "bg-amber-100 text-amber-700";
}

export default function ChangeOrdersPanel({ projectId, isAdmin, onTotalChange }: {
  projectId: number;
  isAdmin: boolean;
  onTotalChange?: (total: number) => void;
}) {
  const [cos,       setCos]       = useState<CO[] | null>(null);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [editing,   setEditing]   = useState<number | null>(null);

  async function fetchCOs() {
    const res  = await fetch(`/api/projects/${projectId}/change-orders`);
    const data = await res.json();
    const list: CO[] = data.changeOrders ?? [];
    setCos(list);
    if (onTotalChange) {
      const approvedTotal = list.filter(c => c.status === "Approved" || c.status === "Invoiced")
                               .reduce((s, c) => s + (c.amount ?? 0), 0);
      onTotalChange(approvedTotal);
    }
  }

  useEffect(() => { fetchCOs(); }, [projectId]);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      description: fd.get("description"),
      amount:      fd.get("amount"),
      status:      fd.get("status"),
      co_date:     fd.get("co_date") || null,
    };
    const res = await fetch(`/api/projects/${projectId}/change-orders`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setAdding(false);
      (e.currentTarget as HTMLFormElement).reset();
      fetchCOs();
    }
  }

  async function handleStatusChange(id: number, newStatus: string) {
    await fetch(`/api/change-orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchCOs();
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this change order?")) return;
    await fetch(`/api/change-orders/${id}`, { method: "DELETE" });
    fetchCOs();
  }

  if (cos === null) {
    return (
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">📝 Change Orders</p>
        <p className="text-xs text-gray-400 mt-1">Loading…</p>
      </div>
    );
  }

  const approvedTotal = cos.filter(c => c.status === "Approved" || c.status === "Invoiced")
                           .reduce((s, c) => s + (c.amount ?? 0), 0);
  const pendingTotal  = cos.filter(c => c.status === "Quoted").reduce((s, c) => s + (c.amount ?? 0), 0);

  return (
    <div className="border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">📝 Change Orders</p>
          {cos.length > 0 && (
            <span className="text-xs text-gray-600">
              {cos.length} CO{cos.length === 1 ? "" : "s"} ·
              {approvedTotal > 0 && <span className="text-green-700 font-semibold"> +{fmt$(approvedTotal)} approved</span>}
              {pendingTotal > 0  && <span className="text-amber-700 font-semibold">{approvedTotal > 0 ? " · " : " "}{fmt$(pendingTotal)} pending</span>}
            </span>
          )}
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)}
            className="text-[11px] px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-50 font-medium text-gray-700">
            + Add CO
          </button>
        )}
      </div>

      {adding && isAdmin && (
        <form onSubmit={handleAdd} className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 font-medium mb-0.5">Description *</label>
              <input name="description" required autoFocus
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-0.5">Amount ($) *</label>
              <input name="amount" type="number" step="0.01" required
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 font-medium mb-0.5">Status</label>
              <select name="status" defaultValue="Quoted"
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-gray-500 font-medium mb-0.5">Date</label>
              <input name="co_date" type="date"
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="text-xs px-3 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded font-semibold">
              {saving ? "…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="text-xs px-3 py-1 bg-white border border-gray-300 hover:bg-gray-50 rounded">
              Cancel
            </button>
          </div>
        </form>
      )}

      {cos.length === 0 && !adding && (
        <p className="text-xs text-gray-400 italic">No change orders logged.</p>
      )}

      {cos.length > 0 && (
        <div className="space-y-1">
          {cos.map(co => (
            <div key={co.id} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50 last:border-b-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${statusColor(co.status)}`}>
                {co.status}
              </span>
              <span className="font-mono font-semibold text-gray-800 shrink-0 min-w-[72px]">{fmt$(co.amount)}</span>
              <span className="text-gray-700 flex-1 truncate" title={co.description}>{co.description}</span>
              {co.co_date && <span className="text-gray-400 tabular-nums shrink-0">{co.co_date}</span>}
              <span className="text-gray-300 shrink-0 text-[10px]">by {co.created_by}</span>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <select value={co.status}
                    onChange={e => handleStatusChange(co.id, e.target.value)}
                    className="text-[10px] px-1 py-0.5 border border-gray-200 rounded bg-white">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => handleDelete(co.id)}
                    title="Delete"
                    className="text-gray-300 hover:text-red-500 text-sm leading-none">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
