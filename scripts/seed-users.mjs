import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, "../data/projects.db"));

// Ensure users table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'admin',
    foreman_name  TEXT
  )
`);

const users = [
  { name: "Rafael John Rivera", email: "rap@totallywiredelectric.com",    password: "Admin123", role: "owner",   foreman_name: null },
  { name: "Cole Dixon",          email: "cole@totallywiredelectric.com",   password: "Admin123", role: "owner",   foreman_name: null },
  { name: "Nicole Dixon",        email: "nicole@totallywiredelectric.com", password: "Admin123", role: "owner",   foreman_name: null },
  { name: "Dean",                email: "dean@twe.com",                    password: "TWE2026",  role: "foreman", foreman_name: "Dean" },
  { name: "Taimez",              email: "taimez@twe.com",                  password: "TWE2026",  role: "foreman", foreman_name: "Taimez" },
];

const upsert = db.prepare(`
  INSERT INTO users (name, email, password_hash, role, foreman_name)
  VALUES (@name, @email, @password_hash, @role, @foreman_name)
  ON CONFLICT(email) DO UPDATE SET
    name          = excluded.name,
    password_hash = excluded.password_hash,
    role          = excluded.role,
    foreman_name  = excluded.foreman_name
`);

for (const u of users) {
  const hash = bcrypt.hashSync(u.password, 10);
  upsert.run({ ...u, password_hash: hash });
  console.log(`✅ ${u.role.padEnd(7)} — ${u.email}`);
}

console.log("\nAll users seeded successfully.");
db.close();
