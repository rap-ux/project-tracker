// Transcript -> structured daily report (Claude, structured output).
//
// PROMPT STATUS: v0, ported from the Daily Helper prototype. It was written
// WITHOUT seeing real transcripts. Rework it against Cole's sample calls when
// they arrive (see HANDOFF.md "Daily Reports"). Cole's guidance so far:
// "more brief and more tactical", split into accomplished and next steps.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export const MODEL = "claude-opus-5";

export const ReportSchema = z.object({
  accomplished: z.array(z.string()).describe("Work completed on the work day, one short tactical line each"),
  next_steps: z.array(z.string()).describe("What happens next on this job, one short line each"),
  blockers: z
    .array(z.string())
    .describe("Anything holding the job up: missing parts, inspections, other trades, customer decisions"),
  materials: z.array(z.string()).describe("Materials or equipment needed or ordered"),
  people: z.array(z.string()).describe("Names of crew mentioned as being on the job"),
  summary: z.string().describe("One or two sentences a manager could text to someone"),
  work_date_hint: z
    .string()
    .describe(
      "If the call clearly refers to work on a different day than the call, say which day in plain words; otherwise empty string",
    ),
  notes: z
    .string()
    .describe("Anything unclear, ambiguous, or that a human should double check; empty string if none"),
});
export type Extracted = z.infer<typeof ReportSchema>;

const SYSTEM = `You turn phone call transcripts into daily job reports for Totally Wired Electric, an electrical contractor.
The calls are informal. A manager phones the lead electrician on a job at the end of the day and asks how it went.
Transcripts come from automatic speech recognition and contain mistakes, filler, and small talk.

Write the report the way a sharp field superintendent would: brief and tactical.
- Only include things actually said on the call. Never invent detail.
- Use electrical trade language as spoken (rough-in, trim, panel, home runs, pull wire, can lights, etc).
- Each bullet is one concrete fact. No bullet longer than about 15 words.
- Separate what was ACCOMPLISHED from what happens NEXT.
- Ignore small talk, scheduling chatter unrelated to this job, and pleasantries.
- If a name or job reference is garbled, keep the closest reading and mention it in notes.
- Empty arrays are fine when nothing applies.`;

export function extractionAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractReport(input: {
  transcript: string;
  jobName: string;
  callDate: string;
  reporter: string;
}): Promise<Extracted> {
  if (!extractionAvailable()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local (or Railway) and restart.");
  }
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Job: ${input.jobName}\nCall date: ${input.callDate}\nJob lead on the call: ${input.reporter}\n\nTranscript:\n${input.transcript}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this transcript: " + (response.stop_details?.explanation ?? "no explanation given"));
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Extraction was cut off (transcript too long for one pass). Try trimming the transcript.");
  }
  if (!response.parsed_output) throw new Error("Extraction returned no parseable output.");
  return response.parsed_output;
}
