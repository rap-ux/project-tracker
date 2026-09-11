// Volta's tools: curated, read-only views over Switchboard's SQLite, scoped to
// the asking user (see access.ts). Every tool returns a JSON string.
import Database from "better-sqlite3";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import db from "@/lib/db";
import { calcIncentive } from "@/lib/incentive";
import { searchFacts } from "@/lib/reports/facts";
import { getReport, reportsByIds, recentConfirmed } from "@/lib/reports/queries";
import { jobLabel, parseList, type Report } from "@/lib/reports/schema";
import { projectScope, type VoltaUser } from "./access";

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "number" && !Number.isInteger(x) ? Math.round(x * 100) / 100 : x));

// ── Definitions (what the model sees) ─────────────────────────────────────────
export function toolsFor(user: VoltaUser): Anthropic.Tool[] {
  const tools: Anthropic.Tool[] = [
    {
      name: "list_projects",
      description:
        "List projects with headline numbers (stage, completion, contract value, invoiced, hours vs goal, materials vs budget). Tracked projects by default; set include_pipeline to also list pipeline/minor jobs.",
      input_schema: {
        type: "object",
        properties: {
          include_pipeline: { type: "boolean" },
          foreman: { type: "string", description: "Filter by foreman name, e.g. Damon or Taimez" },
          stage: { type: "string", description: "Underground | Rough | Finish | Extras | Contracting Phase" },
        },
      },
    },
    {
      name: "get_project",
      description:
        "Everything about one project: numbers, budgets/inputs, stage schedule, forecast milestones, bonus/incentive status, change orders, recent comments and activity, QuickBooks estimates/invoices/bills rollup, and (if permitted) the latest Operations Log reports. Accepts an id, exact name, or a loose name like 'Pyramid'.",
      input_schema: { type: "object", properties: { project: { type: "string" } }, required: ["project"] },
    },
    {
      name: "portfolio_summary",
      description:
        "Company-wide totals across tracked projects: contract value, invoiced, remaining, materials spend vs budget, hours vs goal, and lists of projects over budget on hours or materials.",
      input_schema: { type: "object", properties: {} },
    },
    {
      name: "search_activity",
      description:
        "Search the project activity feed and comments (who changed what, stage moves, sync applies, uploads, notes). Optional text query and project filter. Newest first.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          project: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
    {
      name: "forecast",
      description: "Revenue forecast inputs per project: milestone dates (underground/rough/finish start and completion), remaining value, payment notes.",
      input_schema: { type: "object", properties: { project: { type: "string" } } },
    },
  ];

  if (user.canReadReports) {
    tools.push(
      {
        name: "search_operations_log",
        description:
          "Search the Operations Log: confirmed daily reports built from end-of-day call transcripts (what was accomplished, next steps, blockers, materials, crew) per job per day. Use for questions like 'did we install the chandelier at Pyramid' or 'what happened at Woods Drive on the 21st'. Returns matching reports with ids to cite as [#id].",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string" },
            project: { type: "string", description: "Optional job/project name to restrict to" },
            date: { type: "string", description: "Optional YYYY-MM-DD work date" },
          },
          required: ["query"],
        },
      },
      {
        name: "get_operations_log_report",
        description: "One Operations Log report in full, including the raw call transcript.",
        input_schema: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] },
      },
    );
  }

  if (user.canSql) {
    tools.push(
      {
        name: "describe_schema",
        description: "List the database tables and columns available to sql_query. Call before writing SQL you are unsure about.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "sql_query",
        description:
          "Run a single read-only SELECT against the Switchboard database (SQLite). Use when the curated tools do not answer the question. Max 200 rows. Sensitive tables (users, credentials, presence/login logs) are blocked.",
        input_schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] },
      },
    );
  }
  return tools;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function findProject(user: VoltaUser, ref: string): Row | null {
  const scope = projectScope(user);
  const r = ref.trim();
  const byId = /^\d+$/.test(r)
    ? (db.prepare(`SELECT * FROM projects p WHERE p.id = ? AND ${scope.where}`).get(Number(r), ...scope.params) as Row | undefined)
    : undefined;
  if (byId) return byId;
  const exact = db
    .prepare(`SELECT * FROM projects p WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(?)) AND ${scope.where}`)
    .get(r, ...scope.params) as Row | undefined;
  if (exact) return exact;
  const like = db
    .prepare(`SELECT * FROM projects p WHERE (LOWER(p.name) LIKE LOWER(?) OR LOWER(COALESCE(p.aliases,'')) LIKE LOWER(?)) AND ${scope.where} ORDER BY is_pipeline, name`)
    .all(`%${r}%`, `%${r}%`, ...scope.params) as Row[];
  return like.length === 1 ? like[0] : like.length > 1 ? { __ambiguous: like.map((p) => `${p.id}: ${p.name}`) } : null;
}

