"use client";

// Outside-labor vendor rules: mark which QBO vendors are outsourced crews and
// the hourly rate used to back hours out of their bills. Vendors appear here
// automatically after a QBO sync.
import { useEffect, useState } from "react";
import { fmt$ } from "@/lib/format";

interface VendorRule {
  vendor_ref: string;
  vendor_name: string | null;
  is_outside_labor: number;
  hourly_rate: number;
  bill_count: number;
  bill_total: number;
}

export default function VendorRulesPanel() {
  const [vendors, setVendors] = useState<VendorRule[] | null>(null);
  const [failed,  setFailed]  = useState(false);
  const [saving,  setSaving]  = useState<string | null>(null);

  async function fetchVendors() {
    try {
      const res = await fetch("/api/qbo/vendors");
      if (!res.ok) { setFailed(true); return; }
      setVendors((await res.json()).vendors ?? []);
    } catch { setFailed(true); }
  }

  useEffect(() => { fetchVendors(); }, []);

  async function save(v: VendorRule, isOutside: boolean, rate: number) {
    setSaving(v.vendor_ref);
    await fetch("/api/qbo/vendors", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorRef: v.vendor_ref, isOutsideLabor: isOutside, hourlyRate: rate }),
    });
    setSaving(null);
    fetchVendors();
  }

  if (failed || vendors === null || vendors.length === 0) return null;

  return (
    <div className="max-w-5xl mx-auto w-full px-4 pb-8">
      <div className="bg-surface border border-border rounded-lg p-4">
        <p className="text-[10px] font-semibold text-subtle uppercase tracking-wide mb-1">
          🔧 Outside-Labor Vendors (QuickBooks)
        </p>
        <p className="text-xs text-muted mb-3">
          Mark outsourced-crew vendors and their hourly rate. Their bill totals back into hours
          (bill ÷ rate) and count toward each project&apos;s total hours in the report.
        </p>
        <div className="space-y-1">
          {vendors.map(v => (
            <div key={v.vendor_ref} className="flex items-center gap-3 text-xs py-1.5 border-b border-border last:border-b-0">
              <label className="flex items-center gap-2 shrink-0 min-w-[200px] cursor-pointer">
                <input type="checkbox" checked={!!v.is_outside_labor}
                  disabled={saving === v.vendor_ref}
                  onChange={e => save(v, e.target.checked, v.hourly_rate)} />
                <span className="text-text font-medium truncate">{v.vendor_name ?? v.vendor_ref}</span>
              </label>
              <span className="text-subtle shrink-0">
                {v.bill_count} bill{v.bill_count === 1 ? "" : "s"} · {fmt$(v.bill_total)}
              </span>
              {!!v.is_outside_labor && (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-subtle">$</span>
                  <input type="number" step="0.5" defaultValue={v.hourly_rate}
                    onBlur={e => {
                      const rate = Number(e.target.value);
                      if (rate > 0 && rate !== v.hourly_rate) save(v, true, rate);
                    }}
                    className="w-16 px-1 py-0.5 border border-border-strong rounded font-mono text-xs bg-surface" />
                  <span className="text-subtle">/hr → ≈ {Math.round(v.bill_total / (v.hourly_rate || 53)).toLocaleString()}h</span>
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
