import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "projects.db");

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}


// During Next.js production build's "Collecting page data" phase, dozens of parallel
// workers each import db.ts simultaneously. If we open SQLite here, they race on the
// WAL pragma and fail with SQLITE_BUSY. All our routes are `force-dynamic`, so no
// route actually touches the DB during build — we just need a stub that throws if
// accidentally used, while the real DB is opened lazily at runtime.
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

let db: Database.Database;

if (isBuild) {
  db = new Proxy({} as any, {
    get(_t, prop) {
      return () => {
        throw new Error(`SQLite access blocked during build: tried db.${String(prop)}`);
      };
    },
  }) as any;
} else {
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 30000");
  db.pragma("foreign_keys = ON");

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'foreman',
    foreman_name  TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    name                  TEXT    NOT NULL,
    foreman               TEXT    NOT NULL,
    stage                 TEXT    NOT NULL DEFAULT 'Rough',
    stage_completion      REAL    DEFAULT 0,
    project_completion    REAL    DEFAULT 0,
    contract_value        REAL    DEFAULT 0,
    total_invoiced        REAL    DEFAULT 0,
    est_materials_budget  REAL    DEFAULT 0,
    actual_materials      REAL    DEFAULT 0,
    est_total_hours       REAL    DEFAULT 0,
    actual_total_hours    REAL    DEFAULT 0,
    goal_hours            REAL    DEFAULT 0,
    rough_hours_allowed   REAL    DEFAULT 0,
    rough_hours_actual    REAL    DEFAULT 0,
    finish_hours_allowed  REAL    DEFAULT 0,
    finish_hours_actual   REAL    DEFAULT 0,
    updated_at            TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT    NOT NULL,
    uploaded_by  INTEGER REFERENCES users(id),
    uploaded_at  TEXT    DEFAULT (datetime('now')),
    rows_updated INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS project_inputs (
    project_id          INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    gross_margin        REAL DEFAULT 0.575,
    materials_share     REAL DEFAULT 0.225,
    wages_share         REAL DEFAULT 0.20,
    blended_hourly_rate REAL DEFAULT 125,
    blended_hourly_wage REAL DEFAULT 37,
    rough_hours_est     REAL DEFAULT 0,
    finish_hours_est    REAL DEFAULT 0,
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS forecast_projects (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    designation       TEXT    DEFAULT 'S',
    underground_start TEXT,
    rough_start       TEXT,
    rough_completion  TEXT,
    finish_start      TEXT,
    finish_completion TEXT,
    payment_notes     TEXT,
    remaining_value   REAL    DEFAULT 0,
    updated_at        TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_stages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    stage      TEXT NOT NULL,
    start_date TEXT,
    end_date   TEXT,
    status     TEXT DEFAULT 'Pending',
    notes      TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS import_batches (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT    NOT NULL,
    source       TEXT    NOT NULL DEFAULT 'bulk',
    project_id   INTEGER,
    uploaded_by  INTEGER REFERENCES users(id),
    uploaded_at  TEXT    DEFAULT (datetime('now')),
    status       TEXT    NOT NULL DEFAULT 'pending',
    applied_at   TEXT,
    reverted_at  TEXT,
    change_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS import_staged_changes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id     INTEGER NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
    project_id   INTEGER NOT NULL,
    project_name TEXT    NOT NULL,
    field        TEXT    NOT NULL,
    old_value    TEXT,
    new_value    TEXT    NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_name  TEXT    NOT NULL,
    action     TEXT    NOT NULL,
    details    TEXT,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS change_orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT    NOT NULL,
    amount      REAL    NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'Quoted',
    co_date     TEXT,
    created_by  TEXT    NOT NULL,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_comments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_name   TEXT    NOT NULL,
    body        TEXT    NOT NULL,
    mentions    TEXT,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alerts_dismissed (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT    NOT NULL,
    alert_key  TEXT    NOT NULL,
    dismissed_at TEXT  DEFAULT (datetime('now')),
    UNIQUE(user_email, alert_key)
  );
`);

// ── Migrations ────────────────────────────────────────────────────────────────
// projects: manually-tracked off-book fields
for (const col of [
  "unrecorded_materials REAL DEFAULT 0",
  "unrecorded_hours     REAL DEFAULT 0",
]) {
  try { db.exec(`ALTER TABLE projects ADD COLUMN ${col}`); } catch { /* already exists */ }
}

// projects: CRM enrichment columns
for (const col of [
  "region       TEXT",
  "builder      TEXT",
  "contacts     TEXT",
  "phone        TEXT",
  "basecamp_link TEXT",
  "drive_folder TEXT",
  "project_notes TEXT",
  "is_pipeline  INTEGER DEFAULT 0",
]) {
  try { db.exec(`ALTER TABLE projects ADD COLUMN ${col}`); } catch { /* already exists */ }
}

// ── Recalculate project_completion for all rows (runs every startup, fast) ────
// Formula: Rough/Underground = stage_completion × 0.70
//          Finish             = 0.70 + stage_completion × 0.30
//          Extras             = 1.0
//          Everything else    = 0  (Contracting Phase, etc.)
{
  const rows = db.prepare("SELECT id, stage, stage_completion FROM projects").all() as {
    id: number; stage: string; stage_completion: number;
  }[];
  const updPc = db.prepare("UPDATE projects SET project_completion = ? WHERE id = ?");
  db.transaction((rs) => {
    for (const r of rs) {
      const sc = Math.min(1, Math.max(0, r.stage_completion ?? 0));
      let pc = 0;
      if (r.stage === "Rough" || r.stage === "Underground") pc = sc * 0.70;
      else if (r.stage === "Finish")  pc = 0.70 + sc * 0.30;
      else if (r.stage === "Extras")  pc = 1.0;
      updPc.run(pc, r.id);
    }
  })(rows);
}

// forecast_projects: extra date columns
for (const col of [
  "rough_completion  TEXT",
  "finish_completion TEXT",
  "remaining_value   REAL DEFAULT 0",
]) {
  try { db.exec(`ALTER TABLE forecast_projects ADD COLUMN ${col}`); } catch { /* already exists */ }
}

// ── Initial seed: 17 active projects ─────────────────────────────────────────
const count = (db.prepare("SELECT COUNT(*) as c FROM projects").get() as { c: number }).c;

if (count === 0) {
  const ins = db.prepare(`
    INSERT INTO projects (
      name, foreman, stage, stage_completion, project_completion,
      contract_value, total_invoiced,
      est_materials_budget, actual_materials,
      est_total_hours, actual_total_hours, goal_hours,
      rough_hours_allowed, rough_hours_actual,
      finish_hours_allowed, finish_hours_actual,
      is_pipeline
    ) VALUES (
      @name, @foreman, @stage, @stage_completion, @project_completion,
      @contract_value, @total_invoiced,
      @est_materials_budget, @actual_materials,
      @est_total_hours, @actual_total_hours, @goal_hours,
      @rough_hours_allowed, @rough_hours_actual,
      @finish_hours_allowed, @finish_hours_actual,
      0
    )
  `);

  const activeProjects = [
    { name: "Camino Durango",   foreman: "Taimez",       stage: "Finish", stage_completion: 0.10, project_completion: 0.73, contract_value: 528254.62, total_invoiced: 420605.29, est_materials_budget: 118857.29, actual_materials: 98329.31,  est_total_hours: 2855.43, actual_total_hours: 1923.23, goal_hours: 2084, rough_hours_allowed: 1999, rough_hours_actual: 1923, finish_hours_allowed: 86,  finish_hours_actual: 0 },
    { name: "Calle de Debesa",  foreman: "Taimez",       stage: "Rough",  stage_completion: 1.00, project_completion: 0.70, contract_value: 523121.23, total_invoiced: 344031.03, est_materials_budget: 117702.28, actual_materials: 85935.89,  est_total_hours: 2827.68, actual_total_hours: 2064.50, goal_hours: 1979, rough_hours_allowed: 1979, rough_hours_actual: 2065, finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Heritage Pl",      foreman: "Taimez",       stage: "Rough",  stage_completion: 0.70, project_completion: 0.49, contract_value: 106270.35, total_invoiced: 45842.68,  est_materials_budget: 26567.59,  actual_materials: 5668.69,   est_total_hours: 574.43,  actual_total_hours: 384.00,  goal_hours: 281,  rough_hours_allowed: 281,  rough_hours_actual: 384,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Presilla",         foreman: "Taimez",       stage: "Rough",  stage_completion: 1.00, project_completion: 0.70, contract_value: 350906.01, total_invoiced: 260369.26, est_materials_budget: 78953.85,  actual_materials: 88863.39,  est_total_hours: 1896.79, actual_total_hours: 1395.35, goal_hours: 1328, rough_hours_allowed: 1328, rough_hours_actual: 1395, finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Via Roblada",      foreman: "Taimez",       stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 880545.00, total_invoiced: 69735.42,  est_materials_budget: 198122.63, actual_materials: 19552.36,  est_total_hours: 4759.70, actual_total_hours: 210.00,  goal_hours: 333,  rough_hours_allowed: 333,  rough_hours_actual: 210,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Pyramid",          foreman: "Damon",        stage: "Rough",  stage_completion: 0.90, project_completion: 0.63, contract_value: 196598.25, total_invoiced: 137271.63, est_materials_budget: 44234.61,  actual_materials: 21707.74,  est_total_hours: 1062.69, actual_total_hours: 921.00,  goal_hours: 669,  rough_hours_allowed: 669,  rough_hours_actual: 921,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "WoodsDrive",       foreman: "Damon",        stage: "Rough",  stage_completion: 0.20, project_completion: 0.14, contract_value: 428879.10, total_invoiced: 167018.10, est_materials_budget: 107219.78, actual_materials: 5600.18,   est_total_hours: 2897.83, actual_total_hours: 344.00,  goal_hours: 406,  rough_hours_allowed: 406,  rough_hours_actual: 344,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Cumbre Verde",     foreman: "Damon",        stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 508029.08, total_invoiced: 44740.34,  est_materials_budget: 114306.54, actual_materials: 1230.44,   est_total_hours: 2746.10, actual_total_hours: 32.00,   goal_hours: 192,  rough_hours_allowed: 192,  rough_hours_actual: 32,   finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Albright",         foreman: "Damon",        stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 514196.74, total_invoiced: 48848.69,  est_materials_budget: 115694.27, actual_materials: 0,         est_total_hours: 2779.44, actual_total_hours: 31.00,   goal_hours: 195,  rough_hours_allowed: 195,  rough_hours_actual: 31,   finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Jim Bridger",      foreman: "Damon",        stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 360275.00, total_invoiced: 34226.13,  est_materials_budget: 81061.88,  actual_materials: 2939.48,   est_total_hours: 1947.43, actual_total_hours: 68.50,   goal_hours: 136,  rough_hours_allowed: 136,  rough_hours_actual: 69,   finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "1080 Westbend",    foreman: "Taimez",       stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 709690.91, total_invoiced: 70969.10,  est_materials_budget: 159680.45, actual_materials: 0,         est_total_hours: 3836.17, actual_total_hours: 0,       goal_hours: 269,  rough_hours_allowed: 269,  rough_hours_actual: 0,    finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "540 Adelaide",     foreman: "Damon/Taimez", stage: "Rough",  stage_completion: 1.00, project_completion: 0.70, contract_value: 451020.62, total_invoiced: 269612.55, est_materials_budget: 101479.64, actual_materials: 38170.34,  est_total_hours: 2437.95, actual_total_hours: 1449.70, goal_hours: 1707, rough_hours_allowed: 1707, rough_hours_actual: 1450, finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "John Muir",        foreman: "Damon",        stage: "Rough",  stage_completion: 0.80, project_completion: 0.56, contract_value: 158895.00, total_invoiced: 61998.00,  est_materials_budget: 35751.38,  actual_materials: 13791.35,  est_total_hours: 858.89,  actual_total_hours: 576.00,  goal_hours: 481,  rough_hours_allowed: 481,  rough_hours_actual: 576,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Swarthmore",       foreman: "Damon",        stage: "Rough",  stage_completion: 0.90, project_completion: 0.63, contract_value: 131925.00, total_invoiced: 89053.50,  est_materials_budget: 29683.13,  actual_materials: 12996.14,  est_total_hours: 713.11,  actual_total_hours: 554.00,  goal_hours: 449,  rough_hours_allowed: 449,  rough_hours_actual: 554,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Bainbridge",       foreman: "Damon",        stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 165760.00, total_invoiced: 66304.00,  est_materials_budget: 37296.00,  actual_materials: 3560.09,   est_total_hours: 896.00,  actual_total_hours: 145.50,  goal_hours: 63,   rough_hours_allowed: 63,   rough_hours_actual: 146,  finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "Toyopa",           foreman: "Damon",        stage: "Rough",  stage_completion: 0.10, project_completion: 0.07, contract_value: 622200.00, total_invoiced: 59109.00,  est_materials_budget: 139995.00, actual_materials: 188.15,    est_total_hours: 3363.24, actual_total_hours: 0,       goal_hours: 235,  rough_hours_allowed: 235,  rough_hours_actual: 0,    finish_hours_allowed: 0,   finish_hours_actual: 0 },
    { name: "3746 Groves Pl",   foreman: "Taimez",       stage: "Rough",  stage_completion: 0,    project_completion: 0,    contract_value: 597039.43, total_invoiced: 59703.94,  est_materials_budget: 134333.87, actual_materials: 0,         est_total_hours: 3227.24, actual_total_hours: 0,       goal_hours: 0,    rough_hours_allowed: 0,    rough_hours_actual: 0,    finish_hours_allowed: 0,   finish_hours_actual: 0 },
  ];

  db.transaction((rows: typeof activeProjects) => {
    for (const p of rows) ins.run(p);
  })(activeProjects);
}

// ── CRM enrichment: backfill region / builder / contacts / links ──────────────
// Only runs when region IS NULL (i.e. column was just added or not yet populated)
const needsEnrichment = (db.prepare(
  "SELECT COUNT(*) as c FROM projects WHERE region IS NULL AND is_pipeline = 0"
).get() as { c: number }).c > 0;

if (needsEnrichment) {
  const upd = db.prepare(
    "UPDATE projects SET region=@region, builder=@builder, contacts=@contacts, phone=@phone, basecamp_link=@basecamp_link, drive_folder=@drive_folder WHERE name=@name"
  );

  const enrichments = [
    { name: "Camino Durango",  region: "Malibu to Camarillo",  builder: "LDMS",                        contacts: "Lora / Vince",           phone: "818.674.6075",   basecamp_link: "https://3.basecamp.com/3970872/projects/41485642", drive_folder: "[ ] Liston - 725 Camino Durango"            },
    { name: "Calle de Debesa", region: "Malibu to Camarillo",  builder: "Tom Cadden",                  contacts: "Tom Cadden",              phone: "",               basecamp_link: "https://3.basecamp.com/3970872/projects/41417320", drive_folder: "[Cadden] Gordon - 3196 Calle de Debesa"     },
    { name: "Heritage Pl",     region: "Malibu to Camarillo",  builder: "Craig Roth",                  contacts: "Craig",                   phone: "310.283.5227",   basecamp_link: "https://3.basecamp.com/3970872/projects/44696199", drive_folder: "[Roth] Nadji - 1335 Heritage Pl"            },
    { name: "Presilla",        region: "Malibu to Camarillo",  builder: "Liberty",                     contacts: "Jim / Kevin",             phone: "805-551-2256",   basecamp_link: "https://3.basecamp.com/3970872/projects/42812524", drive_folder: "12345 Presilla"                             },
    { name: "Via Roblada",     region: "Santa Barbara",         builder: "CPDG",                        contacts: "David Jaimez",            phone: "",               basecamp_link: "https://3.basecamp.com/3970872/projects/41286890", drive_folder: "[CPDG] - 4629 Via Roblada"                  },
    { name: "Pyramid",         region: "Westside - Palisades",  builder: "Svatek",                      contacts: "Mark Ranieri",            phone: "",               basecamp_link: "",                                                 drive_folder: "[Svatek] Trohman - 7330 Pyramid"            },
    { name: "WoodsDrive",      region: "Westside - Palisades",  builder: "Bruder",                      contacts: "Randy Trujillo",          phone: "",               basecamp_link: "",                                                 drive_folder: "[Bruder] Arthur - 1625 Woods St"            },
    { name: "Cumbre Verde",    region: "Westside - Palisades",  builder: "ECG",                         contacts: "Ron Gonen",               phone: "",               basecamp_link: "https://3.basecamp.com/3970872/projects/45695479", drive_folder: "[EGC] homeowner - 16633 Cumbre Verde Ct"    },
    { name: "Albright",        region: "Westside - Palisades",  builder: "Bruder",                      contacts: "Jake Jones",              phone: "",               basecamp_link: "",                                                 drive_folder: "[Bruder] Hart - 15460 Albright"             },
    { name: "Jim Bridger",     region: "Malibu to Camarillo",  builder: "Hill CCM",                    contacts: "Nik Hill",                phone: "",               basecamp_link: "https://3.basecamp.com/3970872/projects/44200748", drive_folder: "[Hill LLC] Levitt - 25021 Jim Bridger Rd"   },
    { name: "1080 Westbend",   region: "Malibu to Camarillo",  builder: "Liberty",                     contacts: "Jim Ange",                phone: "805-551-2256",   basecamp_link: "",                                                 drive_folder: "[Liberty] Shumway - 1080 Westbend Rd"       },
    { name: "540 Adelaide",    region: "Westside - Palisades",  builder: "Craig Roth",                  contacts: "Craig",                   phone: "310.283.5227",   basecamp_link: "https://3.basecamp.com/3970872/projects/41285723", drive_folder: "[Roth] _ - 540 Adelaide"                    },
    { name: "John Muir",       region: "Malibu to Camarillo",  builder: "TD Build Services",           contacts: "Tim Daugherty",           phone: "",               basecamp_link: "https://3.basecamp.com/3970872/projects/42812575", drive_folder: "[TD Build] Dunham - 6083 John Muir"         },
    { name: "Swarthmore",      region: "Westside - Palisades",  builder: "Structure Home",              contacts: "Tim R. / Joaquin Guzman", phone: "805.551.4519",   basecamp_link: "https://3.basecamp.com/3970872/projects/43626724", drive_folder: "[Structure] Tontonoz - 520 Swarthmore"      },
    { name: "Bainbridge",      region: "Westside - Palisades",  builder: "Structure Home",              contacts: "Tim R. / Chris Grasso",   phone: "805.551.4519",   basecamp_link: "https://3.basecamp.com/3970872/projects/43085477", drive_folder: "[Structure] Blackman - 10461 Bainbridge"    },
    { name: "Toyopa",          region: "Westside - Palisades",  builder: "Hill CCM",                    contacts: "Nik Hill",                phone: "",               basecamp_link: "",                                                 drive_folder: ""                                           },
    { name: "3746 Groves Pl",  region: "Malibu to Camarillo",  builder: "Premier Interior Development", contacts: "Rick Parkinson",          phone: "",               basecamp_link: "",                                                 drive_folder: ""                                           },
  ];

  db.transaction((rows: typeof enrichments) => {
    for (const r of rows) upd.run(r);
  })(enrichments);
}

// ── Pipeline projects seed ────────────────────────────────────────────────────
const pipelineCount = (db.prepare(
  "SELECT COUNT(*) as c FROM projects WHERE is_pipeline = 1"
).get() as { c: number }).c;

if (pipelineCount === 0) {
  const insPipeline = db.prepare(`
    INSERT INTO projects
      (name, foreman, stage, stage_completion, project_completion,
       contract_value, total_invoiced, is_pipeline,
       region, builder, contacts, phone, basecamp_link, drive_folder, project_notes)
    VALUES
      (@name, @foreman, @stage, 0, 0,
       0, 0, 1,
       @region, @builder, @contacts, @phone, @basecamp_link, @drive_folder, @project_notes)
  `);

  const pipeline = [
    // Damon
    { name: "148 Westgate Dr - Blivas",      foreman: "Damon", stage: "Finish",            region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Tim R.",             phone: "805.551.4519", basecamp_link: "https://3.basecamp.com/3970872/projects/40518443", drive_folder: "148 Westgate - Blivas",             project_notes: "" },
    { name: "24205 Hidden Ridge - Isa",      foreman: "Damon", stage: "Extras",            region: "Malibu to Camarillo",   builder: "Smith Bros",               contacts: "Dan / Edson",        phone: "805.796.1897", basecamp_link: "https://3.basecamp.com/3970872/projects/44000243", drive_folder: "[Smith Bros] Isa - 24205 Hidden Ridge Road", project_notes: "" },
    { name: "1131 Fiske",                    foreman: "Damon", stage: "Rough",             region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Janel",              phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/44000321", drive_folder: "",                                   project_notes: "" },
    { name: "Stafford - Higgins",            foreman: "Damon", stage: "Rough",             region: "Malibu to Camarillo",   builder: "Tom Cadden",               contacts: "Tom Cadden",         phone: "",             basecamp_link: "",                                                 drive_folder: "[Cadden] Higgins - 3005 Stafford Road", project_notes: "Small Remodel" },
    { name: "1853 N Vista",                  foreman: "Damon", stage: "Rough",             region: "Westside - Palisades",  builder: "Hill CCM",                 contacts: "Nik Hill",           phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/35171263", drive_folder: "[Hill LLC] Macon Morgl - 1853 N. Vista St", project_notes: "" },
    // Taimez
    { name: "10960 Chalon Rd",               foreman: "Taimez", stage: "Rough",            region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Bob / Jacob",        phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/43022208", drive_folder: "[Structure] Neumann - 10960 Chalon Rd", project_notes: "" },
    { name: "480 Lake Sherwood - Metzinger", foreman: "Taimez", stage: "Rough",            region: "Malibu to Camarillo",   builder: "Liberty",                  contacts: "Jim Ange",           phone: "805-551-2256", basecamp_link: "https://3.basecamp.com/3970872/projects/35171263", drive_folder: "[Liberty] Metzinger - 480 Lake Sherwood", project_notes: "" },
    // Cole (owner — pipeline he manages directly)
    { name: "Sherwood Lot 75",               foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Sherwood Development",     contacts: "Poncho",             phone: "805.796.2550", basecamp_link: "https://3.basecamp.com/3970872/projects/39211715", drive_folder: "[Sherwood] 2025 - Lot 75",           project_notes: "" },
    { name: "Sherwood Lot 76",               foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Sherwood Development",     contacts: "Poncho",             phone: "805.796.2550", basecamp_link: "https://3.basecamp.com/3970872/projects/39211760", drive_folder: "[Sherwood] 2025 - Lot 76",           project_notes: "" },
    { name: "Sherwood Lot 37",               foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Sherwood Development",     contacts: "Milan",              phone: "805.796.2550", basecamp_link: "https://3.basecamp.com/3970872/projects/39211606", drive_folder: "[Sherwood] 2025 - Lot 37",           project_notes: "" },
    { name: "Sherwood Lot 38",               foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Sherwood Development",     contacts: "Milan",              phone: "805.796.2550", basecamp_link: "https://3.basecamp.com/3970872/projects/39211649", drive_folder: "[Sherwood] 2025 - Lot 38",           project_notes: "" },
    { name: "Sherwood Lot 39",               foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Sherwood Development",     contacts: "Milan",              phone: "805.796.2550", basecamp_link: "https://3.basecamp.com/3970872/projects/39211683", drive_folder: "[Sherwood] 2025 - Lot 39",           project_notes: "" },
    { name: "2788 Monte Mar - Panel Change", foreman: "Cole",  stage: "Contracting Phase", region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Bob K",              phone: "818.384.1000", basecamp_link: "https://3.basecamp.com/3970872/projects/44000259", drive_folder: "[Structure] Eigler - 2788 Monte Mar", project_notes: "Panel Change" },
    { name: "2788 Monte Mar - Phase 1",      foreman: "Cole",  stage: "Contracting Phase", region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Bob K",              phone: "818.384.1000", basecamp_link: "https://3.basecamp.com/3970872/projects/44000286", drive_folder: "[Structure] Eigler - 2788 Monte Mar", project_notes: "In Rec Room only: Cans, outlets and 9x custom fixtures" },
    { name: "2788 Monte Mar - Phase 2",      foreman: "Cole",  stage: "Contracting Phase", region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Bob K / Chris G",    phone: "818.384.1000", basecamp_link: "https://3.basecamp.com/3970872/projects/44000317", drive_folder: "[Structure] Eigler - 2788 Monte Mar", project_notes: "Eaves outside of Rec Room: Heaters, additional cans" },
    { name: "310 Westgate",                  foreman: "Cole",  stage: "Rough",             region: "Westside - Palisades",  builder: "Structure Home",           contacts: "JR",                 phone: "818.923.9484", basecamp_link: "https://3.basecamp.com/3970872/projects/25047209", drive_folder: "[Structure] Unger - 310 Westgate",   project_notes: "" },
    { name: "321 Ennisbrook Backup Energy",  foreman: "Cole",  stage: "Rough",             region: "Santa Barbara",          builder: "TD Build Services",        contacts: "Tim Daugherty",       phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/44000354", drive_folder: "",                                   project_notes: "Solar + Battery + Energy Mgmt (Lumin)" },
    { name: "24101 Dry Canyon - Noory",      foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Kevin Diab",               contacts: "Kevin Diab",          phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/42694431", drive_folder: "[Diab] Noory - 24101 Dry Canyon Cold Creek Rd", project_notes: "Time and Materials - Not to exceed $200k" },
    { name: "620 El Medio",                  foreman: "Cole",  stage: "Rough",             region: "Westside - Palisades",  builder: "Structure Home",           contacts: "Janel",              phone: "",             basecamp_link: "",                                                 drive_folder: "[Structure] homeowner - 620 EL Medio", project_notes: "" },
    { name: "2836 Redondo Ave - Nelson",     foreman: "Cole",  stage: "Rough",             region: "Malibu to Camarillo",   builder: "Homeowner",                contacts: "Colby Nelson",        phone: "818-518-5662", basecamp_link: "https://3.basecamp.com/3970872/projects/42695786", drive_folder: "",                                   project_notes: "400A Service Change" },
    { name: "90 Giles Rd - Hedge",           foreman: "Damon", stage: "Rough",             region: "Malibu to Camarillo",   builder: "Homeowner",                contacts: "Bob Hedge",           phone: "",             basecamp_link: "https://3.basecamp.com/3970872/projects/44000201", drive_folder: "",                                   project_notes: "" },
  ];

  db.transaction((rows: typeof pipeline) => {
    for (const p of rows) insPipeline.run(p);
  })(pipeline);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function normalizeDate(s: string | null | undefined): string | null {
  if (!s || s.trim() === "" || s.trim().toUpperCase() === "N/A") return null;
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mo, dy, yr] = m;
  const year = yr.length === 2 ? "20" + yr : yr;
  return `${year}-${mo.padStart(2, "0")}-${dy.padStart(2, "0")}`;
}

// ── Add missing pipeline projects (1757 Classic Rose / 2222 Careful / 347 Blake Ridge Court) ──
const missingPipeline = [
  { name: "1757 Classic Rose",     foreman: "Taimez", stage: "Rough",             region: "Malibu to Camarillo",  builder: "Liberty",      contacts: "Jim Ange",    phone: "805-551-2256", basecamp_link: "", drive_folder: "[Liberty] Classic Rose", project_notes: "" },
  { name: "2222 Careful",          foreman: "Cole",   stage: "Finish",            region: "Malibu to Camarillo",  builder: "Homeowner",    contacts: "",            phone: "",             basecamp_link: "", drive_folder: "",                       project_notes: "" },
  { name: "347 Blake Ridge Court", foreman: "Cole",   stage: "Contracting Phase", region: "Malibu to Camarillo",  builder: "Homeowner",    contacts: "",            phone: "",             basecamp_link: "", drive_folder: "",                       project_notes: "400A service + generator" },
];
for (const p of missingPipeline) {
  const exists = (db.prepare("SELECT COUNT(*) as c FROM projects WHERE name = ?").get(p.name) as { c: number }).c;
  if (exists === 0) {
    db.prepare(`
      INSERT INTO projects
        (name, foreman, stage, stage_completion, project_completion,
         contract_value, total_invoiced, is_pipeline,
         region, builder, contacts, phone, basecamp_link, drive_folder, project_notes)
      VALUES
        (@name, @foreman, @stage, 0, 0, 0, 0, 1,
         @region, @builder, @contacts, @phone, @basecamp_link, @drive_folder, @project_notes)
    `).run(p);
  }
}

// ── project_stages seed ───────────────────────────────────────────────────────
const stageCount = (db.prepare("SELECT COUNT(*) as c FROM project_stages").get() as { c: number }).c;

if (stageCount === 0) {
  const insStage = db.prepare(`
    INSERT INTO project_stages (project_id, stage, start_date, end_date, status, notes)
    VALUES (@project_id, @stage, @start_date, @end_date, @status, @notes)
  `);

  const stageData: Array<{ project: string; stage: string; start: string; end: string; status: string; notes: string }> = [
    // ── Camino Durango ──
    { project: "Camino Durango",   stage: "Underground",  start: "5/12/2025",  end: "7/31/2025",  status: "Complete",    notes: "" },
    { project: "Camino Durango",   stage: "Rough",        start: "10/15/2025", end: "1/16/2026",  status: "Complete",    notes: "" },
    { project: "Camino Durango",   stage: "Finish",       start: "4/6/2026",   end: "7/15/2026",  status: "In Progress", notes: "" },
    // ── Calle de Debesa ──
    { project: "Calle de Debesa",  stage: "Underground",  start: "12/1/2024",  end: "3/1/2025",   status: "Complete",    notes: "" },
    { project: "Calle de Debesa",  stage: "Rough",        start: "10/15/2025", end: "3/11/2026",  status: "In Progress", notes: "8/26 - Beginning Framing" },
    { project: "Calle de Debesa",  stage: "Finish",       start: "7/1/2026",   end: "10/1/2026",  status: "Pending",     notes: "" },
    // ── Heritage Pl ──
    { project: "Heritage Pl",      stage: "Rough",        start: "1/15/2026",  end: "5/15/2026",  status: "In Progress", notes: "Will depend on framing in Kitchen" },
    { project: "Heritage Pl",      stage: "Finish",       start: "7/15/2026",  end: "9/15/2026",  status: "Pending",     notes: "" },
    // ── Presilla ──
    { project: "Presilla",         stage: "Underground",  start: "1/2/2025",   end: "4/16/2025",  status: "Complete",    notes: "" },
    { project: "Presilla",         stage: "Rough",        start: "8/4/2025",   end: "10/2/2025",  status: "Complete",    notes: "" },
    { project: "Presilla",         stage: "Finish",       start: "5/1/2026",   end: "7/1/2026",   status: "Pending",     notes: "" },
    // ── Via Roblada ──
    { project: "Via Roblada",      stage: "Underground",  start: "6/15/2025",  end: "12/1/2025",  status: "Complete",    notes: "" },
    { project: "Via Roblada",      stage: "Rough",        start: "12/1/2025",  end: "12/31/2026", status: "In Progress", notes: "" },
    { project: "Via Roblada",      stage: "Finish",       start: "2/1/2027",   end: "4/1/2027",   status: "Pending",     notes: "" },
    // ── Pyramid ──
    { project: "Pyramid",          stage: "Underground",  start: "N/A",        end: "N/A",        status: "Complete",    notes: "" },
    { project: "Pyramid",          stage: "Rough",        start: "1/15/2026",  end: "4/15/2026",  status: "In Progress", notes: "" },
    { project: "Pyramid",          stage: "Finish",       start: "6/15/2026",  end: "8/20/2026",  status: "Pending",     notes: "" },
    // ── WoodsDrive ──
    { project: "WoodsDrive",       stage: "Underground",  start: "N/A",        end: "N/A",        status: "Complete",    notes: "" },
    { project: "WoodsDrive",       stage: "Rough",        start: "2/10/2026",  end: "5/3/2026",   status: "In Progress", notes: "" },
    { project: "WoodsDrive",       stage: "Finish",       start: "7/1/2026",   end: "8/24/2026",  status: "Pending",     notes: "" },
    // ── Cumbre Verde ──
    { project: "Cumbre Verde",     stage: "Underground",  start: "2/12/2026",  end: "3/6/2026",   status: "Complete",    notes: "" },
    { project: "Cumbre Verde",     stage: "Rough",        start: "6/1/2026",   end: "9/1/2026",   status: "Pending",     notes: "" },
    { project: "Cumbre Verde",     stage: "Finish",       start: "10/1/2026",  end: "12/1/2026",  status: "Pending",     notes: "" },
    // ── Albright ──
    { project: "Albright",         stage: "Underground",  start: "3/15/2026",  end: "3/19/2026",  status: "Complete",    notes: "" },
    { project: "Albright",         stage: "Rough",        start: "7/1/2026",   end: "9/1/2026",   status: "Pending",     notes: "" },
    { project: "Albright",         stage: "Finish",       start: "11/1/2026",  end: "12/1/2026",  status: "Pending",     notes: "" },
    // ── Jim Bridger ──
    { project: "Jim Bridger",      stage: "Underground",  start: "10/15/2025", end: "11/15/2025", status: "Complete",    notes: "" },
    { project: "Jim Bridger",      stage: "Rough",        start: "4/25/2026",  end: "6/20/2026",  status: "Pending",     notes: "" },
    { project: "Jim Bridger",      stage: "Finish",       start: "8/9/2026",   end: "10/9/2026",  status: "Pending",     notes: "" },
    // ── 1080 Westbend ──
    { project: "1080 Westbend",    stage: "Underground",  start: "12/1/2025",  end: "12/15/2025", status: "Complete",    notes: "" },
    { project: "1080 Westbend",    stage: "Rough",        start: "5/1/2026",   end: "7/1/2026",   status: "Pending",     notes: "" },
    { project: "1080 Westbend",    stage: "Finish",       start: "9/1/2026",   end: "11/1/2026",  status: "Pending",     notes: "" },
    // ── 540 Adelaide ──
    { project: "540 Adelaide",     stage: "Rough",        start: "5/12/2025",  end: "8/1/2025",   status: "Complete",    notes: "" },
    { project: "540 Adelaide",     stage: "Finish",       start: "9/1/2026",   end: "11/1/2026",  status: "Pending",     notes: "" },
    // ── John Muir ──
    { project: "John Muir",        stage: "Rough",        start: "1/15/2026",  end: "4/20/2026",  status: "In Progress", notes: "" },
    { project: "John Muir",        stage: "Finish",       start: "7/1/2026",   end: "9/15/2026",  status: "Pending",     notes: "" },
    // ── Swarthmore ──
    { project: "Swarthmore",       stage: "Underground",  start: "10/1/2025",  end: "10/15/2025", status: "Complete",    notes: "" },
    { project: "Swarthmore",       stage: "Rough",        start: "1/6/2026",   end: "4/10/2026",  status: "In Progress", notes: "" },
    { project: "Swarthmore",       stage: "Finish",       start: "6/25/2026",  end: "8/25/2026",  status: "Pending",     notes: "" },
    // ── Bainbridge ──
    { project: "Bainbridge",       stage: "Rough",        start: "4/6/2026",   end: "6/15/2026",  status: "In Progress", notes: "" },
    { project: "Bainbridge",       stage: "Finish",       start: "8/15/2026",  end: "9/15/2026",  status: "Pending",     notes: "" },
    // ── Toyopa ──
    { project: "Toyopa",           stage: "Underground",  start: "3/12/2026",  end: "4/12/2026",  status: "In Progress", notes: "" },
    { project: "Toyopa",           stage: "Rough",        start: "7/12/2026",  end: "10/12/2026", status: "Pending",     notes: "" },
    { project: "Toyopa",           stage: "Finish",       start: "1/5/2027",   end: "3/5/2027",   status: "Pending",     notes: "" },
    // ── 3746 Groves Pl ──
    { project: "3746 Groves Pl",   stage: "Underground",  start: "",           end: "",           status: "Pending",     notes: "" },
    { project: "3746 Groves Pl",   stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    { project: "3746 Groves Pl",   stage: "Finish",       start: "",           end: "",           status: "Pending",     notes: "" },
    // ── Sherwood Lot 37 ──
    { project: "Sherwood Lot 37",  stage: "Rough",        start: "6/23/2025",  end: "8/24/2025",  status: "Complete",    notes: "Boxing Complete" },
    { project: "Sherwood Lot 37",  stage: "Finish",       start: "3/1/2026",   end: "7/1/2026",   status: "In Progress", notes: "" },
    // ── Sherwood Lot 38 ──
    { project: "Sherwood Lot 38",  stage: "Rough",        start: "6/9/2025",   end: "9/14/2025",  status: "Complete",    notes: "Boxing Complete" },
    { project: "Sherwood Lot 38",  stage: "Finish",       start: "12/12/2025", end: "6/15/2026",  status: "In Progress", notes: "" },
    // ── Sherwood Lot 39 ──
    { project: "Sherwood Lot 39",  stage: "Rough",        start: "7/15/2025",  end: "10/15/2025", status: "Complete",    notes: "Boxing Complete" },
    { project: "Sherwood Lot 39",  stage: "Finish",       start: "12/12/2025", end: "5/1/2026",   status: "In Progress", notes: "" },
    // ── Sherwood Lot 75 ──
    { project: "Sherwood Lot 75",  stage: "Underground",  start: "1/5/2025",   end: "5/5/2025",   status: "Complete",    notes: "" },
    { project: "Sherwood Lot 75",  stage: "Rough",        start: "5/5/2025",   end: "6/23/2025",  status: "Complete",    notes: "" },
    { project: "Sherwood Lot 75",  stage: "Finish",       start: "12/25/2025", end: "6/1/2026",   status: "In Progress", notes: "" },
    // ── Sherwood Lot 76 ──
    { project: "Sherwood Lot 76",  stage: "Underground",  start: "1/4/2025",   end: "4/28/2025",  status: "Complete",    notes: "" },
    { project: "Sherwood Lot 76",  stage: "Rough",        start: "6/5/2025",   end: "8/7/2025",   status: "Complete",    notes: "" },
    { project: "Sherwood Lot 76",  stage: "Finish",       start: "2/15/2026",  end: "6/1/2026",   status: "In Progress", notes: "" },
    // ── 148 Westgate Dr - Blivas ──
    { project: "148 Westgate Dr - Blivas",      stage: "Underground",  start: "1/8/2025",   end: "5/1/2025",   status: "Complete",    notes: "" },
    { project: "148 Westgate Dr - Blivas",      stage: "Rough",        start: "11/1/2025",  end: "4/6/2026",   status: "Complete",    notes: "" },
    { project: "148 Westgate Dr - Blivas",      stage: "Finish",       start: "5/20/2026",  end: "7/20/2026",  status: "Pending",     notes: "" },
    // ── 24205 Hidden Ridge - Isa ──
    { project: "24205 Hidden Ridge - Isa",      stage: "Rough",        start: "1/9/2025",   end: "5/1/2025",   status: "Complete",    notes: "" },
    { project: "24205 Hidden Ridge - Isa",      stage: "Finish",       start: "3/20/2026",  end: "5/20/2026",  status: "Pending",     notes: "" },
    // ── 10960 Chalon Rd ──
    { project: "10960 Chalon Rd",               stage: "Finish",       start: "8/15/2025",  end: "9/30/2025",  status: "Complete",    notes: "" },
    // ── 480 Lake Sherwood - Metzinger ──
    { project: "480 Lake Sherwood - Metzinger", stage: "Underground",  start: "2/23/2026",  end: "3/16/2026",  status: "Complete",    notes: "" },
    { project: "480 Lake Sherwood - Metzinger", stage: "Rough",        start: "6/1/2026",   end: "7/15/2026",  status: "Pending",     notes: "" },
    { project: "480 Lake Sherwood - Metzinger", stage: "Finish",       start: "9/15/2026",  end: "11/1/2026",  status: "Pending",     notes: "" },
    // ── 24101 Dry Canyon - Noory ──
    { project: "24101 Dry Canyon - Noory",      stage: "Rough",        start: "5/12/2025",  end: "2/28/2026",  status: "In Progress", notes: "" },
    // ── 2788 Monte Mar - Phase 1 ──
    { project: "2788 Monte Mar - Phase 1",      stage: "Underground",  start: "3/25/2025",  end: "4/9/2025",   status: "Complete",    notes: "" },
    { project: "2788 Monte Mar - Phase 1",      stage: "Rough",        start: "7/9/2025",   end: "8/31/2025",  status: "Complete",    notes: "" },
    { project: "2788 Monte Mar - Phase 1",      stage: "Finish",       start: "10/15/2025", end: "11/1/2025",  status: "Complete",    notes: "" },
    // ── 2788 Monte Mar - Phase 2 ──
    { project: "2788 Monte Mar - Phase 2",      stage: "Underground",  start: "3/25/2025",  end: "4/9/2025",   status: "Complete",    notes: "" },
    { project: "2788 Monte Mar - Phase 2",      stage: "Rough",        start: "12/1/2025",  end: "12/15/2025", status: "Complete",    notes: "" },
    { project: "2788 Monte Mar - Phase 2",      stage: "Finish",       start: "3/1/2026",   end: "4/1/2026",   status: "Pending",     notes: "" },
    // ── 90 Giles Rd - Hedge ──
    { project: "90 Giles Rd - Hedge",           stage: "Underground",  start: "1/12/2025",  end: "5/1/2025",   status: "Complete",    notes: "" },
    { project: "90 Giles Rd - Hedge",           stage: "Finish",       start: "8/4/2025",   end: "11/15/2025", status: "Complete",    notes: "" },
    // ── 620 El Medio ──
    { project: "620 El Medio",                  stage: "Underground",  start: "3/1/2026",   end: "5/1/2026",   status: "Pending",     notes: "" },
    { project: "620 El Medio",                  stage: "Rough",        start: "3/31/2026",  end: "5/28/2026",  status: "Pending",     notes: "" },
    { project: "620 El Medio",                  stage: "Finish",       start: "7/1/2026",   end: "9/15/2026",  status: "Pending",     notes: "" },
    // ── 310 Westgate ──
    { project: "310 Westgate",                  stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── 321 Ennisbrook Backup Energy ──
    { project: "321 Ennisbrook Backup Energy",  stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── 2836 Redondo Ave - Nelson ──
    { project: "2836 Redondo Ave - Nelson",     stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── 1131 Fiske ──
    { project: "1131 Fiske",                    stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── Stafford - Higgins ──
    { project: "Stafford - Higgins",            stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── 1853 N Vista ──
    { project: "1853 N Vista",                  stage: "Rough",        start: "",           end: "",           status: "Pending",     notes: "" },
    // ── 1757 Classic Rose ──
    { project: "1757 Classic Rose",             stage: "Underground",  start: "12/1/2025",  end: "12/15/2025", status: "Complete",    notes: "" },
    { project: "1757 Classic Rose",             stage: "Rough",        start: "4/9/2026",   end: "7/1/2026",   status: "In Progress", notes: "" },
    { project: "1757 Classic Rose",             stage: "Finish",       start: "9/1/2026",   end: "11/1/2026",  status: "Pending",     notes: "" },
    // ── 2222 Careful ──
    { project: "2222 Careful",                  stage: "Underground",  start: "6/11/2025",  end: "7/11/2025",  status: "Complete",    notes: "Underground is done" },
    { project: "2222 Careful",                  stage: "Rough",        start: "8/8/2025",   end: "11/14/2025", status: "Complete",    notes: "" },
    { project: "2222 Careful",                  stage: "Finish",       start: "5/1/2026",   end: "7/1/2026",   status: "Pending",     notes: "" },
    // ── 347 Blake Ridge Court ──
    { project: "347 Blake Ridge Court",         stage: "Rough",        start: "1/1/2025",   end: "3/1/2025",   status: "Complete",    notes: "" },
    { project: "347 Blake Ridge Court",         stage: "Finish",       start: "4/24/2025",  end: "8/8/2025",   status: "Complete",    notes: "" },
  ];

  const lookupStmt = db.prepare("SELECT id FROM projects WHERE name = ?");

  db.transaction(() => {
    for (const row of stageData) {
      const proj = lookupStmt.get(row.project) as { id: number } | undefined;
      if (!proj) continue;
      insStage.run({
        project_id: proj.id,
        stage:      row.stage,
        start_date: normalizeDate(row.start),
        end_date:   normalizeDate(row.end),
        status:     row.status,
        notes:      row.notes,
      });
    }
  })();
}

// ── Drive folder URL migration ────────────────────────────────────────────────
// Replace folder-name text with actual Google Drive URLs from the project info CSV.
// Gated: only runs if the known Via Roblada URL is not yet stored.
{
  const sample = (db.prepare("SELECT drive_folder FROM projects WHERE name = 'Via Roblada'").get() as { drive_folder: string | null } | undefined);
  const needsDriveUpdate = !sample?.drive_folder?.startsWith("https://drive.google.com");
  if (needsDriveUpdate) {
    const updDrive = db.prepare("UPDATE projects SET drive_folder = @url WHERE name = @name");
    const driveLinks: Array<{ name: string; url: string }> = [
      // Active projects
      { name: "Via Roblada",                    url: "https://drive.google.com/drive/folders/1KCUEGqtHu_vPrx-SNdMBU_lVteT1iLgi" },
      { name: "540 Adelaide",                   url: "https://drive.google.com/drive/folders/1H0wr3VIutpSIsEFfOO_Yfiar3S5x_jiv" },
      { name: "24101 Dry Canyon - Noory",       url: "https://drive.google.com/drive/folders/1uT3ZGihCq_qimfF4VdgK2XWZF-5vAkcS" },
      { name: "Camino Durango",                 url: "https://drive.google.com/drive/folders/1fycJ9xtQpV8JF4sS4C1sXuOk5jtZSpw8" },
      { name: "Presilla",                       url: "https://drive.google.com/drive/folders/1253nWLTFfJUct6_B1ytFLsVXy6pU5wYP" },
      { name: "347 Blake Ridge Court",          url: "https://drive.google.com/drive/folders/1PRipC1h9ndWgE-lqYEktpWEFpfAICkhO" },
      { name: "2222 Careful",                   url: "https://drive.google.com/drive/folders/1kuvKIrUs-HMGzbl3HcRSqRYKgeMEDCEc" },
      { name: "1757 Classic Rose",              url: "https://drive.google.com/drive/folders/1E0Ex3EMdu39u_QsUpgt0bBeTkTHsosw0" },
      { name: "Sherwood Lot 75",                url: "https://drive.google.com/drive/folders/1JCXVRR8go7DwROQaXw9xrbABAIbA-B1p" },
      { name: "Sherwood Lot 76",                url: "https://drive.google.com/drive/folders/13WRci5tJaA3OuGnifzEQot-q2rDfFfIk" },
      { name: "Sherwood Lot 37",                url: "https://drive.google.com/drive/folders/1hwwdU1Vr5y6HQC7JgdW5vkcy7vAMspkv" },
      { name: "Sherwood Lot 38",                url: "https://drive.google.com/drive/folders/1nIELLsCrYmv2sCVXN7tMiYXhoCqo8HCF" },
      { name: "Sherwood Lot 39",                url: "https://drive.google.com/drive/folders/1nMu9Rv5RVKGZr7--AEHjWw4RONMQKTG2" },
      { name: "24205 Hidden Ridge - Isa",       url: "https://drive.google.com/drive/folders/1TJmhPvN3xKhuCGnuKqJFEeIqgUtVYbMS" },
      { name: "148 Westgate Dr - Blivas",       url: "https://drive.google.com/drive/folders/1mqd-IRhcx6q8OpFCDBIbfdxHBWGGImqE" },
      { name: "2788 Monte Mar - Panel Change",  url: "https://drive.google.com/drive/folders/1VCHcMw1LvQClefI05Qy0c_YSooI8NPtJ" },
      { name: "2788 Monte Mar - Phase 1",       url: "https://drive.google.com/drive/folders/1VCHcMw1LvQClefI05Qy0c_YSooI8NPtJ" },
      { name: "2788 Monte Mar - Phase 2",       url: "https://drive.google.com/drive/folders/1VCHcMw1LvQClefI05Qy0c_YSooI8NPtJ" },
      { name: "310 Westgate",                   url: "https://drive.google.com/drive/folders/1pWEYYQZ54tmvbOCELOah0gHIcWMtSdIE" },
      { name: "Bainbridge",                     url: "https://drive.google.com/drive/folders/17Vn6LI8eDzkfNF6dzPsBn4_Nrpt0I1nX" },
      { name: "Swarthmore",                     url: "https://drive.google.com/drive/folders/13OGq6yjSr66PUEbwrusrhCNPQbKSjHon" },
      { name: "10960 Chalon Rd",                url: "https://drive.google.com/drive/folders/1rxHOYSVpu1XVryaCyEI949s-GJHK6bX2" },
      { name: "620 El Medio",                   url: "https://drive.google.com/drive/folders/1kCeKPMq75ibU7tAzxWRIGGRMmJaVL8Ud" },
      { name: "John Muir",                      url: "https://drive.google.com/drive/folders/1W1SSHigRDyt07V38NpSxfio3ds8_h4pH" },
      { name: "Calle de Debesa",                url: "https://drive.google.com/drive/folders/1QPtn1mREjzeWNcy1TBc5jkA7AwESZO4E" },
      { name: "Jim Bridger",                    url: "https://drive.google.com/drive/folders/1QW83MvMdUvXr6-2ovve0CLm2IHcpAyEO" },
      { name: "Stafford - Higgins",             url: "https://drive.google.com/drive/folders/1aiBbPVbqtBc7Nijohzd5cizCoQoKbtV-" },
      { name: "Heritage Pl",                    url: "https://drive.google.com/drive/folders/1D4FDeKuz6wFKWb3bRRMzJiYRV44kvxJF" },
      { name: "1080 Westbend",                  url: "https://drive.google.com/drive/folders/1NWjng1fgm9yOwF97KZwP-fP5yBLkz8He" },
      { name: "Albright",                       url: "https://drive.google.com/drive/folders/1mCgS1JqZnqF1y9I9EncGS6j86Wqdr4iZ" },
      { name: "Cumbre Verde",                   url: "https://drive.google.com/drive/folders/1UCjhT6_LNcetOLikS16OVAavu586DJtw" },
      { name: "WoodsDrive",                     url: "https://drive.google.com/drive/folders/1xrh24hHKbKYuWebCIioWcGaERbGK8vZg" },
      { name: "1853 N Vista",                   url: "https://drive.google.com/drive/folders/1mllwAn0kr63HgY3b0Al8cr-lPOYcIWoq" },
      { name: "480 Lake Sherwood - Metzinger",  url: "https://drive.google.com/drive/folders/1zfZlhJbgbV9AAN0-ZWvdW8EB9pvynJtL" },
      { name: "Pyramid",                        url: "https://drive.google.com/drive/folders/1DdSgTOabQvA-tpBbnJ1LWZMA_jB797tw" },
    ];
    db.transaction((rows: typeof driveLinks) => {
      for (const r of rows) updDrive.run(r);
    })(driveLinks);
  }
}

// ── Migration: add optional `title` column to users ─────────────────────────
try { db.exec(`ALTER TABLE users ADD COLUMN title TEXT`); } catch { /* already exists */ }

// ── Migration: set Rap's title to Super Admin ───────────────────────────────
try {
  db.prepare(`
    UPDATE users SET title = 'Super Admin'
    WHERE email = 'rap@totallywiredelectric.com' AND (title IS NULL OR title = '')
  `).run();
} catch {}

// ── Migration: rename Dean → Damon (data mismatch fix) ──────────────────────
// "Dean" was a typo in original user seed — actual project data uses "Damon"
try {
  const deanUser = db.prepare("SELECT id FROM users WHERE email = ? OR foreman_name = ?")
    .get("dean@twe.com", "Dean") as { id: number } | undefined;
  if (deanUser) {
    // Only rename if there isn't already a Damon user
    const damonExists = db.prepare("SELECT id FROM users WHERE foreman_name = ?")
      .get("Damon") as { id: number } | undefined;
    if (!damonExists) {
      const bcryptMig = require("bcryptjs");
      db.prepare(`
        UPDATE users
        SET name = 'Damon',
            email = 'damon@twe.com',
            foreman_name = 'Damon',
            password_hash = ?
        WHERE id = ?
      `).run(bcryptMig.hashSync("TWE2026", 10), deanUser.id);
    }
  }
} catch { /* column may not exist yet on very old DBs */ }

// ── Seed default users ───────────────────────────────────────────────────────
const userCount = (db.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
if (userCount === 0) {
  const bcrypt = require("bcryptjs");
  const insUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, foreman_name)
    VALUES (@name, @email, @password_hash, @role, @foreman_name)
  `);
  const defaultUsers = [
    { name: "Rafael John Rivera", email: "rap@totallywiredelectric.com",    password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Cole Dixon",          email: "cole@totallywiredelectric.com",   password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Nicole Dixon",        email: "nicole@totallywiredelectric.com", password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Damon",               email: "damon@twe.com",                   password: "TWE2026",  role: "foreman", foreman_name: "Damon" },
    { name: "Taimez",              email: "taimez@twe.com",                  password: "TWE2026",  role: "foreman", foreman_name: "Taimez" },
  ];
  db.transaction((users: typeof defaultUsers) => {
    for (const u of users) {
      insUser.run({ ...u, password_hash: bcrypt.hashSync(u.password, 10) });
    }
  })(defaultUsers);
}

} // end: skip init during build

export default db;
