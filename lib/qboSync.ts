// Pulls Estimates, Invoices, and Bills from QuickBooks Online into the local
// qbo_* tables and maps them to Switchboard projects. Nicole's rules encoded:
//  - invoices with no linked estimate are "orphans" (she used to hunt these by hand)
//  - outside-labor vendors' bill totals back into hours at a per-vendor rate (~$53/hr)
//  - estimate/invoice memos carry the AV vs electric division ("electric", "AV",
//    or mixed like "20% electric, 50% AV")
import db from "@/lib/db";
import { qboQueryAll } from "@/lib/qbo";

// ── Division parsing ──────────────────────────────────────────────────────────
export type Division = "electric" | "av" | "mixed" | "unknown";

export function parseDivision(text: string | null | undefined): {
  division: Division; av_pct: number | null; electric_pct: number | null;
} {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return { division: "unknown", av_pct: null, electric_pct: null };

  // Percent-tagged form: "20% electric, 50% av" (order-insensitive, either side optional)
  let avPct: number | null = null;
  let elPct: number | null = null;
  for (const m of t.matchAll(/(\d{1,3})\s*%\s*(av\b|audio|electric\w*|elec\b)/g)) {
    const pct = Math.min(100, parseInt(m[1], 10));
    if (m[2].startsWith("av") || m[2].startsWith("audio")) avPct = pct; else elPct = pct;
  }
  for (const m of t.matchAll(/(av\b|audio|electric\w*|elec\b)\D{0,3}(\d{1,3})\s*%/g)) {
    const pct = Math.min(100, parseInt(m[2], 10));
    if (m[1].startsWith("av") || m[1].startsWith("audio")) avPct ??= pct; else elPct ??= pct;
  }
  if (avPct !== null || elPct !== null) {
    return { division: "mixed", av_pct: avPct, electric_pct: elPct };
  }

  const hasAv = /\bav\b|audio\s*.?\s*video|audio\/video/.test(t);
  const hasEl = /\belec\b|\belectric\w*/.test(t);
  if (hasAv && hasEl) return { division: "mixed",    av_pct: null, electric_pct: null };
  if (hasAv)          return { division: "av",       av_pct: 100,  electric_pct: 0 };
  if (hasEl)          return { division: "electric", av_pct: 0,    electric_pct: 100 };
  return { division: "unknown", av_pct: null, electric_pct: null };
}

// Effective division = override ?? parsed. Mixed splits by av_pct/electric_pct
// when present, otherwise 50/50; anything unparsed lands in "unknown" so gaps
// stay visible instead of silently inflating a bucket. Orphan invoices count
// alongside estimates (they carry revenue no estimate covers).
export function rollupDivision(estimates: any[], invoices: any[]) {
  const sum = { electric: 0, av: 0, unknown: 0 };
  const orphanInvoices = invoices.filter(i => !i.linked_estimate_qbo_id);
  for (const doc of [...estimates, ...orphanInvoices]) {
    const div = doc.division_override ?? doc.division;
    const total = doc.total || 0;
    if (div === "electric") sum.electric += total;
    else if (div === "av")  sum.av += total;
    else if (div === "mixed") {
      const av = doc.av_pct, el = doc.electric_pct;
      if (av !== null || el !== null) {
        sum.av       += total * ((av ?? 0) / 100);
        sum.electric += total * ((el ?? 0) / 100);
        const rest = 100 - (av ?? 0) - (el ?? 0);
        if (rest > 0) sum.unknown += total * (rest / 100);
      } else {
        sum.av += total / 2; sum.electric += total / 2;
      }
    } else sum.unknown += total;
  }
  return sum;
}

// ── Customer → project mapping ────────────────────────────────────────────────
// QBO projects are sub-customers; FullyQualifiedName is "Parent:Child". Match the
// leaf name against Switchboard projects: saved mapping → exact → firstword LIKE
// (the same fallback lib/importer.ts uses for sheet columns).
function leafName(fullName: string): string {
  const parts = fullName.split(":");
  return parts[parts.length - 1].trim();
}

