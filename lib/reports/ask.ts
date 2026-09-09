// Natural-language questions over CONFIRMED daily reports.
// Retrieval first (FTS over facts, plus a project-name match and the newest
// reports for recency context), then one Claude call restricted to what was
// retrieved. Answers cite "[#id]" so the UI can link to the report.
import Anthropic from "@anthropic-ai/sdk";
import db from "@/lib/db";
import { extractionAvailable, MODEL } from "./extract";
import { searchFacts } from "./facts";
import { findProject } from "./projects";
import { reportsByIds, recentConfirmed } from "./queries";
import { jobLabel, parseList, type Report } from "./schema";

const MAX_SOURCES = 40;

function renderReport(r: Report): string {
  const list = (label: string, s: string) => {
    const items = parseList(s);
    return items.length ? `${label}:\n${items.map((i) => `  - ${i}`).join("\n")}\n` : "";
  };
  return `### Report [#${r.id}] | Job: ${jobLabel(r)} | Work date: ${r.work_date} | Lead: ${r.reporter}
${list("Accomplished", r.accomplished)}${list("Next steps", r.next_steps)}${list("Blockers", r.blockers)}${list("Materials", r.materials)}${list("Crew", r.people)}`;
}

const SYSTEM = `You answer questions for the managers of Totally Wired Electric, an electrical contractor, using ONLY the daily job reports provided.
Rules:
- Cite every report you rely on as "per the <work date> report for <job>" and include its tag exactly as written, e.g. [#12], so it can be linked.
- If the reports do not contain the answer, say so plainly. Never guess or fill in from general knowledge.
- Be brief. A manager is reading this on a phone.
- Job names in reports may be spelled loosely; match reasonably but say when you are unsure.
- Dates: "work date" is the day the work happened.`;

export type Answer = { text: string; sources: Report[]; searched: number };

export async function askReports(question: string): Promise<Answer> {
  const q = question.trim();
  if (!q) return { text: "", sources: [], searched: 0 };

  const hits = searchFacts(q);
  const ids = new Set<number>(hits.map((f) => f.report_id));

  // If the question names a project, include that project's reports directly.
  const projectHit = findProjectInQuestion(q);
  if (projectHit) {
    const rows = db
      .prepare(`SELECT id FROM daily_reports WHERE status = 'confirmed' AND project_id = ? ORDER BY work_date DESC LIMIT 20`)
      .all(projectHit) as { id: number }[];
    for (const r of rows) ids.add(r.id);
  }

  const byId = new Map<number, Report>();
  for (const r of reportsByIds(Array.from(ids))) byId.set(r.id, r);
  for (const r of recentConfirmed(10)) if (!byId.has(r.id)) byId.set(r.id, r);
  const sources = Array.from(byId.values())
    .sort((a, b) => (a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : b.id - a.id))
    .slice(0, MAX_SOURCES);

  if (!sources.length) return { text: "There are no confirmed daily reports yet.", sources: [], searched: 0 };
  if (!extractionAvailable()) {
    return { text: "ANTHROPIC_API_KEY is not set, so questions cannot be answered yet.", sources, searched: sources.length };
  }

  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      { type: "text", text: "Reports:\n\n" + sources.map(renderReport).join("\n") },
    ],
    messages: [{ role: "user", content: q }],
  });
  if (response.stop_reason === "refusal") {
    return { text: "The model declined to answer this question.", sources: [], searched: sources.length };
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const cited = new Set(Array.from(text.matchAll(/#(\d+)/g)).map((m) => Number(m[1])));
  return { text, sources: sources.filter((s) => cited.has(s.id)), searched: sources.length };
}

/** Try each 1-3 word window of the question against project names/aliases. */
function findProjectInQuestion(q: string): number | null {
  const words = q.replace(/[^a-zA-Z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      if (phrase.length < 4) continue;
      const p = findProject(phrase);
      if (p) return p.id;
    }
  }
  return null;
}
