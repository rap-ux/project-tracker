export const dynamic = 'force-dynamic';
import { redirect } from "next/navigation";
import { auth }     from "@/auth";
import Navbar       from "@/components/Navbar";

export default async function HelpPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user      = session.user as any;
  const userName  = user?.name  ?? "User";
  const userEmail = user?.email ?? "";
  const userTitle = user?.title ?? "";
  const role      = user?.role  ?? "user";

  return (
    <>
      <Navbar userName={userName} role={role} userEmail={userEmail} userTitle={userTitle} />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 text-text">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-text">Switchboard Help &amp; Guide</h1>
          <p className="text-sm text-muted mt-2">
            New here? Start with the quick-start. Stuck on a term? Check the glossary.
            Need to do something specific? Jump to the how-to&apos;s.
          </p>

          {/* ── In-page nav ───────────────────────────────────────────────── */}
          <nav className="mt-6 flex flex-wrap gap-2 text-xs">
            {[
              ["overview",    "Overview"],
              ["quick-start", "Quick Start"],
              ["glossary",    "Glossary"],
              ["how-tos",     "How-to’s"],
              ["features",    "Feature Index"],
            ].map(([id, label]) => (
              <a key={id} href={`#${id}`}
                 className="px-3 py-1.5 rounded-full border border-border bg-surface text-text hover:border-cyan-400 hover:text-accent transition-colors">
                {label}
              </a>
            ))}
          </nav>
        </header>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <section id="overview" className="mb-10 scroll-mt-20">
          <h2 className="text-xl font-bold text-text mb-3">What is Switchboard?</h2>
          <p className="leading-relaxed">
            Switchboard is Totally Wired Electric&apos;s project tracking and operations
            dashboard. It brings project schedules, financials, hours tracking, foreman
            bonuses, and team activity into a single live view. Use it to know — at any
            moment — which projects need attention, what cash is coming in, and how every
            job is pacing against budget.
          </p>
        </section>

        {/* ── Quick Start ──────────────────────────────────────────────────── */}
        <section id="quick-start" className="mb-10 scroll-mt-20">
          <h2 className="text-xl font-bold text-text mb-3">First-time quick start</h2>
          <p className="text-sm text-muted mb-4">Five steps to get oriented in under two minutes.</p>
          <ol className="space-y-3">
            {[
              ["Land on the Home page.", "The top panel — “What needs your attention” — shows any flagged projects. The middle row gives four KPIs across the whole portfolio."],
              ["Open the Dashboard.", "This is the master project list. Click any row to view details, edit fields, or check stage progress."],
              ["Visit Forecast.", "See the next 30 days of expected milestone receipts and the cash-flow chart by month."],
              ["Check the Alerts feed.", "Bell icon, top of every page. Materials over budget, hours risk, stale data, and @mentions all surface here."],
              ["Bookmark this Help page.", "Glossary and how-to’s are below."],
            ].map(([title, body], i) => (
              <li key={i} className="flex gap-3">
                <span className="shrink-0 w-7 h-7 rounded-full bg-cyan-500 text-white text-sm font-bold flex items-center justify-center">{i + 1}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Glossary ─────────────────────────────────────────────────────── */}
        <section id="glossary" className="mb-10 scroll-mt-20">
          <h2 className="text-xl font-bold text-text mb-3">Glossary</h2>
          <div className="overflow-hidden border border-border rounded-xl">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {[
                  ["Tracked Project", "A signed-contract project. Counts toward all KPIs."],
                  ["Minor Project", "Pre-contract or small job. Tracked separately on the Minor Projects toggle."],
                  ["Stage", "Phase of construction. In order: Pre-Construction → Underground → Rough → Finish → Extras."],
                  ["Stage Completion", "How far the project is through its current stage (0–100%)."],
                  ["Project Completion", "Auto-calculated. Rough = 70% weight, Finish = 30% weight, Extras = 100%."],
                  ["Rough / Finish Hours Allowed", "Budget hours allocated to the stage by the estimator. Manual entry."],
                  ["Rough / Finish Hours Actual", "Hours actually logged for the stage. Auto-snapshotted at stage transitions; can be manually edited if needed."],
                  ["Goal Hours", "Internal stretch target, often tighter than estimated hours. Drives the foreman bonus tier."],
                  ["Hours vs Goal", "Actual hours compared to the goal. Negative = under goal (good); positive = over."],
                  ["Materials Burn", "% of materials budget already spent. Over 100% means materials are over budget."],
                  ["Contract Value", "Original signed contract dollar amount."],
                  ["Invoiced", "Cumulative amount billed to date."],
                  ["Milestone", "A trigger point that releases an invoice (e.g., Underground Start, Rough Completion)."],
                  ["Receipt Date", "Estimated date cash is actually received (milestone date + payment delay)."],
                  ["Change Order (CO)", "A contract amendment for added or modified scope. Status: Quoted / Approved / Invoiced / Completed."],
                  ["Foreman", "The lead assigned to a project. Earns stage-based bonuses based on budget performance."],
                  ["@Mention", "Tag a teammate in a project comment using @FirstName. They get a notification."],
                  ["QBO", "QuickBooks Online — the source of truth for materials and hours. Imported via the Uploads page."],
                  ["Bonus tier", "Beat (under budget by >10%) / Met (within 10%) / Over (over budget) / Locked (in progress)."],
                ].map(([term, def]) => (
                  <tr key={term} className="hover:bg-surface-2">
                    <td className="px-4 py-3 font-semibold text-text whitespace-nowrap align-top w-56">{term}</td>
                    <td className="px-4 py-3 text-text">{def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── How-to's ─────────────────────────────────────────────────────── */}
        <section id="how-tos" className="mb-10 scroll-mt-20">
          <h2 className="text-xl font-bold text-text mb-3">How-to&apos;s</h2>
          <div className="space-y-5">
            {[
              ["Add a new project", "Dashboard → “+ New Project” → fill in name, foreman, stage, contract value, and dates → Save. To add a Minor / pipeline project, choose “Minor” as the type."],
              ["Update hours or materials", "Two ways: manually edit the project on Dashboard, or import a QBO/Excel file via Uploads. Imports show a preview before any change is applied."],
              ["Mark a stage complete", "Open the project on Dashboard or Timeline → set Stage Completion to 100% → Save. The system auto-snapshots Rough or Finish hours actual at the right moments."],
              ["Set or override a milestone date", "Forecast page → click any milestone date in the table → enter the override → Save. Default dates flow from Timeline; manual overrides take precedence on Forecast."],
              ["Add a Change Order", "Open the project detail → Change Orders tab → “+ Add CO” → fill description, amount, status → Save. The CO is logged to the activity feed."],
              ["Comment on a project / @mention someone", "Project detail → Comments tab → type a message, add @FirstName to tag a teammate. They’ll see an alert on their home page."],
              ["Read your bonus progress", "Foremen are auto-redirected to the Foreman page at login. Top card shows current earned vs maximum bonus; per-project status indicates Beat / Met / Over / Locked."],
              ["Upload QBO data", "Uploads page → drop a .xlsx or .csv export from QuickBooks → review the staged batch → Apply. Wrong batch? Use Revert."],
              ["Export a CSV", "Dashboard, Forecast, and Clients each have an export button. Whatever you have filtered is what gets exported."],
              ["Dismiss an alert", "Click the bell icon in the top nav → dismiss any alert you’ve handled. Dismissals are per-user."],
            ].map(([title, body]) => (
              <div key={title} className="border-l-4 border-cyan-400 pl-4">
                <h3 className="font-semibold text-text">{title}</h3>
                <p className="text-sm text-text mt-1">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Feature Index ────────────────────────────────────────────────── */}
        <section id="features" className="mb-10 scroll-mt-20">
          <h2 className="text-xl font-bold text-text mb-3">Full feature index</h2>
          <p className="text-sm text-muted mb-5">
            Everything Switchboard can do, organized by page. The italicized line under each page tells you where to click.
          </p>

          <div className="space-y-6">
            {([
              {
                heading: "Home",
                where:   "The default page when you log in (or click the logo).",
                items: [
                  "“What needs your attention” panel — flagged projects with status (Critical / At-Risk / Watch / On-Track)",
                  "Portfolio Snapshot KPIs: Upcoming Cash (30 days), Tracked Projects, Avg Materials Burn, Hours vs Goal",
                  "Upcoming Milestones — next 30 days with dollar amounts",
                  "Recent activity feed (with @mention notifications)",
                  "QBO staleness banner if upload data is more than 7 days old",
                ],
              },
              {
                heading: "Dashboard",
                where:   "“Dashboard” in the top nav.",
                items: [
                  "Tracked / Minor Projects toggle",
                  "Per-project rows: stage, contract value, invoiced %, materials burn, hours vs goal, profit margin, status flags",
                  "Per-foreman filter, search, mobile card view + desktop table",
                  "Inline edit on every project field",
                  "CSV export of filtered rows",
                  "Project create / edit form",
                ],
              },
              {
                heading: "Forecast",
                where:   "“Forecast” in the top nav.",
                items: [
                  "Cash-flow matrix by milestone and date",
                  "Milestone date editor with manual overrides per project",
                  "Stat cards: Upcoming Cash, Tracked Remaining Unbilled, Tracked Projects",
                  "Cash-flow chart (area + cumulative line) and CSV export",
                  "Reconciliation hint comparing forecast vs actual invoiced",
                ],
              },
              {
                heading: "Timeline",
                where:   "“Timeline” in the top nav.",
                items: [
                  "Visual stage scheduler (Underground → Rough → Finish → Extras) with start/end dates",
                  "Per-stage status (In Progress / Complete) and free-text notes",
                  "Dates auto-feed Forecast unless manually overridden there",
                  "Portfolio view grouped by foreman",
                ],
              },
              {
                heading: "Analytics",
                where:   "“Analytics” in the top nav.",
                items: [
                  "Margin chart (Bar / Line / Pie toggle)",
                  "Cash-flow chart (area + cumulative)",
                  "Per-foreman performance table aggregated across tracked projects",
                  "Blended-wage input per project for cost calculations",
                ],
              },
              {
                heading: "Bonuses",
                where:   "“Bonuses” in the top nav.",
                items: [
                  "Per-foreman bonus dashboards: earned vs eligible, broken into Rough and Finish tiers",
                  "Tier table (meet / beat / max payouts by contract size)",
                  "Per-project status: Beat / Met / Over / Locked-in-progress",
                ],
              },
              {
                heading: "Inputs",
                where:   "“Inputs” in the top nav.",
                items: [
                  "Per-project cost-model defaults (gross margin %, materials/wages share, blended labor rate)",
                  "Per-stage hour estimates (Rough / Finish)",
                  "Bulk edit across projects",
                ],
              },
              {
                heading: "Uploads",
                where:   "“Uploads” in the top nav.",
                items: [
                  "QBO / Excel / CSV file import (materials, hours, GL codes)",
                  "Batch staging — preview line-by-line before applying",
                  "Apply / Revert batch",
                  "Upload history with timestamps and change counts",
                ],
              },
              {
                heading: "Clients",
                where:   "“Clients” in the top nav.",
                items: [
                  "Project & client roster: builder, GC contact, phone, region, Basecamp/Drive links",
                  "Contract value + invoiced summary",
                  "Tracked / Minor toggle",
                  "Print-friendly export",
                ],
              },
              {
                heading: "Foreman view",
                where:   "Foremen are auto-redirected here at login.",
                items: [
                  "Foreman’s own projects only",
                  "Bonus-progress card (current vs max)",
                  "Per-project KPIs: stage, hours variance, contract value, per-stage bonus status",
                ],
              },
              {
                heading: "Cross-cutting — Alerts feed",
                where:   "Bell icon in the top nav, on every page.",
                items: [
                  "Materials over budget (critical)",
                  "Hours-risk (>90% spent at <80% stage completion)",
                  "QBO staleness (warning at 7d, critical at 14d)",
                  "Missing Timeline dates on tracked projects",
                  "@mentions in project comments",
                  "Dismissible per user",
                ],
              },
              {
                heading: "Cross-cutting — Comments & @Mentions",
                where:   "Each project’s detail panel → Comments tab.",
                items: [
                  "Free-form comments with @FirstName mention syntax",
                  "Mentions trigger alerts on the recipient’s home page",
                  "All comments logged to the project activity feed",
                ],
              },
              {
                heading: "Cross-cutting — Change Orders",
                where:   "Each project’s detail panel → Change Orders tab.",
                items: [
                  "Description, amount, date, status (Quoted / Approved / Invoiced / Completed)",
                  "Logged to activity feed",
                ],
              },
              {
                heading: "Cross-cutting — Activity logging",
                where:   "Home page “Recent Activity” + per-project tabs.",
                items: [
                  "Tracked actions: stage changes, hours/materials updates, comments, COs, milestone-date edits, imports, project create",
                ],
              },
              {
                heading: "Cross-cutting — Auto-calculations",
                where:   "Run silently in the background — no setup required.",
                items: [
                  "Project completion = 70% Rough + 30% Finish (Extras = 100%)",
                  "Rough hours actual snapshot at Rough → Finish transition",
                  "Finish hours actual snapshot at project completion",
                ],
              },
              {
                heading: "Cross-cutting — Exports",
                where:   "Export buttons on individual pages.",
                items: [
                  "Dashboard CSV (filtered)",
                  "Forecast cash-flow CSV",
                  "Clients directory (print-friendly)",
                ],
              },
            ] as const).map(g => (
              <div key={g.heading} className="border border-border rounded-xl p-5 bg-surface">
                <h3 className="font-bold text-text">{g.heading}</h3>
                <p className="text-xs italic text-muted mt-1 mb-3">Where to find it: {g.where}</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-text">
                  {g.items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-12 pt-6 border-t border-border text-xs text-subtle">
          Need something not covered here? Tell Rafael — Switchboard ships updates several times a week.
        </footer>
      </main>
    </>
  );
}
