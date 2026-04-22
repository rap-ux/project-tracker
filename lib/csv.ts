// ── Simple CSV export helper (client-side) ───────────────────────────────────

function escapeCell(v: any): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(rows: Record<string, any>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]).map(k => ({ key: k, label: k }));
  const header = cols.map(c => escapeCell(c.label)).join(",");
  const body = rows.map(r => cols.map(c => escapeCell(r[c.key])).join(",")).join("\n");
  return header + "\n" + body;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
