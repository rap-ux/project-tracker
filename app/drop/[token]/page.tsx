export const dynamic = "force-dynamic";
// Public drop box for the Operations Log. The URL carries a secret token
// (REPORTS_DROP_TOKEN); the page only accepts uploads and never shows data.
import DropForm from "@/components/reports/DropForm";
import { CALLERS, todayISO } from "@/lib/reports/schema";

export default async function DropPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = !!process.env.REPORTS_DROP_TOKEN && token === process.env.REPORTS_DROP_TOKEN;

  return (
    <div className="min-h-screen bg-surface-2 flex flex-col">
      <header className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: "#101010" }}>
        <img src="/twe-logo.png" alt="Totally Wired Electric" className="h-8 w-auto" />
        <span className="text-white/80 text-sm font-medium">Operations Log · drop box</span>
      </header>
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6">
        {valid ? (
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div>
              <h1 className="text-lg font-semibold text-text">Send an end-of-day call</h1>
              <p className="text-sm text-muted">Paste the transcript or attach the recording. It lands as a draft for review.</p>
            </div>
            <DropForm token={token} today={todayISO()} callers={CALLERS} />
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h1 className="text-lg font-semibold text-text">This link is not active</h1>
            <p className="mt-1 text-sm text-muted">Ask Rafael for the current drop-box link.</p>
          </div>
        )}
      </main>
    </div>
  );
}