function headline(p: Row) {
  const cv = Number(p.contract_value ?? 0), inv = Number(p.total_invoiced ?? 0);
  const hrs = Number(p.actual_total_hours ?? 0) + Number(p.unrecorded_hours ?? 0);
  const mat = Number(p.actual_materials ?? 0) + Number(p.unrecorded_materials ?? 0);
  return {
    id: p.id, name: p.name, foreman: p.foreman, stage: p.stage, is_pipeline: !!p.is_pipeline,
    stage_completion_pct: Math.round(Number(p.stage_completion ?? 0) * 100),
    project_completion_pct: Math.round(Number(p.project_completion ?? 0) * 100),
    contract_value: cv, total_invoiced: inv, invoiced_pct: cv ? Math.round((inv / cv) * 100) : null, remaining_value: cv - inv,
    actual_hours: hrs, goal_hours: p.goal_hours, est_total_hours: p.est_total_hours,
    hours_vs_goal_pct: Number(p.goal_hours) ? Math.round((hrs / Number(p.goal_hours)) * 100) : null,
    actual_materials: mat, est_materials_budget: p.est_materials_budget,
    materials_vs_budget_pct: Number(p.est_materials_budget) ? Math.round((mat / Number(p.est_materials_budget)) * 100) : null,
    region: p.region, builder: p.builder, updated_at: p.updated_at,
  };
}

function renderReport(r: Report) {
  return {
    id: r.id, job: jobLabel(r), work_date: r.work_date, call_date: r.call_date, lead: r.reporter, caller: r.caller,
    accomplished: parseList(r.accomplished), next_steps: parseList(r.next_steps), blockers: parseList(r.blockers),
    materials: parseList(r.materials), crew: parseList(r.people), summary: r.summary,
  };
}

const BLOCKED_TABLES = ["users", "qbo_connection", "login_events", "user_presence", "ip_geo_cache", "alerts_dismissed", "volta_messages"];
const REPORT_TABLES = ["daily_reports", "daily_report_facts", "daily_report_facts_fts"];

