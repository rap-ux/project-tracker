export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import Navbar from "@/components/Navbar";
import ReportsSubnav from "@/components/reports/ReportsSubnav";
import { reportsConfigured, reportsUser } from "@/lib/reports/access";

// Gate for the whole Daily Reports section. Pages and actions ALSO call
// requireReportsUser() themselves; the layout is the visible shell, not the
// only line of defense.
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");
  const role = (session.user as { role?: string }).role ?? "foreman";
  const user = await reportsUser();

  return (
    <div className="min-h-screen flex flex-col bg-surface-2">
      <Navbar
        userName={session.user?.name ?? "User"}
        role={role}
        userEmail={session.user?.email ?? undefined}
        userTitle={(session.user as { title?: string })?.title ?? undefined}
      />
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 py-6 space-y-5">
        {user ? (
          <>
            <ReportsSubnav />
            {children}
          </>
        ) : (
          <div className="max-w-lg mx-auto mt-10 rounded-xl border border-border bg-surface p-6">
            <h1 className="text-lg font-semibold text-text">Daily Reports is restricted</h1>
            <p className="mt-2 text-sm text-muted">
              This section holds call recordings and transcripts, so it has its own access list.
              {reportsConfigured()
                ? " Your account is not on it. Ask Rafael to add you."
                : " No access list is configured yet (REPORTS_ALLOWED_EMAILS), so nobody can enter."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
