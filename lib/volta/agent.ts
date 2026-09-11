// Volta: Switchboard's assistant. One entry point (runVolta) shared by the web
// widget, the Slack bot, and any standalone client. Tool-use loop over the
// read-only tools in tools.ts, scoped to the asking user.
import Anthropic from "@anthropic-ai/sdk";
import db from "@/lib/db";
import { appUrl } from "@/lib/slack";
import type { VoltaUser } from "./access";
import { runTool, toolsFor } from "./tools";

export const VOLTA_MODEL = process.env.VOLTA_MODEL ?? "claude-opus-5";
const MAX_ROUNDS = 10;

export type VoltaChannel = "web" | "slack" | "api";
export interface VoltaMessage { role: "user" | "assistant"; content: string }
export interface VoltaResult { text: string; toolsUsed: string[] }

export function voltaAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function systemPrompt(user: VoltaUser, channel: VoltaChannel): string {
  const today = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "long", day: "numeric", weekday: "long" });
  return `You are Volta, the assistant inside Switchboard, the internal project-coordination app of Totally Wired Electric & AV Systems (TWE), an electrical and AV contractor in the Los Angeles area.

Today is ${today}. You are talking to ${user.name} (${user.role}${user.foremanName ? `, foreman ${user.foremanName}` : ""}).

What you know comes ONLY from the tools. Use them before answering anything about projects, money, hours, schedules, people, or history. Never invent numbers or events. If the data does not contain the answer, say so and say where in the app the person could look.

Data you can reach:
- Projects: contract value, invoiced, remaining, stage and completion, hours vs goal, materials vs budget, bonus/incentive status, inputs, stage schedule, forecast milestones, change orders, comments, activity log, QuickBooks estimates/invoices/bills rollups.
- Operations Log: daily reports built from end-of-day call transcripts with job leads (accomplished, next steps, blockers, materials, crew).${user.canReadReports ? "" : " (This user is NOT on the Operations Log access list; do not reveal its contents and say access is restricted if asked.)"}
${user.canSql ? "- sql_query: read-only SELECT for anything the curated tools miss. Call describe_schema first if unsure of columns." : ""}

Domain notes:
- Stages: Contracting Phase -> Underground -> Rough -> Finish -> Extras. project_completion = 70% of stage_completion during Rough/Underground, 70% + 30% x stage_completion during Finish.
- "Hours vs goal" over 100% means the crew has used more hours than the stage-based goal; the incentive/bonus depends on staying under it.
- Foremen: Damon and Taimez run the field; Cole Dixon is the owner; Nicole handles books/QuickBooks; Rafael builds this app.
- Money in USD. Percentages are already computed where provided.

How to answer:
- Brief and concrete. Lead with the answer, then the two or three numbers that support it. Use a short table for comparisons across projects.
- Cite Operations Log reports as [#id] and say the work date and the lead's name.
- Link to the app when useful: ${appUrl("/projects/<id>")}, ${appUrl("/reports/<id>")}, ${appUrl("/forecast")}, ${appUrl("/bonuses")}, ${appUrl("/uploads")}.
- ${channel === "slack" ? "Format for Slack: *bold*, bullet lists with -, no markdown tables (use aligned lines instead), no headings." : "Format in GitHub-flavored Markdown."}
- You are read-only. If asked to change data, explain which page does it and offer the link.`;
}

export async function runVolta(opts: { user: VoltaUser; messages: VoltaMessage[]; channel: VoltaChannel }): Promise<VoltaResult> {
  if (!voltaAvailable()) return { text: "Volta is not configured yet (ANTHROPIC_API_KEY is missing).", toolsUsed: [] };
  const client = new Anthropic();
  const tools = toolsFor(opts.user);
  const history: Anthropic.MessageParam[] = opts.messages.slice(-20).map((m) => ({ role: m.role, content: m.content }));
  if (!history.length || history[history.length - 1].role !== "user") return { text: "Ask me something.", toolsUsed: [] };
  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await client.messages.create({
      model: VOLTA_MODEL,
      max_tokens: 2500,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: systemPrompt(opts.user, opts.channel), cache_control: { type: "ephemeral" } }],
      tools,
      messages: history,
    });

    if (res.stop_reason === "refusal") return { text: "I can't help with that one.", toolsUsed };

    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { text: text || "(no answer)", toolsUsed };
    }

    history.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolsUsed.push(tu.name);
      let out: string;
      try { out = await runTool(opts.user, tu.name, (tu.input ?? {}) as Record<string, unknown>); }
      catch (e) { out = JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out.length > 60_000 ? out.slice(0, 60_000) + "…(truncated)" : out });
    }
    history.push({ role: "user", content: results });
  }
  return { text: "I ran out of steps before finishing. Try a narrower question.", toolsUsed };
}

/** Audit trail: every question and answer, per channel and user. */
export function logExchange(channel: VoltaChannel, user: VoltaUser, question: string, answer: string, toolsUsed: string[]): void {
  try {
    db.prepare("INSERT INTO volta_messages (channel, user_email, question, answer, tools_used) VALUES (?, ?, ?, ?, ?)")
      .run(channel, user.email, question, answer, JSON.stringify(toolsUsed));
  } catch { /* non-fatal */ }
}
