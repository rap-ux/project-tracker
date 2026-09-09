export const dynamic = "force-dynamic";
import Link from "next/link";
import { notFound } from "next/navigation";
import db from "@/lib/db";
import ReportCard from "@/components/reports/ReportCard";
import { requireReportsUser } from "@/lib/reports/access";
import { confirmedForProject } from "@/lib/reports/queries";
import { parseList } from "@/lib/reports/schema";

export default async function JobTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  await requireReportsUser();
  const { id } = await params;
  const project = db
    .prepare(`SELECT id, name, foreman, stage, aliases, is_pipeline FROM projects WHERE id = ?`)
    .get(Number(id)) as { id: number; name: string; foreman: string; stage: string; aliases: string; is_pipeline: number } | undefined;
  if (!project) notFound();
  const reports = confirmedForProject(project.id);
  const aliases = parseList(project.aliases);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-text">{project.name}</h2>
          <p className="text-xs text-muted">
            {project.foreman} · {project.stage}
            {aliases.length > 0 && <> · also heard as: {aliases.join(", ")}</>}
          </p>
        </div>
        <Link href={`/projects/${project.id}`} className="text-xs text-accent hover:underline">
          Open project in Switchboard
        </Link>
      </div>
      {reports.length === 0 ? (
        <p className="text-sm text-muted">No confirmed reports for this job yet.</p>
      ) : (
        <ol className="relative border-l border-border-strong pl-5 space-y-4">
          {reports.map((r) => (
            <li key={r.id} className="relative">
              <span className="absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full bg-accent" />
              <ReportCard r={r} showJob={false} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
