"use client";

// The QBO revenue stack for one project — every estimate and invoice with its
// memo and total, so the revenue number is a visible pile of documents instead
// of an opaque formula. Flags orphan invoices (no linked estimate) and shows
// the AV/electric split and outside-labor hours.
import { useEffect, useState } from "react";
import { fmt$ } from "@/lib/format";

interface QboDoc {
  qbo_id: string;
  doc_number: string | null;
  txn_date: string | null;
  memo: string | null;
  total: number;
  status?: string | null;
  balance?: number;
  linked_estimate_qbo_id?: string | null;
  division: string;
  division_override: string | null;
  av_pct: number | null;
  electric_pct: number | null;
}

interface QboBill {
  qbo_id: string;
  vendor_name: string | null;
  doc_number: string | null;
  txn_date: string | null;
  memo: string | null;
  total: number;
  is_outside_labor: number;
  derived_hours: number;
}

interface QboData {
  estimates: QboDoc[];
  invoices: QboDoc[];
  bills: QboBill[];
  rollup: { electric: number; av: number; unknown: number };
  outsideLaborHours: number;
  orphanCount: number;
  lastSync: string | null;
}

const DIVISIONS = ["electric", "av", "mixed", "unknown"] as const;

function divisionBadge(doc: QboDoc): { label: string; cls: string } {
  const d = doc.division_override ?? doc.division;
  if (d === "electric") return { label: "Electric", cls: "bg-warning-bg text-warning" };
  if (d === "av")       return { label: "AV",       cls: "bg-info-bg text-info" };
  if (d === "mixed") {
    const pct = doc.av_pct !== null || doc.electric_pct !== null
      ? ` ${doc.electric_pct ?? 0}/${doc.av_pct ?? 0}` : "";
    return { label: `Mixed${pct}`, cls: "bg-success-bg text-success" };
  }
  return { label: "—", cls: "bg-surface-2 text-subtle" };
}

