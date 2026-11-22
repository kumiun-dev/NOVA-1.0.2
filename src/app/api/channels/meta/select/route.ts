import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { finishOAuthFlow, getConnection, getOAuthFlow, saveConnection } from "@/lib/channel-connections";
import { subscribeMetaPage } from "@/lib/meta-connections";

export const GET = withAuth(async function GET(req: NextRequest) {
  const flow = getOAuthFlow(req.nextUrl.searchParams.get("pick") || "");
  if (!flow?.options || flow.kind === "gmail") return NextResponse.json({ error: "选择已过期，请重新授权" }, { status: 404 });
  return NextResponse.json({ channel: flow.kind, options: flow.options.map(({ assetId, label }) => ({ id: assetId, label })) },
    { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const { pick, id } = await req.json().catch(() => ({}));
  if (typeof pick !== "string" || typeof id !== "string") return NextResponse.json({ error: "请选择要添加的账号" }, { status: 400 });
  const flow = getOAuthFlow(pick);
  const connection = flow?.options?.find((option) => option.assetId === id);
  if (!flow || !connection || flow.kind === "gmail") return NextResponse.json({ error: "选择已过期，请重新授权" }, { status: 404 });
  const kind = flow.kind;
  if (getConnection(kind, id)) return NextResponse.json({ error: "该账号已连接" }, { status: 409 });
  try { await subscribeMetaPage(connection); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "消息订阅失败" }, { status: 502 }); }
  const saved = db.transaction(() => {
    if (getConnection(kind, id) || !finishOAuthFlow(pick)) return false;
    saveConnection(kind, id, connection);
    return true;
  })();
  return NextResponse.json(saved ? { ok: true } : { error: "该账号已连接或选择已过期" }, { status: saved ? 200 : 409 });
});

