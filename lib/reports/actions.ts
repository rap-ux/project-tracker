"use server";
// Server actions for Daily Reports: create draft, save/confirm, delete.
// Every action re-checks the allow-list (requireReportsUser) because a form
// post can arrive without going through the page.
import fs from "fs";
import path from "path";
import { redirect } from "next/navigation";
import db from "@/lib/db";
import { requireReportsUser } from "./access";
import { extractReport } from "./extract";
import { rebuildFacts } from "./facts";
import { resolveProject } from "./projects";
import { getReport } from "./queries";
import { AUDIO_DIR, CALLERS, isISODate, linesToJson, NOT_EXTRACTED, todayISO, type ReportSource } from "./schema";
import { transcribeAudio, transcriptionAvailable } from "./transcribe";

const MAX_AUDIO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_TRANSCRIPT_CHARS = 200_000;

function str(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}
function req(form: FormData, key: string, label = key): string {
  const v = str(form, key);
  if (!v) throw new Error(`Missing ${label}`);
  return v;
}
function optInt(form: FormData, key: string): number | null {
  const v = str(form, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type ActionState = { error?: string; ok?: boolean } | undefined;

/** Intake: paste a transcript and/or upload audio, run extraction, land on the draft. */
export async function createReport(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireReportsUser();
  let id: number;
  try {
    const jobName = req(form, "jobName", "job name");
    const projectId = optInt(form, "projectId");
    const callDate = req(form, "callDate", "call date");
    const workDate = str(form, "workDate") || callDate;
    if (!isISODate(callDate) || !isISODate(workDate)) throw new Error("Dates must be YYYY-MM-DD.");
    const reporter = req(form, "reporter", "job lead");
    const caller = str(form, "caller") || CALLERS[0];

    let transcript = str(form, "transcript");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new Error("Transcript is too long.");
    let audioPath: string | null = null;
    let source: ReportSource = "paste";

    const audio = form.get("audio");
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) throw new Error("Audio file is larger than 200 MB.");
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
      const safe = `${Date.now()}-${audio.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
      audioPath = path.join(AUDIO_DIR, safe);
      fs.writeFileSync(audioPath, Buffer.from(await audio.arrayBuffer()));
      source = "audio";
      if (!transcript) {
        if (!transcriptionAvailable) {
          fs.unlinkSync(audioPath);
          throw new Error("Transcription is not set up yet. Paste the transcript along with the audio.");
        }
        transcript = await transcribeAudio(audioPath);
      }
    }
    if (!transcript) throw new Error("Paste a transcript (audio alone is not enough until transcription is set up).");

    const link = resolveProject(projectId, jobName);
    const extracted = await extractReport({
      transcript,
      jobName: link.project_name ?? jobName,
      callDate,
      reporter,
    });

    const notes = [
      link.project_id ? "" : `Job "${jobName}" did not match a Switchboard project. Pick one on this page before confirming.`,
      extracted.work_date_hint ? `Work date: ${extracted.work_date_hint}` : "",
      extracted.notes,
    ]
      .filter(Boolean)
      .join("\n");

    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO daily_reports
           (project_id, job_name, work_date, call_date, reporter, caller, source, transcript, audio_path, status,
            accomplished, next_steps, blockers, materials, people, summary, extraction_notes, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        link.project_id, jobName, workDate, callDate, reporter, caller, source, transcript, audioPath,
        JSON.stringify(extracted.accomplished), JSON.stringify(extracted.next_steps),
        JSON.stringify(extracted.blockers), JSON.stringify(extracted.materials), JSON.stringify(extracted.people),
        extracted.summary, notes, user.email, now, now,
      );
    id = Number(res.lastInsertRowid);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(`/reports/${id}`);
}

/** Review: save edits, optionally confirm. Facts are rebuilt from the saved fields. */
export async function saveReport(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireReportsUser();
  let dest: string;
  try {
    const id = Number(req(form, "id"));
    const existing = getReport(id);
    if (!existing) throw new Error("Report not found.");
    const confirm = str(form, "confirm") === "1";
    const jobName = req(form, "jobName", "job name");
    const workDate = req(form, "workDate", "work date");
    if (!isISODate(workDate)) throw new Error("Work date must be YYYY-MM-DD.");
    const link = resolveProject(optInt(form, "projectId"), jobName);
    if (confirm && !link.project_id) throw new Error("Pick a Switchboard project before confirming.");

    db.prepare(
      `UPDATE daily_reports SET
         project_id = ?, job_name = ?, work_date = ?, reporter = ?, caller = ?,
         accomplished = ?, next_steps = ?, blockers = ?, materials = ?, people = ?,
         summary = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      link.project_id, jobName, workDate, req(form, "reporter", "job lead"), str(form, "caller") || existing.caller,
      linesToJson(str(form, "accomplished")), linesToJson(str(form, "nextSteps")),
      linesToJson(str(form, "blockers")), linesToJson(str(form, "materials")), linesToJson(str(form, "people")),
      str(form, "summary"), confirm ? "confirmed" : "draft", new Date().toISOString(), id,
    );
    const saved = getReport(id)!;
    rebuildFacts(saved);
    dest = confirm ? `/reports/today?date=${saved.work_date}` : `/reports/${id}?saved=1`;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect(dest);
}

/** Un-confirm: back to draft (facts are removed). */
export async function unconfirmReport(form: FormData): Promise<void> {
  await requireReportsUser();
  const id = Number(req(form, "id"));
  db.prepare(`UPDATE daily_reports SET status = 'draft', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  const saved = getReport(id);
  if (saved) rebuildFacts(saved);
  redirect(`/reports/${id}`);
}

/**
 * Drop box (no login): a share link with a secret token lets Cole paste a
 * transcript or upload a recording from his phone. It only WRITES a draft;
 * nothing is read back. Extraction runs later from the review page.
 */
export async function dropTranscript(_prev: ActionState, form: FormData): Promise<ActionState> {
  const token = process.env.REPORTS_DROP_TOKEN;
  if (!token || str(form, "token") !== token) return { error: "This link is not valid." };
  try {
    const jobName = str(form, "jobName") || "(job not given)";
    const callDate = str(form, "callDate") || todayISO();
    if (!isISODate(callDate)) throw new Error("Call date must be a date.");
    const reporter = str(form, "reporter") || "(lead not given)";
    const caller = str(form, "caller") || CALLERS[0];
    let transcript = str(form, "transcript");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) throw new Error("Transcript is too long.");
    let audioPath: string | null = null;
    let source: ReportSource = "paste";
    const audio = form.get("audio");
    if (audio instanceof File && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) throw new Error("Audio file is larger than 200 MB.");
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
      const safe = `${Date.now()}-${audio.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80)}`;
      audioPath = path.join(AUDIO_DIR, safe);
      fs.writeFileSync(audioPath, Buffer.from(await audio.arrayBuffer()));
      source = "audio";
    }
    if (!transcript && !audioPath) throw new Error("Paste the transcript or attach the recording.");
    if (!transcript) transcript = "(audio only — transcript pending)";
    const link = resolveProject(null, jobName);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO daily_reports
         (project_id, job_name, work_date, call_date, reporter, caller, source, transcript, audio_path, status,
          accomplished, next_steps, blockers, materials, people, summary, extraction_notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', '[]', '[]', '[]', '[]', '[]', '', ?, ?, ?, ?)`,
    ).run(link.project_id, jobName, callDate, callDate, reporter, caller, source, transcript, audioPath,
      NOT_EXTRACTED + (link.project_id ? "" : ` Job "${jobName}" did not match a project yet.`), `drop:${caller}`, now, now);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Review page: run (or re-run) extraction on an existing draft's transcript. */
export async function extractDraft(form: FormData): Promise<void> {
  await requireReportsUser();
  const id = Number(req(form, "id"));
  const r = getReport(id);
  if (!r) redirect("/reports/uploads");
  let notes: string;
  try {
    const extracted = await extractReport({ transcript: r.transcript, jobName: r.project_name ?? r.job_name, callDate: r.call_date, reporter: r.reporter });
    notes = [
      r.project_id ? "" : `Job "${r.job_name}" did not match a Switchboard project. Pick one before confirming.`,
      extracted.work_date_hint ? `Work date: ${extracted.work_date_hint}` : "",
      extracted.notes,
    ].filter(Boolean).join("\n");
    db.prepare(
      `UPDATE daily_reports SET accomplished = ?, next_steps = ?, blockers = ?, materials = ?, people = ?, summary = ?, extraction_notes = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify(extracted.accomplished), JSON.stringify(extracted.next_steps), JSON.stringify(extracted.blockers),
      JSON.stringify(extracted.materials), JSON.stringify(extracted.people), extracted.summary, notes, new Date().toISOString(), id);
  } catch (e) {
    db.prepare(`UPDATE daily_reports SET extraction_notes = ?, updated_at = ? WHERE id = ?`)
      .run(`${NOT_EXTRACTED} Last attempt failed: ${e instanceof Error ? e.message : String(e)}`, new Date().toISOString(), id);
  }
  redirect(`/reports/${id}`);
}

export async function deleteReport(form: FormData): Promise<void> {
  await requireReportsUser();
  const id = Number(req(form, "id"));
  const row = getReport(id);
  if (row?.audio_path && row.audio_path.startsWith(AUDIO_DIR) && fs.existsSync(row.audio_path)) {
    fs.unlinkSync(row.audio_path);
  }
  db.prepare(`DELETE FROM daily_reports WHERE id = ?`).run(id); // facts cascade
  redirect("/reports/uploads");
}