function runSql(user: VoltaUser, sql: string): string {
  const s = sql.trim().replace(/;+\s*$/, "");
  if (!/^\s*(select|with)\b/i.test(s)) return j({ error: "Only a single SELECT (or WITH ... SELECT) is allowed." });
  if (/;/.test(s)) return j({ error: "One statement only." });
  if (/\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|replace|reindex)\b/i.test(s)) {
    return j({ error: "Read-only: that statement type is not allowed." });
  }
  const lower = s.toLowerCase();
  for (const t of BLOCKED_TABLES) if (new RegExp(`\\b${t}\\b`).test(lower)) return j({ error: `Table ${t} is not available to Volta.` });
  if (!user.canReadReports) for (const t of REPORT_TABLES) if (lower.includes(t)) return j({ error: "You are not on the Operations Log access list." });
  const ro = new Database(path.join(process.cwd(), "data", "projects.db"), { readonly: true, timeout: 5000 });
  try {
    ro.pragma("query_only = 1");
    const stmt = ro.prepare(s);
    if (!stmt.readonly) return j({ error: "Statement is not read-only." });
    const rows = stmt.all() as Row[];
    return j({ row_count: rows.length, truncated: rows.length > 200, rows: rows.slice(0, 200) });
  } catch (e) {
    return j({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    ro.close();
  }
}

// ── Execution ─────────────────────────────────────────────────────────────────
export async function runTool(user: VoltaUser, name: string, input: Record<string, unknown>): Promise<string> {
  const scope = projectScope(user);
  switch (name) {
    case "list_projects": {
      const conds = [scope.where]; const params = [...scope.params];
      if (!input.include_pipeline) conds.push("p.is_pipeline = 0");
      if (input.foreman) { conds.push("p.foreman LIKE ?"); params.push(`%${input.foreman}%`); }
      if (input.stage) { conds.push("p.stage = ?"); params.push(String(input.stage)); }
      const rows = db.prepare(`SELECT * FROM projects p WHERE ${conds.join(" AND ")} ORDER BY p.is_pipeline, p.foreman, p.name`).all(...params) as Row[];
      return j({ count: rows.length, projects: rows.map(headline) });
    }
    case "get_project": {
      const p = findProject(user, String(input.project ?? ""));
      if (!p) return j({ error: "No project matches that name (or you do not have access to it)." });
      if (p.__ambiguous) return j({ error: "Several projects match; ask which one.", candidates: p.__ambiguous });
      const id = Number(p.id);
      const inputs = db.prepare("SELECT * FROM project_inputs WHERE project_id = ?").get(id) as Row | undefined;
      const stages = db.prepare("SELECT stage, start_date, end_date, status, notes FROM project_stages WHERE project_id = ? ORDER BY id").all(id);
      const forecast = db.prepare("SELECT * FROM forecast_projects WHERE project_id = ?").get(id) as Row | undefined;
      const changeOrders = db.prepare("SELECT id, description, amount, status, co_date, created_by FROM change_orders WHERE project_id = ? ORDER BY id DESC").all(id);
      const comments = db.prepare("SELECT user_name, body, created_at FROM project_comments WHERE project_id = ? ORDER BY created_at DESC LIMIT 10").all(id);
      const activity = db.prepare("SELECT user_name, action, details, created_at FROM project_activity WHERE project_id = ? ORDER BY created_at DESC LIMIT 15").all(id);
      const qbo = {
        estimates: db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) total FROM qbo_estimates WHERE project_id = ?").get(id),
        invoices: db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(balance),0) open_balance FROM qbo_invoices WHERE project_id = ?").get(id),
        bills: db.prepare("SELECT COUNT(*) n, COALESCE(SUM(total),0) total, COALESCE(SUM(derived_hours),0) outside_labor_hours FROM qbo_bills WHERE project_id = ?").get(id),
        recent_invoices: db.prepare("SELECT doc_number, txn_date, total, balance, division FROM qbo_invoices WHERE project_id = ? ORDER BY txn_date DESC LIMIT 8").all(id),
      };
      const hrs = Number(p.actual_total_hours ?? 0) + Number(p.unrecorded_hours ?? 0);
      const incentive = p.is_pipeline ? null : calcIncentive(
        Number(p.goal_hours ?? 0), hrs, Number(p.contract_value ?? 0), String(p.stage), Number(p.stage_completion ?? 0),
        Number(p.rough_hours_allowed ?? 0), Number(p.rough_hours_actual ?? 0), Number(p.finish_hours_allowed ?? 0), Number(p.finish_hours_actual ?? 0),
      );
      const out: Row = {
        ...headline(p),
        contacts: p.contacts, phone: p.phone, project_notes: p.project_notes, basecamp_link: p.basecamp_link, drive_folder: p.drive_folder,
        aliases: parseList(String(p.aliases ?? "[]")),
        hours: { rough_allowed: p.rough_hours_allowed, rough_actual: p.rough_hours_actual, finish_allowed: p.finish_hours_allowed, finish_actual: p.finish_hours_actual, unrecorded: p.unrecorded_hours },
        materials: { unrecorded: p.unrecorded_materials },
        inputs: inputs ?? "defaults (57.5% GM, 22.5% materials, 20% wages, $125/hr rate, $37/hr wage)",
        stages, forecast: forecast ?? null, incentive, change_orders: changeOrders, recent_comments: comments, recent_activity: activity, quickbooks: qbo,
        app_url: `/projects/${id}`,
      };
      if (user.canReadReports) {
        const reps = db.prepare("SELECT id FROM daily_reports WHERE project_id = ? AND status = 'confirmed' ORDER BY work_date DESC LIMIT 5").all(id) as { id: number }[];
        out.operations_log = {
          confirmed_reports: (db.prepare("SELECT COUNT(*) c FROM daily_reports WHERE project_id = ? AND status = 'confirmed'").get(id) as { c: number }).c,
          latest: reportsByIds(reps.map((r) => r.id)).map(renderReport),
        };
      }
      return j(out);
    }
    case "portfolio_summary": {
      const rows = db.prepare(`SELECT * FROM projects p WHERE p.is_pipeline = 0 AND ${scope.where}`).all(...scope.params) as Row[];
      const h = rows.map(headline);
      const sum = (k: keyof ReturnType<typeof headline>) => h.reduce((a, x) => a + Number(x[k] ?? 0), 0);
      return j({
        tracked_projects: h.length,
        by_stage: Object.fromEntries(["Underground", "Rough", "Finish", "Extras"].map((s) => [s, h.filter((x) => x.stage === s).length])),
        contract_value: sum("contract_value"), total_invoiced: sum("total_invoiced"), remaining_value: sum("remaining_value"),
        actual_hours: sum("actual_hours"), goal_hours: sum("goal_hours"),
        actual_materials: sum("actual_materials"), est_materials_budget: sum("est_materials_budget"),
        over_goal_hours: h.filter((x) => x.hours_vs_goal_pct !== null && x.hours_vs_goal_pct > 100).map((x) => ({ name: x.name, pct: x.hours_vs_goal_pct })),
        over_materials_budget: h.filter((x) => x.materials_vs_budget_pct !== null && x.materials_vs_budget_pct > 100).map((x) => ({ name: x.name, pct: x.materials_vs_budget_pct })),
        pipeline_count: (db.prepare(`SELECT COUNT(*) c FROM projects p WHERE p.is_pipeline = 1 AND ${scope.where}`).get(...scope.params) as { c: number }).c,
      });
    }
    case "search_activity": {
      const limit = Math.min(Number(input.limit ?? 30), 100);
      const conds = [scope.where]; const params: unknown[] = [...scope.params];
      if (input.project) {
        const p = findProject(user, String(input.project));
        if (p && !p.__ambiguous) { conds.push("p.id = ?"); params.push(p.id); }
      }
      if (input.query) { conds.push("(a.details LIKE ? OR a.action LIKE ?)"); params.push(`%${input.query}%`, `%${input.query}%`); }
      const activity = db.prepare(`
        SELECT a.created_at, a.user_name, a.action, a.details, p.name AS project
        FROM project_activity a JOIN projects p ON p.id = a.project_id
        WHERE ${conds.join(" AND ")} ORDER BY a.created_at DESC LIMIT ?`).all(...params, limit);
      const cconds = [scope.where]; const cparams: unknown[] = [...scope.params];
      if (input.project) { const p = findProject(user, String(input.project)); if (p && !p.__ambiguous) { cconds.push("p.id = ?"); cparams.push(p.id); } }
      if (input.query) { cconds.push("c.body LIKE ?"); cparams.push(`%${input.query}%`); }
      const comments = db.prepare(`
        SELECT c.created_at, c.user_name, c.body, p.name AS project
        FROM project_comments c JOIN projects p ON p.id = c.project_id
        WHERE ${cconds.join(" AND ")} ORDER BY c.created_at DESC LIMIT ?`).all(...cparams, limit);
      return j({ activity, comments });
    }
    case "forecast": {
      const conds = [scope.where]; const params: unknown[] = [...scope.params];
      if (input.project) { const p = findProject(user, String(input.project)); if (p && !p.__ambiguous) { conds.push("p.id = ?"); params.push(p.id); } }
      const rows = db.prepare(`
        SELECT p.id, p.name, p.foreman, p.stage, p.contract_value, p.total_invoiced,
               fp.designation, fp.underground_start, fp.rough_start, fp.rough_completion, fp.finish_start, fp.finish_completion,
               fp.payment_notes, COALESCE(fp.remaining_value, p.contract_value - p.total_invoiced) AS remaining_value
        FROM projects p LEFT JOIN forecast_projects fp ON fp.project_id = p.id
        WHERE p.is_pipeline = 0 AND ${conds.join(" AND ")} ORDER BY p.foreman, p.name`).all(...params);
      return j({ projects: rows });
    }
    case "search_operations_log": {
      if (!user.canReadReports) return j({ error: "Not permitted." });
      const hits = searchFacts(String(input.query ?? ""), 80);
      const ids = new Set<number>(hits.map((f) => f.report_id));
      let reports = reportsByIds(Array.from(ids));
      if (input.project) {
        const p = findProject(user, String(input.project));
        if (p && !p.__ambiguous) {
          const extra = db.prepare("SELECT id FROM daily_reports WHERE status='confirmed' AND project_id = ? ORDER BY work_date DESC LIMIT 15").all(p.id) as { id: number }[];
          const byId = new Map(reports.map((r) => [r.id, r]));
          for (const r of reportsByIds(extra.map((e) => e.id))) byId.set(r.id, r);
          reports = Array.from(byId.values()).filter((r) => r.project_id === p.id);
        }
      }
      if (input.date) reports = reports.filter((r) => r.work_date === String(input.date));
      if (!reports.length && !input.project && !input.date) reports = recentConfirmed(10);
      return j({ count: reports.length, reports: reports.slice(0, 25).map(renderReport) });
    }
    case "get_operations_log_report": {
      if (!user.canReadReports) return j({ error: "Not permitted." });
      const r = getReport(Number(input.id));
      if (!r) return j({ error: "No such report." });
      return j({ ...renderReport(r), status: r.status, source: r.source, transcript: r.transcript, app_url: `/reports/${r.id}` });
    }
    case "describe_schema": {
      if (!user.canSql) return j({ error: "Not permitted." });
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
        .map((t) => t.name)
        .filter((t) => !BLOCKED_TABLES.includes(t) && (user.canReadReports || !REPORT_TABLES.includes(t)) && !t.startsWith("daily_report_facts_fts"));
      return j(Object.fromEntries(tables.map((t) => [t, (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string; type: string }[]).map((c) => `${c.name} ${c.type}`)])));
    }
    case "sql_query":
      if (!user.canSql) return j({ error: "Not permitted." });
      return runSql(user, String(input.sql ?? ""));
    default:
      return j({ error: `Unknown tool ${name}` });
  }
}