export default function QboFinancialsPanel({ projectId, isAdmin }: {
  projectId: number;
  isAdmin: boolean;
}) {
  const [data,    setData]    = useState<QboData | null>(null);
  const [failed,  setFailed]  = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function fetchData() {
    try {
      const res = await fetch(`/api/projects/${projectId}/qbo`);
      if (!res.ok) { setFailed(true); return; }
      setData(await res.json());
    } catch { setFailed(true); }
  }

  useEffect(() => { fetchData(); }, [projectId]);

  async function setDivision(kind: "estimate" | "invoice", qboId: string, division: string) {
    await fetch(`/api/projects/${projectId}/qbo`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, qboId, division: division === "auto" ? null : division }),
    });
    fetchData();
  }

  if (failed) return null;
  if (data === null) {
    return (
      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📗 QuickBooks Revenue</p>
        <p className="text-xs text-subtle mt-1">Loading…</p>
      </div>
    );
  }

  const hasAnything = data.estimates.length + data.invoices.length + data.bills.length > 0;
  if (!hasAnything) {
    return (
      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📗 QuickBooks Revenue</p>
        <p className="text-xs text-subtle italic mt-1">
          No QBO documents mapped to this project yet{data.lastSync ? "" : " — run a QBO sync first"}.
        </p>
      </div>
    );
  }

  const estTotal = data.estimates.reduce((s, e) => s + (e.total || 0), 0);
  const invTotal = data.invoices.reduce((s, i) => s + (i.total || 0), 0);
  const outsideBills = data.bills.filter(b => b.is_outside_labor);
  const { electric, av, unknown } = data.rollup;
  const splitTotal = electric + av + unknown;
  const orphans = data.invoices.filter(i => !i.linked_estimate_qbo_id);
  const shownInvoices = showAll ? data.invoices : data.invoices.slice(0, 8);
  const shownEstimates = showAll ? data.estimates : data.estimates.slice(0, 8);

  return (
    <div className="border-t border-border pt-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide">📗 QuickBooks Revenue</p>
          <span className="text-xs text-muted">
            {data.estimates.length} estimate{data.estimates.length === 1 ? "" : "s"} · {fmt$(estTotal)}
            {" — "}{data.invoices.length} invoice{data.invoices.length === 1 ? "" : "s"} · {fmt$(invTotal)}
          </span>
          {orphans.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-danger-bg text-danger">
              ⚠ {orphans.length} not linked to an estimate
            </span>
          )}
        </div>
        {data.lastSync && (
          <span className="text-[10px] text-subtle">synced {data.lastSync.slice(0, 16).replace("T", " ")}</span>
        )}
      </div>

      {/* AV / electric split + outside labor summary */}
      {splitTotal > 0 && (
        <div className="flex items-center gap-4 text-xs mb-2 flex-wrap">
          <span><span className="text-warning font-semibold">{fmt$(electric)}</span> <span className="text-subtle">electric</span></span>
          <span><span className="text-info font-semibold">{fmt$(av)}</span> <span className="text-subtle">AV</span></span>
          {unknown > 0 && (
            <span><span className="text-muted font-semibold">{fmt$(unknown)}</span> <span className="text-subtle">untagged</span></span>
          )}
          {data.outsideLaborHours > 0 && (
            <span className="text-subtle">· <span className="text-text font-semibold">{Math.round(data.outsideLaborHours)}h</span> outside labor</span>
          )}
        </div>
      )}

      {/* Estimates */}
      {shownEstimates.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-muted font-medium mb-0.5">Estimates</p>
          <div className="space-y-1">
            {shownEstimates.map(e => {
              const badge = divisionBadge(e);
              return (
                <div key={e.qbo_id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-b-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <span className="font-mono font-semibold text-text shrink-0 min-w-[72px]">{fmt$(e.total)}</span>
                  <span className="text-text flex-1 truncate" title={e.memo ?? ""}>
                    {e.memo || <span className="text-subtle italic">no memo</span>}
                  </span>
                  {e.doc_number && <span className="text-subtle shrink-0 text-[10px]">#{e.doc_number}</span>}
                  {e.txn_date && <span className="text-subtle tabular-nums shrink-0">{e.txn_date}</span>}
                  {isAdmin && (
                    <select value={e.division_override ?? "auto"}
                      onChange={ev => setDivision("estimate", e.qbo_id, ev.target.value)}
                      className="text-[10px] px-1 py-0.5 border border-border rounded bg-surface shrink-0">
                      <option value="auto">auto</option>
                      {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoices */}
      {shownInvoices.length > 0 && (
        <div className="mb-1">
          <p className="text-[10px] text-muted font-medium mb-0.5">Invoices</p>
          <div className="space-y-1">
            {shownInvoices.map(i => {
              const badge = divisionBadge(i);
              const orphan = !i.linked_estimate_qbo_id;
              return (
                <div key={i.qbo_id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-b-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${orphan ? "bg-danger-bg text-danger" : "bg-success-bg text-success"}`}>
                    {orphan ? "No estimate" : "Linked"}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${badge.cls}`}>{badge.label}</span>
                  <span className="font-mono font-semibold text-text shrink-0 min-w-[72px]">{fmt$(i.total)}</span>
                  <span className="text-text flex-1 truncate" title={i.memo ?? ""}>
                    {i.memo || <span className="text-subtle italic">no memo</span>}
                  </span>
                  {i.doc_number && <span className="text-subtle shrink-0 text-[10px]">#{i.doc_number}</span>}
                  {i.txn_date && <span className="text-subtle tabular-nums shrink-0">{i.txn_date}</span>}
                  {isAdmin && (
                    <select value={i.division_override ?? "auto"}
                      onChange={ev => setDivision("invoice", i.qbo_id, ev.target.value)}
                      className="text-[10px] px-1 py-0.5 border border-border rounded bg-surface shrink-0">
                      <option value="auto">auto</option>
                      {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Outside-labor bills */}
      {outsideBills.length > 0 && (
        <div className="mb-1">
          <p className="text-[10px] text-muted font-medium mb-0.5">Outside labor bills</p>
          <div className="space-y-1">
            {outsideBills.map(b => (
              <div key={b.qbo_id} className="flex items-center gap-2 text-xs py-1 border-b border-border last:border-b-0">
                <span className="font-mono font-semibold text-text shrink-0 min-w-[72px]">{fmt$(b.total)}</span>
                <span className="text-text font-semibold shrink-0">≈ {Math.round(b.derived_hours)}h</span>
                <span className="text-text flex-1 truncate">{b.vendor_name ?? "Unknown vendor"}</span>
                {b.txn_date && <span className="text-subtle tabular-nums shrink-0">{b.txn_date}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.invoices.length > 8 || data.estimates.length > 8) && (
        <button onClick={() => setShowAll(v => !v)}
          className="text-[11px] text-subtle hover:text-text underline mt-1">
          {showAll ? "Show fewer" : `Show all (${data.estimates.length + data.invoices.length} documents)`}
        </button>
      )}
    </div>
  );
}
