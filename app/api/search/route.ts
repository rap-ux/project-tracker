export const dynamic = 'force-dynamic';
import { auth } from "@/auth";
import db       from "@/lib/db";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q || q.length < 1) return Response.json({ results: [] });

  const like = `%${q}%`;

  // Scope: owners see all projects, foremen see only their own
  const role        = (session.user as any).role;
  const foremanName = (session.user as any).foremanName;

  // ── Projects ──────────────────────────────────────────────────────────────
  const projectSql = (role === "foreman" && foremanName)
    ? `SELECT id, name, foreman, stage, is_pipeline, region, builder, contacts, phone, project_notes
       FROM projects
       WHERE foreman LIKE ?
         AND (LOWER(name) LIKE ? OR LOWER(builder) LIKE ? OR LOWER(contacts) LIKE ?
              OR LOWER(region) LIKE ? OR LOWER(project_notes) LIKE ? OR LOWER(phone) LIKE ?)
       ORDER BY is_pipeline, name
       LIMIT 20`
    : `SELECT id, name, foreman, stage, is_pipeline, region, builder, contacts, phone, project_notes
       FROM projects
       WHERE LOWER(name) LIKE ? OR LOWER(builder) LIKE ? OR LOWER(contacts) LIKE ?
          OR LOWER(region) LIKE ? OR LOWER(project_notes) LIKE ? OR LOWER(foreman) LIKE ?
          OR LOWER(phone) LIKE ?
       ORDER BY is_pipeline, name
       LIMIT 20`;

  const projectParams = (role === "foreman" && foremanName)
    ? [`%${foremanName}%`, like, like, like, like, like, like]
    : [like, like, like, like, like, like, like];

  const projects = db.prepare(projectSql).all(...projectParams) as any[];

  // ── Comments (matched body, owner/admin only) ─────────────────────────────
  let comments: any[] = [];
  if (role !== "foreman") {
    comments = db.prepare(`
      SELECT c.id, c.body, c.user_name, c.created_at,
             p.id AS project_id, p.name AS project_name
      FROM project_comments c
      JOIN projects p ON p.id = c.project_id
      WHERE LOWER(c.body) LIKE ?
      ORDER BY c.created_at DESC
      LIMIT 8
    `).all(like) as any[];
  }

  // ── Change orders ─────────────────────────────────────────────────────────
  let changeOrders: any[] = [];
  if (role !== "foreman") {
    changeOrders = db.prepare(`
      SELECT co.id, co.description, co.amount, co.status,
             p.id AS project_id, p.name AS project_name
      FROM change_orders co
      JOIN projects p ON p.id = co.project_id
      WHERE LOWER(co.description) LIKE ?
      ORDER BY co.created_at DESC
      LIMIT 8
    `).all(like) as any[];
  }

  return Response.json({
    projects,
    comments,
    changeOrders,
    totalCount: projects.length + comments.length + changeOrders.length,
  });
}
