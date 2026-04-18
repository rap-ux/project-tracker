import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== "TWE-setup-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const upsert = db.prepare(`
    INSERT INTO users (name, email, password_hash, role, foreman_name)
    VALUES (@name, @email, @password_hash, @role, @foreman_name)
    ON CONFLICT(email) DO UPDATE SET
      name          = excluded.name,
      password_hash = excluded.password_hash,
      role          = excluded.role,
      foreman_name  = excluded.foreman_name
  `);

  const users = [
    { name: "Rafael John Rivera", email: "rap@totallywiredelectric.com",    password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Cole Dixon",          email: "cole@totallywiredelectric.com",   password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Nicole Dixon",        email: "nicole@totallywiredelectric.com", password: "Admin123", role: "owner",   foreman_name: null },
    { name: "Dean",                email: "dean@twe.com",                    password: "TWE2026",  role: "foreman", foreman_name: "Dean" },
    { name: "Taimez",              email: "taimez@twe.com",                  password: "TWE2026",  role: "foreman", foreman_name: "Taimez" },
  ];

  db.transaction((list: typeof users) => {
    for (const u of list) {
      upsert.run({ ...u, password_hash: bcrypt.hashSync(u.password, 10) });
    }
  })(users);

  return NextResponse.json({ ok: true, message: "Users seeded successfully." });
}
