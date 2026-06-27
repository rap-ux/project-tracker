import db from "@/lib/db";

// Most recent moment the financial data was refreshed (latest applied sync,
// else latest upload). Used for the "data as of" stamp on financial screens.
export function getLastSync(): string | null {
  const row = db.prepare(`
    SELECT MAX(ts) AS ts FROM (
      SELECT applied_at AS ts FROM import_batches WHERE status = 'applied'
      UNION ALL
      SELECT uploaded_at AS ts FROM uploads
    )
  `).get() as { ts: string | null };
  return row?.ts ?? null;
}
