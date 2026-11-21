import { NextResponse, type NextRequest } from "next/server";
import { sendMail } from "@/lib/mail";
import { canSendMail, listMailAccounts, resolveMailAccount } from "@/lib/mail-accounts";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  const subject = String(body.subject || "").trim();
  const text = String(body.text || "").trim();
  if (!to || !subject || !text) {
    return NextResponse.json({ error: "收件人、主题、正文都不能为空" }, { status: 400 });
  }
  const reference = typeof body.account === "string" ? body.account : "";
  const senders = listMailAccounts().filter((account) => account.smtp);
  const account = reference ? resolveMailAccount(reference) : senders.length === 1 ? resolveMailAccount(senders[0].id) : undefined;
  if (!account || !canSendMail(account)) return NextResponse.json({ error: "请选择已配置发信的邮箱" }, { status: 400 });
  const result = await sendMail({ to, subject, text }, account.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
});

