// Run with: npx tsx scripts/seed-users.ts
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "projects.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure tables exist
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
`);

const users = [
  // Owners / admins
  { name: "Rafael John Rivera", email: "rap@totallywiredelectric.com",    password: "Admin123", role: "owner",   foreman_name: null },
  { name: "Cole Dixon",         email: "cole@totallywiredelectric.com",   password: "Admin123", role: "owner",   foreman_name: null },
  { name: "Nicole Dixon",       email: "nicole@totallywiredelectric.com", password: "Admin123", role: "owner",   foreman_name: null },
  // Foremen
  { name: "Dean",               email: "dean@twe.com",                    password: "TWE2026",  role: "foreman", foreman_name: "Dean" },
  { name: "Taimez",             email: "taimez@twe.com",                  password: "TWE2026",  role: "foreman", foreman_name: "Taimez" },
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO users (name, email, password_hash, role, foreman_name)
  VALUES (@name, @email, @password_hash, @role, @foreman_name)
`);

for (const u of users) {
  const password_hash = bcrypt.hashSync(u.password, 10);
  insert.run({ name: u.name, email: u.email, password_hash, role: u.role, foreman_name: u.foreman_name });
  console.log(`Created user: ${u.email} / ${u.password} (${u.role})`);
}

console.log("\nDone! You can now log in with these credentials.");
db.close();
