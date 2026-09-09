// Speech-to-text for uploaded audio. The Claude API does not transcribe audio,
// so this needs a separate provider. NOT CHOSEN YET (see HANDOFF.md "Daily
// Reports"). Until then, audio is stored for the record and a pasted transcript
// is required.
export const transcriptionAvailable = false;

export async function transcribeAudio(filePath: string): Promise<string> {
  void filePath;
  throw new Error("Audio transcription provider not configured yet. Paste the transcript instead.");
}
