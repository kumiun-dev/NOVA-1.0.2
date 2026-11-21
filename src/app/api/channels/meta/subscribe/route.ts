import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { getConnection, listConnections } from "@/lib/channel-connections";
import { subscribeMetaPage } from "@/lib/meta-connections";

export const POST = withAuth(async function POST(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("channel") === "instagram" ? "instagram" : "facebook";
  const id = req.nextUrl.searchParams.get("id");
  const accounts = listConnections(kind);
  const connection = id ? getConnection(kind, id) : accounts.length === 1 ? accounts[0] : null;
  if (!connection) return NextResponse.json({ ok: false, error: "请选择要修复的账号" }, { status: 400 });
  try {
    await subscribeMetaPage(connection);
    return NextResponse.json({ ok: true, pageName: connection.label });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "连接 Meta 失败，请稍后重试" }, { status: 502 });
  }
});

