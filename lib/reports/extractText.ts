// Turn an uploaded document into transcript text.
// .txt/.md/.vtt/.srt -> as is; .docx -> mammoth; .pdf -> pdf-parse.
// Scanned PDFs (images only) come back empty and are reported as such.
import mammoth from "mammoth";

export const TEXT_EXT = /\.(txt|md|vtt|srt|rtf|csv|json|log)$/i;
export const DOC_EXT = /\.(docx|pdf)$/i;
export const AUDIO_EXT = /\.(m4a|mp3|wav|aac|ogg|caf|mp4|webm)$/i;

export function isTextFile(f: File): boolean {
  return TEXT_EXT.test(f.name) || f.type.startsWith("text/");
}
export function isDocFile(f: File): boolean {
  return DOC_EXT.test(f.name);
}
export function isAudioFile(f: File): boolean {
  return f.type.startsWith("audio/") || AUDIO_EXT.test(f.name);
}

export async function fileToText(f: File): Promise<string> {
  if (isTextFile(f)) return (await f.text()).trim();
  const buf = Buffer.from(await f.arrayBuffer());
  if (/\.docx$/i.test(f.name)) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    const text = value.trim();
    if (!text) throw new Error(`${f.name} has no readable text.`);
    return text;
  }
  if (/\.pdf$/i.test(f.name)) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      // pdf-parse inserts "-- N of M --" between pages; drop those.
      const text = result.text
        .replace(/\n*-- \d+ of \d+ --\n*/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (!text) throw new Error(`${f.name} looks like a scanned PDF with no text layer. Paste the transcript instead.`);
      return text;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  if (/\.doc$/i.test(f.name)) throw new Error(`${f.name}: old .doc format is not supported. Save it as .docx or .txt.`);
  throw new Error(`${f.name}: unsupported file type.`);
}
