export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Streams a report's stored recording to an allow-listed user. Recordings
// never sit under public/; they live in DATA_DIR/audio and only leave via here.
import fs from "fs";
import path from "path";
import { reportsUser } from "@/lib/reports/access";
import { getReport } from "@/lib/reports/queries";
import { AUDIO_DIR } from "@/lib/reports/schema";

const MIME: Record<string, string> = {
  ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".ogg": "audio/ogg", ".webm": "audio/webm", ".aac": "audio/aac", ".caf": "audio/x-caf",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await reportsUser())) return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  const r = getReport(Number(id));
  if (!r?.audio_path) return new Response("Not found", { status: 404 });
  const resolved = path.resolve(r.audio_path);
  if (!resolved.startsWith(path.resolve(AUDIO_DIR)) || !fs.existsSync(resolved)) {
    return new Response("Not found", { status: 404 });
  }
  const buf = fs.readFileSync(resolved);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[path.extname(resolved).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}
