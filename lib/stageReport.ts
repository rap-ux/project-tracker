import db from "@/lib/db";
import { notifySlack, appUrl } from "@/lib/slack";

// Per-stage profitability snapshot for field managers, requested by Cole D.
// One row per project, using the project's CURRENT stage:
//   Project · Stage · hours allotted for the stage · progress % ·
//   hours allotted based on progress (allot × progress) · actual hours
// Posted to Slack each time a sync is applied (the "data updated" moment).

interface StageRow {
  name:   string;
  stage:  string;
  allot:  number;   // total hours budgeted for the current stage
  prog:   number;   // 0..1 stage completion
  byProg: number;   // allot × prog — hours you "should" have spent so far
  actual: number;   // hours actually logged for this stage
}

// Map a project's current stage to that stage's allowed/actual hour columns.
// Contracting / Underground are pre-tracking, so they're skipped.
function rowFor(p: any): StageRow | null {
  const stage = String(p.stage ?? "");
  let allot: number, actual: number;

  if (stage === "Rough") {
    allot  = p.rough_hours_allowed  || 0;
    actual = p.rough_hours_actual   || 0;
  } else if (stage === "Finish" || stage === "Extras") {
    allot  = p.finish_hours_allowed || 0;
    actual = p.finish_hours_actual  || 0;
  } else {
    return null; // Contracting Phase / Underground — too early to track
  }

  if (allot <= 0) return null; // no budget set for this stage yet

  const prog = Math.max(0, Math.min(1, p.stage_completion || 0));
  return { name: p.name, stage, allot, prog, byProg: allot * prog, actual };
}

// When `projectIds` is given, the report is scoped to just those projects —
// used by the sync-apply trigger so each post shows only what changed. With no
// ids, it's a full-portfolio snapshot (the on-demand / manual send).
export function buildStageReport(projectIds?: number[] | null): string | null {
  const scoped = Array.isArray(projectIds);

  let raw: any[];
  if (scoped) {
    if (projectIds!.length === 0) return null;
    const ph = projectIds!.map(() => "?").join(",");
    raw = db.prepare(
      `SELECT * FROM projects WHERE is_pipeline = 0 AND id IN (${ph}) ORDER BY foreman, name`
    ).all(...projectIds!) as any[];
  } else {
    raw = db.prepare(
      "SELECT * FROM projects WHERE is_pipeline = 0 ORDER BY foreman, name"
    ).all() as any[];
  }

  const rows = raw.map(rowFor).filter((r): r is StageRow => r !== null);
  if (rows.length === 0) return null;

  // Column widths — project name capped so the block stays readable on mobile.
  const NAME_CAP = 18;
  const clip = (s: string) => (s.length > NAME_CAP ? s.slice(0, NAME_CAP - 1) + "…" : s);
  const nameW = Math.max(7, ...rows.map(r => clip(r.name).length));

  const num = (n: number) => String(Math.round(n));

  const header =
    "Project".padEnd(nameW) + "  " +
    "Stage".padEnd(6)       + "  " +
    "Allot".padStart(6)     + "  " +
    "Prog".padStart(4)      + "  " +
    "ByProg".padStart(6)    + "  " +
    "Actual".padStart(6);

  const lines = rows.map(r => {
    const over = r.byProg > 0 && r.actual > r.byProg;
    return (
      clip(r.name).padEnd(nameW)               + "  " +
      r.stage.padEnd(6)                        + "  " +
      num(r.allot).padStart(6)                 + "  " +
      (Math.round(r.prog * 100) + "%").padStart(4) + "  " +
      num(r.byProg).padStart(6)                + "  " +
      num(r.actual).padStart(6)                +
      (over ? "  ⚠" : "")
    );
  });

  const stamp = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  let msg = `📐 *Stage progress — ${stamp}*\n`;
  msg += scoped
    ? `${rows.length} project${rows.length === 1 ? "" : "s"} updated this sync — allotted vs. actual hours for the current stage. ⚠ = running over pace.\n`
    : `Allotted vs. actual hours for each project's current stage. ⚠ = running over pace.\n`;
  msg += "```\n" + header + "\n" + lines.join("\n") + "\n```\n";
  msg += `Open Switchboard: ${appUrl("/dashboard")}`;
  return msg;
}

// Fire-and-forget — never let a Slack hiccup break the apply request.
// Pass the changed project ids so the post is scoped to what actually moved.
export async function postStageReport(projectIds?: number[] | null): Promise<void> {
  try {
    const msg = buildStageReport(projectIds);
    if (msg) await notifySlack(msg);
  } catch {
    /* best-effort */
  }
}
