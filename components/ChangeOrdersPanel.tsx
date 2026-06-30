"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "./useConfirm";
import { fmt$ } from "@/lib/format";

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
  return s === "Approved" ? "bg-success-bg text-success"
       : s === "Invoiced" ? "bg-info-bg text-info"
       : s === "Rejected" ? "bg-danger-bg text-danger"
                           : "bg-warning-bg text-warning";
}

export default function ChangeOrdersPanel({ projectId, isAdmin, onTotalChange }: {
  projectId: number;
  isAdmin: boolean;
  onTotalChange?: (total: number) => void;
}) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [cos,       setCos]       = useState<CO[] | null>(null);
  const [adding,    setAdding]    = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [editing,   setEditing]   = useState<number | null>(null);
  const [error,     setError]     = useState("");

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
    setError("");
    const res = await fetch(`/api/change-orders/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) { setError("Couldn't update status — try again."); return; }
    fetchCOs();
  }

  async function handleDelete(id: number) {
    if (!(await confirm("Delete this change order? This also removes it from the project's billed/approved totals.", { title: "Delete change order", confirmLabel: "Delete", danger: true }))) return;
    setError("");
    const res = await fetch(`/api/change-orders/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Delete failed — the change order is still there. Try again."); return; }
    fetchCOs();
  }

  if (cos === null) {
    return (
      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📝 Change Orders</p>
        <p className="text-xs text-subtle mt-1">Loading…</p>
      </div>
    );
  }

  const approvedTotal = cos.filter(c => c.status === "Approved" || c.status === "Invoiced")
                           .reduce((s, c) => s + (c.amount ?? 0), 0);
  const pendingTotal  = cos.filter(c => c.status === "Quoted").reduce((s, c) => s + (c.amount ?? 0), 0);

  return (
    <div className="border-t border-border pt-3">
      {confirmDialog}
      {error && (
        <p className="text-xs text-danger bg-danger-bg border border-border rounded-lg px-3 py-2 mb-2">{error}</p>
      )}
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📝 Change Orders</p>
          {cos.length > 0 && (
            <span className="text-xs text-muted">
              {cos.length} CO{cos.length === 1 ? "" : "s"} ·
              {approvedTotal > 0 && <span className="text-success font-semibold"> +{fmt$(approvedTotal)} approved</span>}
              {pendingTotal > 0  && <span className="text-warning font-semibold">{approvedTotal > 0 ? " · " : " "}{fmt$(pendingTotal)} pending</span>}
            </span>
          )}
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)}
            className="text-[11px] px-2 py-0.5 rounded border border-border-strong hover:bg-surface-2 font-medium text-text">
            + Add CO
          </button>
        )}
      </div>

      {adding && isAdmin && (
        <form onSubmit={handleAdd} className="bg-surface-2 border border-border rounded-lg p-3 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <label className="block text-[10px] text-muted font-medium mb-0.5">Description *</label>
              <input name="description" required autoFocus
                className="w-full px-2 py-1 text-xs border border-border-strong rounded focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="block text-[10px] text-muted font-medium mb-0.5">Amount ($) *</label>
              <input name="amount" type="number" step="0.01" required
                className="w-full px-2 py-1 text-xs border border-border-strong rounded font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
            <div>
              <label className="block text-[10px] text-muted font-medium mb-0.5">Status</label>
              <select name="status" defaultValue="Quoted"
                className="w-full px-2 py-1 text-xs border border-border-strong rounded focus:outline-none focus:ring-1 focus:ring-cyan-400">
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] text-muted font-medium mb-0.5">Date</label>
              <input name="co_date" type="date"
                className="w-full px-2 py-1 text-xs border border-border-strong rounded focus:outline-none focus:ring-1 focus:ring-cyan-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="text-xs px-3 py-1 bg-cyan-500 hover:bg-cyan-600 text-white rounded font-semibold">
              {saving ? "…" : "Add"}
            </button>
            <button type="button" onClick={() => setAdding(false)}
              className="text-xs px-3 py-1 bg-surface border border-border-strong hover:bg-surface-2 rounded">
              Cancel
            </button>
          </div>
        </form>
      )}

      {cos.length === 0 && !adding && (
        <p className="text-xs text-subtle italic">No change orders logged.</p>
      )}

      {cos.length > 0 && (
        <div className="space-y-1">
          {cos.map(co => (
            <div key={co.id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-b-0">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${statusColor(co.status)}`}>
                {co.status}
              </span>
              <span className="font-mono font-semibold text-text shrink-0 min-w-[72px]">{fmt$(co.amount)}</span>
              <span className="text-text flex-1 truncate" title={co.description}>{co.description}</span>
              {co.co_date && <span className="text-subtle tabular-nums shrink-0">{co.co_date}</span>}
              <span className="text-subtle shrink-0 text-[10px]">by {co.created_by}</span>
              {isAdmin && (
                <div className="flex items-center gap-1 shrink-0">
                  <select value={co.status}
                    onChange={e => handleStatusChange(co.id, e.target.value)}
                    className="text-[10px] px-1 py-0.5 border border-border rounded bg-surface">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => handleDelete(co.id)}
                    title="Delete"
                    className="text-subtle hover:text-danger text-sm leading-none">×</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
