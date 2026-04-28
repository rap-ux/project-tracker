export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { auth } from "@/auth";
import db from "@/lib/db";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import type { NextRequest } from "next/server";

// Keep in sync with Navbar's SUPER_ADMIN_EMAILS list.
const SUPER_ADMIN_EMAILS = ["rap@totallywiredelectric.com"];

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const providedSecret = url.searchParams.get("secret");
  const expectedSecret = process.env.BACKUP_SECRET;

  // Two ways in: matching ?secret= (for cron hitters) OR a super-admin session.
  const secretOk = !!expectedSecret && providedSecret === expectedSecret;
  if (!secretOk) {
    const session = await auth();
    const email = session?.user?.email ?? "";
    if (!SUPER_ADMIN_EMAILS.includes(email)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.BACKUP_TO_EMAIL || user;

  if (!user || !pass || !to) {
    return Response.json(
      { error: "SMTP not configured. Set SMTP_USER, SMTP_PASS, BACKUP_TO_EMAIL." },
      { status: 503 }
    );
  }

  db.pragma("wal_checkpoint(TRUNCATE)");
  const dbPath = path.join(process.cwd(), "data", "projects.db");
  const buf = fs.readFileSync(dbPath);

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `projects-${stamp}.db`;
  const sizeKb = (buf.byteLength / 1024).toFixed(1);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from: user,
    to,
    subject: `TWE Switchboard backup — ${stamp}`,
    text:
      `Automatic database backup attached.\n\n` +
      `File: ${filename}\nSize: ${sizeKb} KB\nGenerated: ${new Date().toISOString()}\n\n` +
      `To restore: see the recovery steps in your notes (railway ssh + base64 decode).`,
    attachments: [{ filename, content: buf }],
  });

  return Response.json({
    ok: true,
    sent_to: to,
    filename,
    size_bytes: buf.byteLength,
  });
}
