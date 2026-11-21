import { NextResponse, type NextRequest } from "next/server";
import { db, runWithTenantDatabase, systemDb } from "@/lib/db";
import "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = systemDb.prepare("SELECT account_id FROM shared_quotes WHERE token=?").get(token) as { account_id: string } | undefined;
  if (!account) return NextResponse.json({ error: "链接无效或已过期" }, { status: 404 });
  return runWithTenantDatabase(account.account_id, () => {
    const q = db.prepare(`
      SELECT q.id, q.quote_no, q.items, q.total, q.currency, q.status, q.valid_until, q.created_at,
             l.company, l.country, l.name AS contact, l.email
      FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id
      WHERE q.token = ?
    `).get(token) as any;
    if (!q) return NextResponse.json({ error: "链接无效或已过期" }, { status: 404 });
    if (q.status === "已发") { db.prepare("UPDATE quotes SET status = '已查看' WHERE token = ?").run(token); q.status = "已查看"; }
    q.items = JSON.parse(q.items || "[]");
    return NextResponse.json({ quote: q });
  });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const account = systemDb.prepare("SELECT account_id FROM shared_quotes WHERE token=?").get(token) as { account_id: string } | undefined;
  if (!account) return NextResponse.json({ ok: false });
  return runWithTenantDatabase(account.account_id, () => {
    const r = db.prepare("UPDATE quotes SET status = '已接受', accepted_at = ? WHERE token = ? AND status IN ('已发','已查看')").run(new Date().toISOString(), token);
    return NextResponse.json({ ok: r.changes > 0 });
  });
}
