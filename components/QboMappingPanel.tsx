"use client";

// Assign QBO customers to Switchboard projects. Auto-matching only claims
// exact/prefix name matches; everything else is mapped here by hand once and
// remembered ('manual' mappings survive every future sync).
import { useEffect, useState } from "react";
import { fmt$ } from "@/lib/format";

interface QboCustomer {
  customer_ref: string;
  customer_name: string | null;
  docs: number;
  total: number;
  project_id: number | null;
}

interface ProjectRow {
  id: number;
  name: string;
  qbo_customer_id: string | null;
  qbo_mapping_source: string | null;
}

export default function QboMappingPanel() {
  const [customers, setCustomers] = useState<QboCustomer[] | null>(null);
  const [projects,  setProjects]  = useState<ProjectRow[]>([]);
  const [showAll,   setShowAll]   = useState(false);
  const [saving,    setSaving]    = useState<string | null>(null);
  const [open,      setOpen]      = useState(false);

  async function fetchData() {
    try {
      const res = await fetch("/api/qbo/mappings");
      if (!res.ok) return;
      const data = await res.json();
      setCustomers(data.customers ?? []);
      setProjects(data.projects ?? []);
    } catch {}
  }

  useEffect(() => { fetchData(); }, []);

  async function assign(customerRef: string, projectId: number | null) {
    setSaving(customerRef);
    await fetch("/api/qbo/mappings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerRef, projectId }),
    });
    setSaving(null);
    fetchData();
  }

  if (customers === null) return null;

  const unmapped = customers.filter(c => !c.project_id && c.total > 0);
  const mapped   = customers.filter(c => c.project_id);
  if (customers.length === 0) return null;

  const shown = showAll ? unmapped : unmapped.slice(0, 12);
  const projectName = (id: number | null) => projects.find(p => p.id === id)?.name ?? "?";

  return (
    <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between text-left">
        <div>
          <h2 className="text-sm font-bold text-text uppercase tracking-wide">🔗 QBO Customer Mapping</h2>
          <p className="text-xs text-subtle mt-1">
            {mapped.length} mapped · {unmapped.length} unmapped QuickBooks customer{unmapped.length === 1 ? "" : "s"} with revenue.
            Assign the ones that belong to tracked projects — assignments stick permanently.
          </p>
        </div>
        <span className="text-subtle text-sm shrink-0">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-1">
          {shown.map(c => (
            <div key={c.customer_ref} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-b-0">
              <span className="text-text font-medium flex-1 truncate" title={c.customer_name ?? c.customer_ref}>
                {c.customer_name ?? `Customer #${c.customer_ref}`}
              </span>
              <span className="text-subtle shrink-0">{c.docs} doc{c.docs === 1 ? "" : "s"} · {fmt$(c.total)}</span>
              <select defaultValue="" disabled={saving === c.customer_ref}
                onChange={e => { const v = e.target.value; if (v) assign(c.customer_ref, parseInt(v)); }}
                className="text-[11px] px-1.5 py-1 border border-border-strong rounded bg-surface shrink-0 max-w-[180px]">
                <option value="" disabled>Assign to project…</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          ))}
          {unmapped.length > 12 && (
            <button onClick={() => setShowAll(v => !v)}
              className="text-[11px] text-subtle hover:text-text underline mt-1">
              {showAll ? "Show fewer" : `Show all ${unmapped.length} unmapped`}
            </button>
          )}

          {mapped.length > 0 && (
            <div className="pt-3">
              <p className="text-[10px] text-muted font-medium mb-1">Mapped</p>
              {mapped.map(c => (
                <div key={c.customer_ref} className="flex items-center gap-3 text-xs py-1 border-b border-border last:border-b-0">
                  <span className="text-text flex-1 truncate">{c.customer_name ?? c.customer_ref}</span>
                  <span className="text-subtle shrink-0">→ {projectName(c.project_id)}</span>
                  <button onClick={() => assign(c.customer_ref, null)}
                    disabled={saving === c.customer_ref}
                    title="Remove mapping"
                    className="text-subtle hover:text-danger text-sm leading-none shrink-0">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
