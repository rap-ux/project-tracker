export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { auth }     from "@/auth";
import Navbar       from "@/components/Navbar";
import db           from "@/lib/db";

interface AccessRow {
  id:           number;
  occurred_at:  string;
  ip_address:   string | null;
  user_agent:   string | null;
  page:         string | null;
  user_name:    string | null;
  user_email:   string | null;
  user_role:    string | null;
  city:         string | null;
  region:       string | null;
  country:      string | null;
  country_code: string | null;
}

// Best-effort device label from user-agent (avoid pulling in a parsing lib).
function shortDevice(ua: string | null): string {
  if (!ua) return "—";
  const browser =
    /Edg\//.test(ua)     ? "Edge"   :
    /Chrome\//.test(ua)  ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox":
    /Safari\//.test(ua)  ? "Safari" :
    "Browser";
  const os =
    /Windows NT/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua)   ? "macOS"   :
    /Android/.test(ua)    ? "Android" :
    /iPhone|iPad|iOS/.test(ua) ? "iOS" :
    /Linux/.test(ua)      ? "Linux"   :
    "—";
  return `${browser} · ${os}`;
}

function fmtWhen(iso: string): { abs: string; rel: string } {
  const dt = new Date(iso.replace(" ", "T") + "Z");
  const abs = dt.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
  const diffMs = Date.now() - dt.getTime();
  const m = Math.floor(diffMs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  const rel =
    m < 1   ? "just now"           :
    m < 60  ? `${m} min ago`       :
    h < 24  ? `${h} hr ago`        :
    d < 7   ? `${d} day${d === 1 ? "" : "s"} ago` :
    abs;
  return { abs, rel };
}

function fmtLocation(r: AccessRow): string {
  const parts = [r.city, r.region, r.country].filter(Boolean);
  if (parts.length === 0) {
    if (!r.ip_address) return "—";
    return `${r.ip_address} (location unknown)`;
  }
  return parts.join(", ");
}

export default async function AccessLogPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user      = session.user as any;
  const userName  = user?.name  ?? "User";
  const userEmail = user?.email ?? "";
  const userTitle = user?.title ?? "";
  const role      = user?.role  ?? "user";

  // Owners only — admins/foremen redirected away.
  if (role !== "owner") {
    redirect("/dashboard");
  }

  const rows = db.prepare(`
    SELECT le.id, le.occurred_at, le.ip_address, le.user_agent, le.page,
           u.name  AS user_name,
           u.email AS user_email,
           u.role  AS user_role,
           g.city, g.region, g.country, g.country_code
    FROM login_events le
    LEFT JOIN users         u ON u.id = le.user_id
    LEFT JOIN ip_geo_cache  g ON g.ip = le.ip_address
    ORDER BY le.occurred_at DESC
    LIMIT 200
  `).all() as AccessRow[];

  const total = (db.prepare("SELECT COUNT(*) AS n FROM login_events").get() as { n: number }).n;

  return (
    <>
      <Navbar userName={userName} role={role} userEmail={userEmail} userTitle={userTitle} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 text-text">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-text">Access Log</h1>
          <p className="text-sm text-muted mt-1">
            Each row is a session start — when a user opened the app fresh or returned after &gt;5 minutes idle.
            Showing the most recent 200 (of {total.toLocaleString()} total).
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="text-sm text-muted bg-surface-2 border border-border rounded-lg px-4 py-8 text-center">
            No access events recorded yet. New sessions will appear here as users sign in.
          </div>
        ) : (
          <div className="overflow-x-auto border border-border rounded-lg bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs font-semibold text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Location</th>
                  <th className="px-4 py-2 text-left">IP</th>
                  <th className="px-4 py-2 text-left">Device</th>
                  <th className="px-4 py-2 text-left">Landed on</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const w = fmtWhen(r.occurred_at);
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-surface-2">
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span title={w.abs}>{w.rel}</span>
                        <div className="text-xs text-subtle">{w.abs}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium text-text">{r.user_name ?? "(unknown)"}</div>
                        <div className="text-xs text-muted">
                          {r.user_email ?? "—"}{r.user_role ? ` · ${r.user_role}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtLocation(r)}</td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono text-xs text-muted">
                        {r.ip_address ?? "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-muted">
                        {shortDevice(r.user_agent)}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap text-xs text-muted font-mono">
                        {r.page ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
