import { NextResponse, type NextRequest } from "next/server";
import { fetchInbox } from "@/lib/mail";
import { listMailAccounts, resolveMailAccount, canSendMail, canReceiveMail } from "@/lib/mail-accounts";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("account") || undefined;
  const account = resolveMailAccount(requested);
  const accounts = listMailAccounts();
  let error = requested && !account ? "选择的邮箱已退出或不存在" : undefined;
  const mails = account && canReceiveMail(account) ? await fetchInbox(20, account.id).catch(() => {
    error = "无法读取该邮箱，请在「通道自检」检查连接";
    return [];
  }) : [];
  return NextResponse.json({
    account: account?.id || null, accounts, smtp: canSendMail(account), imap: canReceiveMail(account), mails,
    error,
  }, { headers: { "Cache-Control": "private, no-store" } });
});

