import { NextResponse, type NextRequest } from "next/server";
import { configureWhatsAppWebhook } from "@/lib/evolution";
import { getConnection, listConnections } from "@/lib/channel-connections";
import { withAuth } from "@/lib/auth";
import { evolutionWebhookUrl } from "@/lib/public-url";

export const POST = withAuth(async function POST(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const accounts = listConnections("whatsapp");
  const connection = id ? getConnection("whatsapp", id) : accounts.length === 1 ? accounts[0] : null;
  if (!connection) return NextResponse.json({ ok: false, message: "请选择要配置收件的 WhatsApp 账号" }, { status: 400 });
  const result = await configureWhatsAppWebhook(connection.instance, evolutionWebhookUrl(req.nextUrl.origin), connection.webhookToken);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
});

