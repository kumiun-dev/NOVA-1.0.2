import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getRequestUser } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import crypto from "crypto";
import { withAuth } from "@/lib/auth";
import { canSendQuote } from "@/lib/quote-assistant";

export const POST = withAuth(async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = db.prepare("SELECT id,token,approval_status FROM quotes WHERE id = ?").get(id) as { id: number; token: string; approval_status: string } | undefined;
  if (!row) return NextResponse.json({ error: "报价单不存在" }, { status: 404 });
  if (!canSendQuote(row.approval_status)) return NextResponse.json({ error: "报价须通过审批后发送。" }, { status: 409 });

  let token = row.token;
  if (!token) {
    token = crypto.randomBytes(16).toString("hex");
  }
  db.prepare("UPDATE quotes SET token=?, status=CASE WHEN status='草稿' THEN '已发' ELSE status END WHERE id=?").run(token, id);
  const user = await getRequestUser(req);
  if (user) systemDb.prepare("INSERT INTO shared_quotes (token,account_id) VALUES (?,?) ON CONFLICT(token) DO UPDATE SET account_id=excluded.account_id").run(token, user.id);
  return NextResponse.json({ ok: true, token, url: `/q/${token}` });
});
