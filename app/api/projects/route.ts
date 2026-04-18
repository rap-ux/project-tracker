import { auth }     from "@/auth";
import db            from "@/lib/db";
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
      (name, foreman, stage, contract_value, region, builder, contacts, phone, is_pipeline)
    VALUES
      (@name, @foreman, @stage, @contract_value, @region, @builder, @contacts, @phone, @is_pipeline)
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
    is_pipeline:    body.is_pipeline    ?? 0,
  });
  return Response.json({ id: result.lastInsertRowid }, { status: 201 });
}