function buildProjectMatcher() {
  const byQboId = new Map<string, number>();
  for (const r of db.prepare("SELECT id, qbo_customer_id FROM projects WHERE qbo_customer_id IS NOT NULL").all() as any[]) {
    byQboId.set(String(r.qbo_customer_id), r.id);
  }
  const exact = db.prepare("SELECT id FROM projects WHERE LOWER(name) = LOWER(?)");
  const like  = db.prepare("SELECT id FROM projects WHERE name LIKE ? LIMIT 2");
  const saveMapping = db.prepare("UPDATE projects SET qbo_customer_id = ? WHERE id = ? AND qbo_customer_id IS NULL");

  return (customerRef: string | null, customerName: string | null): number | null => {
    if (customerRef && byQboId.has(customerRef)) return byQboId.get(customerRef)!;
    const name = leafName(customerName ?? "");
    if (!name) return null;

    let row = exact.get(name) as { id: number } | undefined;
    if (!row) {
      const first = name.split(/\s+/)[0];
      if (first.length >= 3) {
        const candidates = like.all(`${first}%`) as { id: number }[];
        if (candidates.length === 1) row = candidates[0];
      }
    }
    if (row && customerRef) {
      saveMapping.run(customerRef, row.id);
      byQboId.set(customerRef, row.id);
    }
    return row?.id ?? null;
  };
}

// ── Sync ──────────────────────────────────────────────────────────────────────
export type SyncResult = {
  logId: number; estimates: number; invoices: number; bills: number;
  orphans: number; unmapped: string[];
};

