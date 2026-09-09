export const dynamic = "force-dynamic";
import IntakeForm from "@/components/reports/IntakeForm";
import { requireReportsUser } from "@/lib/reports/access";
import { extractionAvailable } from "@/lib/reports/extract";
import { listProjects } from "@/lib/reports/projects";
import { knownReporters } from "@/lib/reports/queries";
import { CALLERS, todayISO } from "@/lib/reports/schema";
import { transcriptionAvailable } from "@/lib/reports/transcribe";

export default async function NewReportPage() {
  await requireReportsUser();
  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-text mb-3">New daily report</h2>
      <IntakeForm
        projects={listProjects()}
        reporters={knownReporters()}
        callers={CALLERS}
        today={todayISO()}
        transcriptionAvailable={transcriptionAvailable}
        extractionAvailable={extractionAvailable()}
      />
    </div>
  );
}
