"use client";

import { useState, useRef } from "react";
import type { ProjectData, PortfolioData } from "@/app/report/page";

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$ = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
const fmtHrs = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtVariance = (hrs: number) => `${hrs >= 0 ? "+" : ""}${Math.round(hrs)}`;

function weekOf(d: Date) {
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return mon.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const isEarly = (p: ProjectData) =>
  p.incentive.rough.status === "too-early" || p.stage === "Contracting Phase";

function stageLabel(p: ProjectData) {
  return `${p.stage} (${Math.round(p.stage_completion * 100)}%)`;
}

// ── Auto-narrative generators ─────────────────────────────────────────────────
function buildInsights(
  projects: ProjectData[], portfolio: PortfolioData,
  assessable: ProjectData[], pos: ProjectData[], watch: ProjectData[], early: ProjectData[],
): string[] {
  const underPct = Math.round((portfolio.underBudgetCount / Math.max(assessable.length, 1)) * 100);
  const matPct   = portfolio.totalEstMaterials > 0
    ? portfolio.totalActualMaterials / portfolio.totalEstMaterials : 0;

  const lines: string[] = [];

  lines.push(
    `Portfolio labor health is ${underPct >= 60 ? "generally healthy" : underPct >= 40 ? "mixed" : "under pressure"}, ` +
    `with ~${underPct}% of assessable projects currently pacing within their allowed labor hours.`
  );

  if (watch.length > 0) {
    const top = watch.slice(0, 3).map(p =>
      `${p.name} (+${Math.round(-p.varianceHours)} hrs, ${Math.round(-p.variancePct * 100)}% over)`
    );
    lines.push(`${watch.length} project${watch.length > 1 ? "s" : ""} require active management: ${top.join("; ")}.`);
  }

  if (pos.length > 0) {
    const names = pos.slice(0, 3).map(p => p.name);
    lines.push(`${names.join(", ")} ${names.length === 1 ? "continues" : "continue"} to hold solid labor positions under budget.`);
  }

  lines.push(
    `Portfolio materials are tracking at ${fmtPct(matPct)} of budget ` +
    `(${fmt$(portfolio.totalActualMaterials)} of ${fmt$(portfolio.totalEstMaterials)} estimated) — ` +
    `${matPct < 0.85 ? "generally aligned across most projects." : matPct < 1.0 ? "approaching budget ceiling on several projects." : "over budget on some projects — review purchasing."}`
  );

  return lines;
}

function buildMaterialsNarrative(projects: ProjectData[]): string {
  const over  = projects.filter(p => p.materialsPct > 1.0).sort((a, b) => b.materialsPct - a.materialsPct);
  const watch = projects.filter(p => p.materialsPct >= 0.85 && p.materialsPct <= 1.0);
  const ok    = projects.filter(p => p.materialsPct > 0 && p.materialsPct < 0.85);

  let s = "Materials remain ";
  if (over.length === 0 && watch.length <= 2) {
    s += "generally aligned with budget across most of the portfolio. ";
  } else {
    s += "mixed across the portfolio. ";
  }
  if (over.length > 0) {
    s += `${over.map(p => `${p.name} (${fmtPct(p.materialsPct)} of budget)`).join(", ")} ` +
      `${over.length === 1 ? "is" : "are"} over the materials budget — ` +
      "recommend confirming whether this reflects early finish material purchasing or a baseline estimation gap. ";
  }
  if (watch.length > 0) {
    s += `${watch.map(p => p.name).join(", ")} ${watch.length === 1 ? "is" : "are"} approaching the materials budget ceiling and should be monitored closely.`;
  }
  return s.trim();
}

// ── Plain-text generator (for email paste) ────────────────────────────────────
function buildPlainText(
  projects: ProjectData[], portfolio: PortfolioData,
  pos: ProjectData[], watch: ProjectData[], early: ProjectData[],
  insights: string[], week: string, userName: string,
): string {
  const assessable = projects.filter(p => !isEarly(p));
  const underPct = Math.round((portfolio.underBudgetCount / Math.max(assessable.length, 1)) * 100);

  let t = `Weekly Profitability & Labor Efficiency Update (Week of ${week})\n\n`;

  t += `KEY INSIGHTS\n`;
  insights.forEach(l => { t += `• ${l}\n`; });

  t += `\nOVERALL SNAPSHOT — Portfolio Labor Health\n`;
  t += `• ${portfolio.totalProjects} projects tracked\n`;
  t += `• ~${underPct}% of assessable projects currently under allowed labor hours (${portfolio.underBudgetCount} projects)\n`;
  t += `• ~${100 - underPct}% of assessable projects currently over allowed labor hours (${portfolio.overBudgetCount} projects)\n`;
  t += `• ${portfolio.roughCompleteCount} project(s) have completed rough stage; ${portfolio.inFinishCount} actively in finish stage\n`;
  if (early.length > 0) {
    t += `• ${early.length} early-stage project(s) too early to assess — monitoring as crews progress\n`;
  }

  t += `\nFINANCIAL SNAPSHOT\n`;
  t += `• Total Contract Value: ${fmt$(portfolio.totalContractValue)}\n`;
  t += `• Total Invoiced: ${fmt$(portfolio.totalInvoiced)} (${fmtPct(portfolio.totalInvoiced / portfolio.totalContractValue)} billed)\n`;
  t += `• Materials: ${fmt$(portfolio.totalActualMaterials)} of ${fmt$(portfolio.totalEstMaterials)} budget (${fmtPct(portfolio.totalEstMaterials > 0 ? portfolio.totalActualMaterials / portfolio.totalEstMaterials : 0)})\n`;
  t += `• Total Hours: ${fmtHrs(portfolio.totalActualHours)} of ${fmtHrs(portfolio.totalEstHours)} estimated\n`;

  if (pos.length > 0) {
    t += `\nPOSITIVE PERFORMANCE\n`;
    pos.forEach(p => {
      const hrs = Math.round(p.varianceHours);
      const pct = Math.round(p.variancePct * 100);
      t += `🟢 ${p.name} — ${fmtHrs(hrs)} hrs under allowed (${pct}%) at ${stageLabel(p)}.\n`;
    });
  }

  if (watch.length > 0) {
    t += `\nWATCH ITEMS\n`;
    watch.forEach(p => {
      const hrs = Math.round(-p.varianceHours);
      const pct = Math.round(-p.variancePct * 100);
      t += `🟡 ${p.name} — +${fmtHrs(hrs)} hrs over allowed (${pct}% over) at ${stageLabel(p)}.\n`;
    });
  }

  if (early.length > 0) {
    t += `\nEARLY STAGE\n`;
    t += `🟢 ${early.map(p => p.name).join(", ")} — All in early rough stage — too early to assess. Will monitor as crews progress.\n`;
  }

  t += `\nMATERIALS\n${buildMaterialsNarrative(projects)}\n`;

  // Project table
  const byForeman = new Map<string, ProjectData[]>();
  for (const p of projects) {
    if (!byForeman.has(p.foreman)) byForeman.set(p.foreman, []);
    byForeman.get(p.foreman)!.push(p);
  }

  t += `\nPROJECT SNAPSHOTS\n`;
  for (const [foreman, fps] of byForeman.entries()) {
    t += `\n${foreman} Projects\n`;
    t += `${"─".repeat(80)}\n`;
    fps.forEach(p => {
      t += `${p.name.padEnd(28)} Stage: ${p.stage} ${Math.round(p.stage_completion * 100)}%  `;
      t += `Contract: ${fmt$(p.contract_value)}  Invoiced: ${fmt$(p.total_invoiced)} (${fmtPct(p.invoicedPct)})\n`;
      t += `${"".padEnd(28)} Materials: ${fmt$(p.effectiveMaterials)} / ${fmt$(p.est_materials_budget)} (${fmtPct(p.materialsPct)})\n`;
      t += `${"".padEnd(28)} Hours: ${fmtHrs(p.effectiveHours)} actual / ${fmtHrs(p.goal_hours)} goal  Variance: ${fmtVariance(p.varianceHours)} hrs (${fmtPct(Math.abs(p.variancePct))} ${p.variancePct >= 0 ? "under" : "over"})\n`;
      t += `${"".padEnd(28)} Rough: ${fmtHrs(p.rough_hours_actual)}/${fmtHrs(p.rough_hours_allowed)}  Finish: ${fmtHrs(p.finish_hours_actual)}/${fmtHrs(p.finish_hours_allowed)}\n\n`;
    });
  }

  t += `Best,\n${userName.split(" ")[0] || "Rap"}\n`;
  return t;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-xl font-bold ${highlight ? "text-blue-900" : "text-gray-900"}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function PerfRow({ p, type }: { p: ProjectData; type: "pos" | "watch" }) {
  const hrs = Math.round(Math.abs(p.varianceHours));
  const pct = Math.round(Math.abs(p.variancePct) * 100);
  const bonus = p.incentive.rough.status === "beat" || p.incentive.finish.status === "beat"
    ? " Budget Beat ✓"
    : p.incentive.rough.status === "meet" || p.incentive.finish.status === "meet"
      ? " Budget Met ✓" : "";

  const msg = type === "pos"
    ? `${p.name} pacing ${fmtHrs(hrs)} hours under allowed (${pct}%) at ${stageLabel(p)}.${bonus}`
    : `${p.name} +${fmtHrs(hrs)} hours over allowed (${pct}% over) at ${stageLabel(p)}. ${
        p.stage_completion >= 0.9
          ? "Approaching completion with no sign of recovery."
          : p.stage_completion >= 0.7
            ? "Overage is significant — check sequencing, rework, and unformalized COs."
            : "Monitor closely — review crew allocation, site conditions, and any unformalized COs."
      }`;

  return (
    <div className="flex gap-2 text-sm text-gray-800 leading-snug">
      <span>{type === "pos" ? "🟢" : "🟡"}</span>
      <span>{msg}</span>
    </div>
  );
}

function ProjectTable({ projects }: { projects: ProjectData[] }) {
  const cols = [
    { label: "Project",          w: "min-w-[140px]" },
    { label: "Stage / %",        w: "min-w-[120px]" },
    { label: "Contract Value",   w: "min-w-[110px]" },
    { label: "Invoiced / %",     w: "min-w-[120px]" },
    { label: "Mat Budget",       w: "min-w-[100px]" },
    { label: "Actual Mat / %",   w: "min-w-[120px]" },
    { label: "Mat Remaining",    w: "min-w-[110px]" },
    { label: "Est Hrs",          w: "min-w-[80px]"  },
    { label: "Act Hrs / %",      w: "min-w-[100px]" },
    { label: "Goal Hrs",         w: "min-w-[80px]"  },
    { label: "Variance",         w: "min-w-[110px]" },
    { label: "Rough Allow/Act",  w: "min-w-[120px]" },
    { label: "Finish Allow/Act", w: "min-w-[120px]" },
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 print:overflow-visible">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-700 text-white">
            {cols.map(c => (
              <th key={c.label} className={`px-2 py-2 text-left font-semibold whitespace-nowrap ${c.w}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => {
            const overMat  = p.materialsPct > 1.0;
            const overHrs  = p.variancePct < -0.1;
            const aheadHrs = p.variancePct > 0.1;
            return (
              <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                <td className="px-2 py-2 font-medium text-gray-900">{p.name}</td>
                <td className="px-2 py-2 text-gray-700">{p.stage}<br /><span className="text-gray-400">{Math.round(p.stage_completion * 100)}% / proj {Math.round(p.project_completion * 100)}%</span></td>
                <td className="px-2 py-2 text-gray-700">{fmt$(p.contract_value)}</td>
                <td className="px-2 py-2 text-gray-700">{fmt$(p.total_invoiced)}<br /><span className="text-gray-400">{fmtPct(p.invoicedPct)}</span></td>
                <td className="px-2 py-2 text-gray-700">{fmt$(p.est_materials_budget)}</td>
                <td className={`px-2 py-2 font-medium ${overMat ? "text-red-700" : "text-gray-700"}`}>
                  {fmt$(p.effectiveMaterials)}<br />
                  <span className={overMat ? "text-red-500" : "text-gray-400"}>{fmtPct(p.materialsPct)}</span>
                </td>
                <td className={`px-2 py-2 ${p.materialsRemaining < 0 ? "text-red-700 font-medium" : "text-gray-700"}`}>
                  {fmt$(p.materialsRemaining)}
                </td>
                <td className="px-2 py-2 text-gray-700">{fmtHrs(p.est_total_hours)}</td>
                <td className="px-2 py-2 text-gray-700">
                  {fmtHrs(p.effectiveHours)}<br />
                  <span className="text-gray-400">{fmtPct(p.hoursTobudgetPct)}</span>
                </td>
                <td className="px-2 py-2 text-gray-700">{fmtHrs(p.goal_hours)}</td>
                <td className={`px-2 py-2 font-semibold ${overHrs ? "text-red-700" : aheadHrs ? "text-green-700" : "text-gray-700"}`}>
                  {fmtVariance(p.varianceHours)} hrs<br />
                  <span className="font-normal text-gray-400">{fmtPct(Math.abs(p.variancePct))} {p.variancePct >= 0 ? "↓" : "↑"}</span>
                </td>
                <td className="px-2 py-2 text-gray-700">
                  {fmtHrs(p.rough_hours_allowed)} / {fmtHrs(p.rough_hours_actual)}
                </td>
                <td className="px-2 py-2 text-gray-700">
                  {fmtHrs(p.finish_hours_allowed)} / {fmtHrs(p.finish_hours_actual)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StageDistribution({ projects }: { projects: ProjectData[] }) {
  const groups: { label: string; filter: (p: ProjectData) => boolean }[] = [
    { label: "In Finish stage",           filter: p => p.stage === "Finish" || p.stage === "Extras" },
    { label: "100% Rough completion",     filter: p => p.stage === "Rough" && p.stage_completion >= 1.0 },
    { label: "~90% Rough completion",     filter: p => p.stage === "Rough" && p.stage_completion >= 0.85 && p.stage_completion < 1.0 },
    { label: "~70–85% Rough completion",  filter: p => p.stage === "Rough" && p.stage_completion >= 0.65 && p.stage_completion < 0.85 },
    { label: "~50–70% Rough completion",  filter: p => p.stage === "Rough" && p.stage_completion >= 0.45 && p.stage_completion < 0.65 },
    { label: "Early rough stage (≤20%)",  filter: p => (p.stage === "Rough" || p.stage === "Underground") && p.stage_completion <= 0.20 },
    { label: "Contracting phase",         filter: p => p.stage === "Contracting Phase" },
  ];

  return (
    <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-800">
      {groups.map(g => {
        const count = projects.filter(g.filter).length;
        const names = projects.filter(g.filter).map(p => p.name);
        if (count === 0) return null;
        return (
          <li key={g.label}>
            <strong>{count}</strong> project{count !== 1 ? "s" : ""} — {g.label}
            {count <= 4 && names.length > 0 && (
              <span className="text-gray-500"> ({names.join(", ")})</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface Props {
  projects: ProjectData[];
  portfolio: PortfolioData;
  generatedAt: string;
  userName: string;
}

export default function InsightsReport({ projects, portfolio, generatedAt, userName }: Props) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const date    = new Date(generatedAt);
  const week    = weekOf(date);
  const dateStr = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const earlyProjects = projects.filter(isEarly);
  const assessable    = projects.filter(p => !isEarly(p));
  const posProjects   = assessable.filter(p => p.variancePct >= 0).sort((a, b) => b.variancePct - a.variancePct);
  const watchProjects = assessable.filter(p => p.variancePct < 0).sort((a, b) => a.variancePct - b.variancePct);

  const byForeman = new Map<string, ProjectData[]>();
  for (const p of projects) {
    if (!byForeman.has(p.foreman)) byForeman.set(p.foreman, []);
    byForeman.get(p.foreman)!.push(p);
  }

  const insights = buildInsights(projects, portfolio, assessable, posProjects, watchProjects, earlyProjects);

  async function handleCopy() {
    const html = reportRef.current?.innerHTML ?? "";
    const plain = buildPlainText(projects, portfolio, posProjects, watchProjects, earlyProjects, insights, week, userName);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html":  new Blob([`<html><body style="font-family:Arial,sans-serif;font-size:14px;color:#111;">${html}</body></html>`], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      setCopyStatus("copied");
    } catch {
      try {
        await navigator.clipboard.writeText(plain);
        setCopyStatus("copied");
      } catch {
        setCopyStatus("error");
      }
    }
    setTimeout(() => setCopyStatus("idle"), 2500);
  }

  const matPct = portfolio.totalEstMaterials > 0 ? portfolio.totalActualMaterials / portfolio.totalEstMaterials : 0;
  const underPct = Math.round((portfolio.underBudgetCount / Math.max(assessable.length, 1)) * 100);

  return (
    <>
      {/* ── Toolbar ── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-6 py-3 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold text-gray-900">Weekly Profitability & Labor Efficiency Report</h1>
          <p className="text-xs text-gray-500">Week of {week} · {dateStr}</p>
        </div>
        <div className="flex gap-3 shrink-0">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              copyStatus === "copied" ? "bg-green-50 border-green-300 text-green-700" :
              copyStatus === "error"  ? "bg-red-50 border-red-300 text-red-700" :
              "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {copyStatus === "copied" ? "✓ Copied!" : copyStatus === "error" ? "✗ Copy failed" : "📋 Copy for Email"}
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#00BAD6] hover:bg-[#00a5bf] transition-colors"
          >
            🖨 Save as PDF
          </button>
        </div>
      </div>

      {/* ── Report ── */}
      <div ref={reportRef} className="max-w-6xl mx-auto w-full px-8 py-8 bg-white my-6 rounded-xl shadow-sm print:shadow-none print:my-0 print:rounded-none print:px-8">

        {/* Header */}
        <div className="mb-6 pb-4 border-b-2 border-gray-900">
          <h1 className="text-2xl font-bold text-gray-900">Weekly Profitability & Labor Efficiency Update (Week of {week})</h1>
          <p className="text-gray-500 text-sm mt-1">{dateStr}</p>
        </div>

        {/* Key Insights */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">Key Insights</h2>
          <ul className="list-disc pl-5 space-y-1">
            {insights.map((line, i) => <li key={i} className="text-sm text-gray-800">{line}</li>)}
          </ul>
        </section>

        {/* Overall Snapshot */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-3">Overall Snapshot</h2>

          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Total Contract Value"  value={fmt$(portfolio.totalContractValue)} highlight />
            <KpiCard label="Total Invoiced"        value={fmt$(portfolio.totalInvoiced)}       sub={fmtPct(portfolio.totalInvoiced / portfolio.totalContractValue) + " billed"} />
            <KpiCard label="Total Materials"       value={fmt$(portfolio.totalActualMaterials)} sub={`${fmtPct(matPct)} of ${fmt$(portfolio.totalEstMaterials)} budget`} />
            <KpiCard label="Total Hours Logged"    value={fmtHrs(portfolio.totalActualHours) + " hrs"} sub={`of ${fmtHrs(portfolio.totalEstHours)} estimated`} />
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-1">Portfolio Labor Health</p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-gray-800">
            <li>{portfolio.totalProjects} projects tracked</li>
            <li>~{underPct}% of assessable projects currently pacing within allowed labor hours ({portfolio.underBudgetCount} projects)</li>
            <li>~{100 - underPct}% of assessable projects currently over allowed labor hours ({portfolio.overBudgetCount} projects)</li>
            <li>{portfolio.roughCompleteCount} project{portfolio.roughCompleteCount !== 1 ? "s" : ""} have completed the rough stage; {portfolio.inFinishCount} {portfolio.inFinishCount !== 1 ? "are" : "is"} actively in the finish stage</li>
            {earlyProjects.length > 0 && (
              <li>{earlyProjects.length} early-stage project{earlyProjects.length !== 1 ? "s are" : " is"} too early to assess — monitoring as crews progress past underground</li>
            )}
          </ul>
        </section>

        {/* Positive Performance */}
        {posProjects.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Positive Performance</h2>
            <div className="space-y-2">
              {posProjects.map(p => <PerfRow key={p.id} p={p} type="pos" />)}
            </div>
          </section>
        )}

        {/* Watch Items */}
        {watchProjects.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Watch Items</h2>
            <div className="space-y-2">
              {watchProjects.map(p => <PerfRow key={p.id} p={p} type="watch" />)}
            </div>
          </section>
        )}

        {/* Early Stage */}
        {earlyProjects.length > 0 && (
          <section className="mb-6">
            <h2 className="text-base font-bold text-gray-900 mb-2">Early Stage</h2>
            <div className="flex gap-2 text-sm text-gray-800">
              <span>🟢</span>
              <span>{earlyProjects.map(p => p.name).join(", ")} — All in early rough stage — too early to assess. Will monitor as crews progress.</span>
            </div>
          </section>
        )}

        {/* Stage Distribution */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">Stage Distribution</h2>
          <StageDistribution projects={projects} />
        </section>

        {/* Materials */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-2">Materials</h2>
          <p className="text-sm text-gray-800">{buildMaterialsNarrative(projects)}</p>
        </section>

        {/* Project Snapshots */}
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-900 mb-4">Project Snapshots</h2>
          {[...byForeman.entries()].map(([foreman, fps]) => (
            <div key={foreman} className="mb-6 print:break-inside-avoid">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">{foreman} Projects</p>
              <ProjectTable projects={fps} />
            </div>
          ))}
        </section>

        {/* Footer */}
        <div className="border-t border-gray-200 pt-4 text-sm text-gray-700">
          <p>Best,</p>
          <p className="mt-1 font-medium">{userName.split(" ")[0] || "Rap"}</p>
        </div>
      </div>
    </>
  );
}
