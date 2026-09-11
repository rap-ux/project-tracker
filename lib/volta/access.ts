// Who is asking Volta, and what may they see.
//
// Volta reads whatever the asking user could read in the app:
//   - owners/admins: every project, financials, QBO, activity, and read-only SQL
//   - foremen:       only their own projects (same LIKE rule as /foreman), no SQL
//   - daily-report transcripts and facts: only if the user is on REPORTS_ALLOWED_EMAILS
// Slack users are mapped to Switchboard users by the email on their Slack profile.
import db from "@/lib/db";
import { isAdminRole } from "@/lib/auth-roles";
import { canAccessReports } from "@/lib/reports/access";

export interface VoltaUser {
  name: string;
  email: string;
  role: string;
  foremanName?: string;
  isAdmin: boolean;
  canReadReports: boolean;
  canSql: boolean;
}

function build(u: { name: string; email: string; role: string; foreman_name?: string | null }): VoltaUser {
  const isAdmin = isAdminRole(u.role);
  return {
    name: u.name,
    email: u.email,
    role: u.role,
    foremanName: u.foreman_name ?? undefined,
    isAdmin,
    canReadReports: canAccessReports(u.email),
    canSql: isAdmin,
  };
}

/** From a Next-Auth session (web widget). */
export function voltaUserFromSession(session: { user?: { name?: string | null; email?: string | null } } | null): VoltaUser | null {
  const email = session?.user?.email;
  if (!email) return null;
  const s = session!.user as { name?: string | null; role?: string; foremanName?: string };
  return build({ name: s.name ?? "User", email, role: s.role ?? "foreman", foreman_name: s.foremanName ?? null });
}

/** From an email (Slack, standalone service). Null when no Switchboard account. */
export function voltaUserFromEmail(email: string | null | undefined): VoltaUser | null {
  if (!email) return null;
  const row = db
    .prepare("SELECT name, email, role, foreman_name FROM users WHERE LOWER(email) = LOWER(?)")
    .get(email.trim()) as { name: string; email: string; role: string; foreman_name: string | null } | undefined;
  return row ? build(row) : null;
}

/** SQL fragment restricting projects to what this user may see. */
export function projectScope(user: VoltaUser, alias = "p"): { where: string; params: unknown[] } {
  if (user.isAdmin || !user.foremanName) return { where: "1=1", params: [] };
  return { where: `${alias}.foreman LIKE ?`, params: [`%${user.foremanName}%`] };
}
