export const dynamic = 'force-dynamic';
import { auth }     from "@/auth";
import db            from "@/lib/db";
import { deriveBudgets } from "@/lib/budgets";
import { NextRequest } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role        = (session.user as any).role;
  const foremanName = (session.user as any).foremanName;

  let projects;
  if (role === "foreman" && foremanName) {
    projects = db
      .prepare("SELECT * FROM projects WHERE foreman LIKE ? ORDER BY name")
      .all(`%${foremanName}%`);
  } else {
    projects = db.prepare("SELECT * FROM projects ORDER BY foreman, name").all();
  }

  return Response.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const stmt = db.prepare(`
    INSERT INTO projects
      (name, foreman, stage, contract_value,
       region, builder, contacts, phone,
       project_notes, basecamp_link, drive_folder,
       is_pipeline)
    VALUES
      (@name, @foreman, @stage, @contract_value,
       @region, @builder, @contacts, @phone,
       @project_notes, @basecamp_link, @drive_folder,
       @is_pipeline)
  `);
  const result = stmt.run({
    name:           body.name           ?? "",
    foreman:        body.foreman        ?? "",
    stage:          body.stage          ?? "Rough",
    contract_value: body.contract_value ?? 0,
    region:         body.region         ?? null,
    builder:        body.builder        ?? null,
    contacts:       body.contacts       ?? null,
    phone:          body.phone          ?? null,
    project_notes:  body.project_notes  ?? null,
    basecamp_link:  body.basecamp_link  ?? null,
    drive_folder:   body.drive_folder   ?? null,
    is_pipeline:    body.is_pipeline    ?? 0,
  });

  // Seed est_total_hours from contract using default inputs (matches spreadsheet formula).
  // Rough/finish allowed are 0 for now — user enters those via the /inputs page.
  if (body.contract_value) {
    const derived = deriveBudgets(
      { contract_value: body.contract_value, stage: body.stage ?? "Rough" },
      null,
    );
    db.prepare(`UPDATE projects SET est_total_hours = ?, goal_hours = ? WHERE id = ?`)
      .run(derived.est_total_hours, derived.goal_hours, result.lastInsertRowid);
  }

  // Log creation
  try {
    db.prepare(`
      INSERT INTO project_activity (project_id, user_name, action, details)
      VALUES (?, ?, ?, ?)
    `).run(
      result.lastInsertRowid,
      session.user?.name ?? "Unknown",
      "Created",
      `New ${body.is_pipeline ? "minor" : "tracked"} project: ${body.name}${body.builder ? ` · ${body.builder}` : ""}`
    );
  } catch { /* non-fatal */ }

  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
