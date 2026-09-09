// Types, row mapping, and text helpers for Daily Reports.
// Tables are created in lib/db.ts ("Daily Reports" section).
import path from "path";

/** Where audio recordings live. DATA_DIR mirrors the Railway volume; defaults to ./data. */
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const AUDIO_DIR = path.join(DATA_DIR, "audio");

export type ReportStatus = "draft" | "confirmed";
export type ReportSource = "paste" | "audio" | "ringcentral";
export type FactCategory = "done" | "next" | "blocked" | "needs";

export interface Report {
  id: number;
  project_id: number | null;
  job_name: string;
  work_date: string;
  call_date: string;
  reporter: string;
  caller: string;
  source: ReportSource;
  transcript: string;
  audio_path: string | null;
  status: ReportStatus;
  accomplished: string; // JSON string[]
  next_steps: string;
  blockers: string;
  materials: string;
  people: string;
  summary: string;
  extraction_notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** joined from projects when available */
  project_name?: string | null;
}

export interface Fact {
  id: number;
  report_id: number;
  project_id: number | null;
  job_name: string;
  work_date: string;
  category: FactCategory;
  text: string;
  people: string;
}

export const CATEGORY_LABEL: Record<FactCategory, string> = {
  done: "Accomplished",
  next: "Next steps",
  blocked: "Blockers",
  needs: "Materials",
};

export const CALLERS = ["Cole", "Taimez"];

export function parseList(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Textarea (one item per line, optional leading dash) -> JSON string[]. */
export function linesToJson(s: string): string {
  return JSON.stringify(
    s
      .split("\n")
      .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
      .filter(Boolean),
  );
}

/** JSON string[] -> textarea text. */
export function jsonToLines(s: string): string {
  return parseList(s)
    .map((l) => `- ${l}`)
    .join("\n");
}

/** Display name for the job: the linked project's name, else the name as heard. */
export function jobLabel(r: Pick<Report, "job_name" | "project_name">): string {
  return r.project_name || r.job_name;
}

/** Plain-text block for one report: what gets pasted into a text message. */
export function reportText(r: Report): string {
  const block = (title: string, s: string) => {
    const items = parseList(s);
    return items.length ? `${title}:\n${items.map((i) => `- ${i}`).join("\n")}` : "";
  };
  return [
    `${jobLabel(r)} — ${r.work_date} (${r.reporter})`,
    block("Accomplished", r.accomplished),
    block("Next steps", r.next_steps),
    block("Blockers", r.blockers),
    block("Materials", r.materials),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Digest for one day: every confirmed report, separated, ready to send. */
export function digestText(date: string, reports: Report[]): string {
  if (!reports.length) return `No confirmed daily reports for ${date}.`;
  return [`TWE daily reports — ${date}`, ...reports.map(reportText)].join("\n\n———\n\n");
}

/** ISO date (YYYY-MM-DD) for "today" in the shop's timezone. */
export function todayISO(): string {
  const tz = process.env.REPORTS_TIMEZONE ?? "America/Los_Angeles";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ((acc[p.type] = p.value), acc), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isISODate(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
