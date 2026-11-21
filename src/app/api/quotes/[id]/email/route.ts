import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { listMailAccounts } from "@/lib/mail-accounts";
import { withAuth } from "@/lib/auth";
import { canSendQuote } from "@/lib/quote-assistant";

export const POST = withAuth(async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const q = db.prepare("SELECT * FROM quotes WHERE id = ?").get(id) as any;
  if (!q) return NextResponse.json({ error: "报价单不存在" }, { status: 404 });
  if (!canSendQuote(q.approval_status)) return NextResponse.json({ error: "报价须通过审批后发送。" }, { status: 409 });

  const lead = db.prepare("SELECT company, email, name FROM leads WHERE id = ?").get(q.lead_id) as any;
  const email = lead?.email || "";
  if (!email) {
    return NextResponse.json({ error: "该客户没有邮箱，无法邮件发送（可改用只读链接）" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const accounts = listMailAccounts().filter((account) => account.smtp);
  if (!accounts.length) return NextResponse.json({ error: "请先添加可发信的邮箱" }, { status: 400 });
  if (!body.account && accounts.length > 1) return NextResponse.json({ accounts, error: "请选择发件邮箱" }, { status: 409 });
  const account = body.account ? accounts.find((item) => item.id === body.account) : accounts[0];
  if (!account) return NextResponse.json({ error: "该邮箱已退出或无法发信" }, { status: 400 });

  let items: any[] = [];
  try { items = JSON.parse(q.items || "[]"); } catch {}

  const lines = items.map((it) => `- ${it.name}${it.spec ? "（" + it.spec + "）" : ""} × ${it.qty} @ ${q.currency} ${it.unit} = ${q.currency} ${it.amount}`);
  const text = [
    `Dear ${lead?.name || "Sir/Madam"},`,
    ``,
    `Please find our quotation ${q.quote_no} as follows:`,
    ``,
    ...lines,
    ``,
    `Total: ${q.currency} ${q.total}`,
    `Valid until: ${q.valid_until || "—"}`,
    ``,
    `Best regards`,
  ].join("\n");

  const r = await sendMail({ to: email, subject: `Quotation ${q.quote_no} — ${lead?.company || ""}`, text }, account.id);
  if (r.ok) {
    db.prepare("UPDATE quotes SET status = CASE WHEN status = '草稿' THEN '已发' ELSE status END WHERE id = ?").run(id);
  }
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
});
