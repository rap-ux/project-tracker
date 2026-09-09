// Access gate for the Daily Reports section.
//
// Transcripts and audio are recordings of employees and customers, so this
// section has its OWN allow-list, separate from the general Switchboard login.
// A Switchboard user who is not on REPORTS_ALLOWED_EMAILS cannot see any of it,
// regardless of role. Fails CLOSED when the env var is unset.
//
//   REPORTS_ALLOWED_EMAILS=rap@totallywiredelectric.com,cole@totallywiredelectric.com,...
import { redirect } from "next/navigation";
import { auth } from "@/auth";

function allowList(): string[] {
  return (process.env.REPORTS_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function reportsConfigured(): boolean {
  return allowList().length > 0;
}

export function canAccessReports(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowList().includes(email.toLowerCase());
}

export type ReportsUser = { name: string; email: string; role: string; title?: string };

/** Session user if signed in and on the allow-list; otherwise null. */
export async function reportsUser(): Promise<ReportsUser | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!session || !canAccessReports(email)) return null;
  const u = session.user as { name?: string | null; role?: string; title?: string };
  return { name: u.name ?? "Unknown", email: email!, role: u.role ?? "foreman", title: u.title };
}

/** Page/action guard. Redirects to login or the no-access page. */
export async function requireReportsUser(): Promise<ReportsUser> {
  const session = await auth();
  if (!session) redirect("/login");
  const user = await reportsUser();
  if (!user) redirect("/reports/no-access");
  return user;
}
