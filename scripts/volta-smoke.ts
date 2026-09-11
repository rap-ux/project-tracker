// Exercise every Volta tool against the local db without calling the model.
// Usage: npx tsx scripts/volta-smoke.ts
// Local db has the seed logins (damon@company.com); the allow-list env is set here
// because tsx does not load .env.local.
process.env.REPORTS_ALLOWED_EMAILS = "rap@totallywiredelectric.com";
import { runTool, toolsFor } from "../lib/volta/tools";
import { voltaUserFromEmail } from "../lib/volta/access";

const ok = (label: string, cond: unknown, extra = "") => { console.log(cond ? "  ok  " : "  FAIL", label, extra); if (!cond) process.exitCode = 1; };
const admin = voltaUserFromEmail("rap@totallywiredelectric.com")!;
const foreman = voltaUserFromEmail("damon@company.com")!;
console.log("admin:", admin.email, "reports:", admin.canReadReports, "sql:", admin.canSql);
console.log("foreman:", foreman.email, "reports:", foreman.canReadReports, "sql:", foreman.canSql);
ok("admin tool count", toolsFor(admin).length >= 7, String(toolsFor(admin).length));
ok("foreman has no sql", !toolsFor(foreman).some(t => t.name === "sql_query"));

(async () => {
  const lp = JSON.parse(await runTool(admin, "list_projects", {}));
  ok("list_projects tracked", lp.count === 17, String(lp.count));
  const lpf = JSON.parse(await runTool(foreman, "list_projects", { include_pipeline: true }));
  ok("foreman sees only Damon projects", lpf.projects.every((p: any) => String(p.foreman).includes("Damon")), String(lpf.count));
  const gp = JSON.parse(await runTool(admin, "get_project", { project: "pyramid" }));
  ok("get_project Pyramid", gp.name === "Pyramid" && gp.incentive && Array.isArray(gp.stages) && gp.quickbooks, `${gp.stages?.length} stages, ${gp.operations_log?.confirmed_reports} log reports`);
  const amb = JSON.parse(await runTool(admin, "get_project", { project: "sherwood" }));
  ok("ambiguous name asks", Array.isArray(amb.candidates) && amb.candidates.length > 1);
  const denied = JSON.parse(await runTool(foreman, "get_project", { project: "Camino Durango" }));
  ok("foreman denied Taimez project", !!denied.error);
  const ps = JSON.parse(await runTool(admin, "portfolio_summary", {}));
  ok("portfolio totals", ps.tracked_projects === 17 && ps.contract_value > 1e6, `$${Math.round(ps.contract_value)} contract, ${ps.over_goal_hours.length} over goal`);
  const act = JSON.parse(await runTool(admin, "search_activity", { limit: 5 }));
  ok("search_activity", Array.isArray(act.activity) && Array.isArray(act.comments));
  const fc = JSON.parse(await runTool(admin, "forecast", { project: "Pyramid" }));
  ok("forecast for one project", fc.projects.length === 1);
  const ol = JSON.parse(await runTool(admin, "search_operations_log", { query: "chandelier" }));
  ok("operations log search (test report #1)", ol.count >= 1 && ol.reports[0].job === "Pyramid", JSON.stringify(ol.reports[0]?.accomplished));
  const olDenied = JSON.parse(await runTool(foreman, "search_operations_log", { query: "chandelier" }));
  ok("foreman off allow-list denied log", !!olDenied.error);
  const schema = JSON.parse(await runTool(admin, "describe_schema", {}));
  ok("schema hides users/qbo_connection", !("users" in schema) && !("qbo_connection" in schema) && "projects" in schema);
  const q = JSON.parse(await runTool(admin, "sql_query", { sql: "SELECT foreman, COUNT(*) n, SUM(contract_value) cv FROM projects WHERE is_pipeline=0 GROUP BY foreman" }));
  ok("sql_query works", Array.isArray(q.rows) && q.rows.length >= 2, JSON.stringify(q.rows));
  ok("sql blocks writes", !!JSON.parse(await runTool(admin, "sql_query", { sql: "DELETE FROM projects" })).error);
  ok("sql blocks users table", !!JSON.parse(await runTool(admin, "sql_query", { sql: "SELECT * FROM users" })).error);
  ok("sql blocks multi-statement", !!JSON.parse(await runTool(admin, "sql_query", { sql: "SELECT 1; SELECT 2" })).error);
  ok("sql blocks pragma", !!JSON.parse(await runTool(admin, "sql_query", { sql: "PRAGMA table_info(projects)" })).error);
})();
