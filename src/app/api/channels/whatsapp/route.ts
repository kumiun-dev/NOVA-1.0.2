import { NextResponse, type NextRequest } from "next/server";
import { configureWhatsAppWebhook, connectWhatsAppInstance, createWhatsAppInstance, disconnectWhatsAppInstance, whatsAppState } from "@/lib/evolution";
import { createWhatsAppConnection, getConnection, listConnections, removeConnection } from "@/lib/channel-connections";
import { getRequestUser, withAuth } from "@/lib/auth";
import { evolutionWebhookUrl } from "@/lib/public-url";
import { identifyWhatsApp, ownerForWhatsApp } from "@/lib/whatsapp-connections";

const pending = new Set<string>();

async function changeConnection(req: NextRequest, id: string, change: (accountId: string) => Promise<NextResponse>) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ ok: false, message: "登录状态已失效" }, { status: 401 });
  const key = `${user.id}:${id}`;
  if (pending.has(key)) return NextResponse.json({ ok: false, message: "正在调整此连接，请稍候" }, { status: 409 });
  pending.add(key);
  try { return await change(user.id); }
  finally { pending.delete(key); }
}

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 60) : "";
  return changeConnection(req, id, async (accountId) => {
    const saved = id ? getConnection("whatsapp", id) : null;
    if (id && !saved) return NextResponse.json({ ok: false, message: "这个连接已退出" }, { status: 404 });
    const current = await whatsAppState(saved?.instance || "");
    if (!current.ok) return NextResponse.json(current, { status: 502 });
    if (current.state === "not_configured") return NextResponse.json({ ok: false, message: "WhatsApp 消息服务尚未配置" }, { status: 400 });
    if (current.state === "open" && saved) {
      const identified = await identifyWhatsApp(saved);
      return NextResponse.json({ ok: true, state: "open", id: identified?.id || saved.id });
    }

    const connection = saved ?? createWhatsAppConnection(accountId, label || "WhatsApp");
    let webhook = null;
    if (current.state === "not_linked") {
      const created = await createWhatsAppInstance(connection.instance);
      if (!created.ok) return NextResponse.json({ ...created, id: connection.id }, { status: 502 });
      webhook = await configureWhatsAppWebhook(connection.instance, evolutionWebhookUrl(req.nextUrl.origin), connection.webhookToken);
    }
    const result = await connectWhatsAppInstance(connection.instance);
    if (!result.ok) return NextResponse.json({ ok: false, id: connection.id, message: result.message }, { status: 502 });
    const active = result.state === "open" ? await identifyWhatsApp(connection) : null;
    return NextResponse.json({
      ok: true, id: active?.id || connection.id, state: result.state,
      qr: result.qr?.match(/^(?:data:image\/png;base64,)?iVBORw0KGgo/) ? result.qr : undefined,
      webhookConfigured: webhook?.ok, webhookMessage: webhook?.message,
    });
  });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, message: "请选择要退出的 WhatsApp 账号" }, { status: 400 });
  return changeConnection(req, id, async () => {
    const saved = getConnection("whatsapp", id);
    const connection = saved ? await identifyWhatsApp(saved) : null;
    if (connection) {
      const result = await disconnectWhatsAppInstance(connection.instance);
      if (!result.ok) return NextResponse.json(result, { status: 502 });
      removeConnection("whatsapp", connection.id);
    }
    return NextResponse.json({ ok: true, message: "WhatsApp 已退出" });
  });
});

export const GET = withAuth(async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const accounts = listConnections("whatsapp");
  if (id && !accounts.some((account) => account.id === id)) return NextResponse.json({ ok: false, message: "这个连接已退出" }, { status: 404 });
  const selected = id ? accounts.filter((account) => account.id === id) : accounts;
  const connections = await Promise.all(selected.map(async (account) => {
    const status = await whatsAppState(account.instance);
    const open = status.ok && status.state === "open";
    const current = open ? await identifyWhatsApp(account) : account;
    const id = current?.id || account.id;
    const owner = ownerForWhatsApp(id);
    return { id, label: account.label, ownerSuffix: owner?.slice(-4), state: status.ok ? status.state : "unknown" };
  }));
  const service = await whatsAppState("");
  return NextResponse.json({ ok: true, connections, configured: service.ok && service.state !== "not_configured" },
    { headers: { "Cache-Control": "private, no-store" } });
});

