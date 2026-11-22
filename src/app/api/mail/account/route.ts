import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { removeConnection } from "@/lib/channel-connections";
import { listMailAccounts, resolveMailAccount } from "@/lib/mail-accounts";

export const GET = withAuth(async function GET() {
  return NextResponse.json({ accounts: listMailAccounts() }, { headers: { "Cache-Control": "private, no-store" } });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("account");
  const account = id ? resolveMailAccount(id) : null;
  if (!account || !removeConnection(account.type, account.id)) return NextResponse.json({ error: "该邮箱已退出或不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, message: `${account.label} 已退出` });
});

