import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const lead = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as any;
  if (!lead) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  const followups = db.prepare("SELECT * FROM followups WHERE lead_id = ? ORDER BY id DESC").all(id);
  const quotes = db.prepare("SELECT * FROM quotes WHERE lead_id = ? ORDER BY id DESC").all(id);
  const inbox = db.prepare("SELECT * FROM inbox WHERE lead_id = ? ORDER BY id DESC").all(id);
  return NextResponse.json({ lead, followups, quotes, inbox });
});

export const POST = withAuth(async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  if (body.action === "update") {
    db.prepare("UPDATE leads SET note = ?, status = ? WHERE id = ?").run(body.note ?? "", body.status ?? "线索", id);
    return NextResponse.json({ ok: true });
  }
  if (body.action === "followup") {
    const content = String(body.content || "").trim();
    if (!content) return NextResponse.json({ error: "内容不能为空" }, { status: 400 });
    db.prepare("INSERT INTO followups (lead_id, type, content, next_at, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(id, body.type || "跟进", content, body.next_at || "", new Date().toISOString().slice(0, 16).replace("T", " "));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
});