export async function runQboSync(): Promise<SyncResult> {
  const logId = db.prepare("INSERT INTO qbo_sync_log (status) VALUES ('running')")
    .run().lastInsertRowid as number;

  try {
    const [estimates, invoices, bills] = await Promise.all([
      qboQueryAll<any>("Estimate"),
      qboQueryAll<any>("Invoice"),
      qboQueryAll<any>("Bill"),
    ]);

    const matchProject = buildProjectMatcher();
    const unmapped = new Set<string>();

    const vendorRules = new Map<string, { is_outside_labor: number; hourly_rate: number }>();
    for (const r of db.prepare("SELECT vendor_ref, is_outside_labor, hourly_rate FROM qbo_vendor_rules").all() as any[]) {
      vendorRules.set(String(r.vendor_ref), r);
    }

    const upEst = db.prepare(`
      INSERT INTO qbo_estimates (qbo_id, project_id, customer_ref, customer_name, doc_number,
        txn_date, memo, total, status, division, av_pct, electric_pct, line_items, synced_at)
      VALUES (@qbo_id, @project_id, @customer_ref, @customer_name, @doc_number,
        @txn_date, @memo, @total, @status, @division, @av_pct, @electric_pct, @line_items, datetime('now'))
      ON CONFLICT(qbo_id) DO UPDATE SET
        project_id = @project_id, customer_ref = @customer_ref, customer_name = @customer_name,
        doc_number = @doc_number, txn_date = @txn_date, memo = @memo, total = @total,
        status = @status, division = @division, av_pct = @av_pct, electric_pct = @electric_pct,
        line_items = @line_items, synced_at = datetime('now')
    `);
    const upInv = db.prepare(`
      INSERT INTO qbo_invoices (qbo_id, project_id, customer_ref, customer_name, doc_number,
        txn_date, memo, total, balance, linked_estimate_qbo_id, division, av_pct, electric_pct,
        line_items, synced_at)
      VALUES (@qbo_id, @project_id, @customer_ref, @customer_name, @doc_number,
        @txn_date, @memo, @total, @balance, @linked_estimate_qbo_id, @division, @av_pct,
        @electric_pct, @line_items, datetime('now'))
      ON CONFLICT(qbo_id) DO UPDATE SET
        project_id = @project_id, customer_ref = @customer_ref, customer_name = @customer_name,
        doc_number = @doc_number, txn_date = @txn_date, memo = @memo, total = @total,
        balance = @balance, linked_estimate_qbo_id = @linked_estimate_qbo_id,
        division = @division, av_pct = @av_pct, electric_pct = @electric_pct,
        line_items = @line_items, synced_at = datetime('now')
    `);
    const upBill = db.prepare(`
      INSERT INTO qbo_bills (qbo_id, project_id, customer_ref, vendor_ref, vendor_name,
        doc_number, txn_date, memo, total, is_outside_labor, derived_hours, synced_at)
      VALUES (@qbo_id, @project_id, @customer_ref, @vendor_ref, @vendor_name,
        @doc_number, @txn_date, @memo, @total, @is_outside_labor, @derived_hours, datetime('now'))
      ON CONFLICT(qbo_id) DO UPDATE SET
        project_id = @project_id, customer_ref = @customer_ref, vendor_ref = @vendor_ref,
        vendor_name = @vendor_name, doc_number = @doc_number, txn_date = @txn_date,
        memo = @memo, total = @total, is_outside_labor = @is_outside_labor,
        derived_hours = @derived_hours, synced_at = datetime('now')
    `);
    const seenVendor = db.prepare(`
      INSERT INTO qbo_vendor_rules (vendor_ref, vendor_name)
      VALUES (?, ?)
      ON CONFLICT(vendor_ref) DO UPDATE SET vendor_name = excluded.vendor_name
    `);

    let orphans = 0;

    db.transaction(() => {
      for (const e of estimates) {
        const customerRef  = e.CustomerRef?.value ? String(e.CustomerRef.value) : null;
        const customerName = e.CustomerRef?.name ?? null;
        const projectId    = matchProject(customerRef, customerName);
        if (!projectId && customerName) unmapped.add(leafName(customerName));
        const memo = e.CustomerMemo?.value ?? e.PrivateNote ?? null;
        const d = parseDivision(memo);
        upEst.run({
          qbo_id: String(e.Id), project_id: projectId, customer_ref: customerRef,
          customer_name: customerName, doc_number: e.DocNumber ?? null,
          txn_date: e.TxnDate ?? null, memo, total: Number(e.TotalAmt) || 0,
          status: e.TxnStatus ?? null, division: d.division,
          av_pct: d.av_pct, electric_pct: d.electric_pct,
          line_items: JSON.stringify((e.Line ?? []).map((l: any) => ({
            desc: l.Description ?? null, amount: Number(l.Amount) || 0,
          }))),
        });
      }

      for (const i of invoices) {
        const customerRef  = i.CustomerRef?.value ? String(i.CustomerRef.value) : null;
        const customerName = i.CustomerRef?.name ?? null;
        const projectId    = matchProject(customerRef, customerName);
        if (!projectId && customerName) unmapped.add(leafName(customerName));
        const linked = (i.LinkedTxn ?? []).find((l: any) => l.TxnType === "Estimate");
        if (!linked) orphans++;
        const memo = i.CustomerMemo?.value ?? i.PrivateNote ?? null;
        const d = parseDivision(memo);
        upInv.run({
          qbo_id: String(i.Id), project_id: projectId, customer_ref: customerRef,
          customer_name: customerName, doc_number: i.DocNumber ?? null,
          txn_date: i.TxnDate ?? null, memo, total: Number(i.TotalAmt) || 0,
          balance: Number(i.Balance) || 0,
          linked_estimate_qbo_id: linked ? String(linked.TxnId) : null,
          division: d.division, av_pct: d.av_pct, electric_pct: d.electric_pct,
          line_items: JSON.stringify((i.Line ?? []).map((l: any) => ({
            desc: l.Description ?? null, amount: Number(l.Amount) || 0,
          }))),
        });
      }

      for (const b of bills) {
        const vendorRef  = b.VendorRef?.value ? String(b.VendorRef.value) : null;
        const vendorName = b.VendorRef?.name ?? null;
        if (vendorRef) seenVendor.run(vendorRef, vendorName);
        // Bills attach to a project per line item (billable CustomerRef).
        const lineCustomer = (b.Line ?? [])
          .map((l: any) => l.AccountBasedExpenseLineDetail?.CustomerRef
                        ?? l.ItemBasedExpenseLineDetail?.CustomerRef)
          .find((c: any) => c?.value);
        const customerRef  = lineCustomer?.value ? String(lineCustomer.value) : null;
        const customerName = lineCustomer?.name ?? null;
        const projectId    = matchProject(customerRef, customerName);
        const rule = vendorRef ? vendorRules.get(vendorRef) : undefined;
        const isOutside = rule?.is_outside_labor ? 1 : 0;
        const rate = rule?.hourly_rate || 53;
        const total = Number(b.TotalAmt) || 0;
        upBill.run({
          qbo_id: String(b.Id), project_id: projectId, customer_ref: customerRef,
          vendor_ref: vendorRef, vendor_name: vendorName,
          doc_number: b.DocNumber ?? null, txn_date: b.TxnDate ?? null,
          memo: b.PrivateNote ?? null, total,
          is_outside_labor: isOutside,
          derived_hours: isOutside && rate > 0 ? total / rate : 0,
        });
      }
    })();

    db.prepare(`
      UPDATE qbo_sync_log SET finished_at = datetime('now'), status = 'ok',
        estimates = ?, invoices = ?, bills = ?, orphans = ?, unmapped = ?
      WHERE id = ?
    `).run(estimates.length, invoices.length, bills.length, orphans, unmapped.size, logId);

    return {
      logId, estimates: estimates.length, invoices: invoices.length,
      bills: bills.length, orphans, unmapped: [...unmapped].sort(),
    };
  } catch (e: any) {
    db.prepare(`
      UPDATE qbo_sync_log SET finished_at = datetime('now'), status = 'error', error = ?
      WHERE id = ?
    `).run(String(e?.message ?? e), logId);
    throw e;
  }
}
