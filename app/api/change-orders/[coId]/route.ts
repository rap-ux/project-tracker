export const dynamic = 'force-dynamic';
import { auth }       from "@/auth";
import db              from "@/lib/db";
import { NextRequest } from "next/server";

type Ctx = { params: Promise<{ coId: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { coId } = await ctx.params;
  const body     = await req.json();

  db.prepare(`
    UPDATE change_orders
    SET description = COALESCE(@description, description),
        amount      = COALESCE(@amount, amount),
        status      = COALESCE(@status, status),
        co_date     = COALESCE(@co_date, co_date)
    WHERE id = @id
  `).run({
    id: parseInt(coId),
    description: body.description ?? null,
    amount:      body.amount != null ? Number(body.amount) : null,
    status:      body.status ?? null,
    co_date:     body.co_date ?? null,
  });

  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "owner" && role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { coId } = await ctx.params;
  db.prepare("DELETE FROM change_orders WHERE id = ?").run(parseInt(coId));
  return Response.json({ ok: true });
}
