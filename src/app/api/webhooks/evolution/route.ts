import { NextResponse, type NextRequest } from "next/server";
import { runWithTenantDatabase, systemDb } from "@/lib/db";
import { getConnection, listConnections } from "@/lib/channel-connections";
import { parseEvolutionMessages, storeIncoming } from "@/lib/incoming";
import { getLicense, isModuleLicensed } from "@/lib/license";
import { identifyWhatsApp, ownerForWhatsApp, recordWhatsAppOwner } from "@/lib/whatsapp-connections";

export async function POST(req: NextRequest) {
  const license = getLicense(); if (!license.valid) return NextResponse.json({ error: license.reason }, { status: 403 });
  if (!isModuleLicensed("messages")) return NextResponse.json({ error: "当前授权不包含消息功能" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const instance = String(body.instance || body.instanceName || body.data?.instance || "");
  const users = systemDb.prepare("SELECT id FROM auth_users WHERE active=1").all() as { id: string }[];
  const accountId = users.find((user) => {
    if (user.id === "owner" && instance === "beacon") return true;
    const prefix = user.id === "owner" ? "nova_owner" : `nova_${user.id.replace(/-/g, "").slice(0, 24)}`;
    return instance === prefix || instance.startsWith(`${prefix}_`);
  })?.id;
  if (!accountId) return NextResponse.json({ error: "WhatsApp 实例未登记" }, { status: 401 });
  return runWithTenantDatabase(accountId, async () => {
    let connection = listConnections("whatsapp").find((account) => account.instance === instance);
    if (!connection) return NextResponse.json({ ok: true, ignored: true });
    const token = connection.webhookToken;
    if (!token || req.nextUrl.searchParams.get("token") !== token) return NextResponse.json({ error: "webhook token 无效" }, { status: 401 });
    const event = String(body.event || body.type || "").toLowerCase().replace(/_/g, ".");
    if (event === "connection.update") {
      const owner = body.data?.state === "open" && String(body.data?.wuid || "").match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1];
      if (owner) await identifyWhatsApp(connection);
      return NextResponse.json({ ok: true, ignored: !owner });
    }
    if (event && event !== "messages.upsert" && event !== "send.message") return NextResponse.json({ ok: true, ignored: true });
    const owner = String(body.sender || "").match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1];
    const previousOwner = ownerForWhatsApp(connection.id);
    if (owner && owner !== previousOwner) {
      const updated = previousOwner ? await identifyWhatsApp(connection) : recordWhatsAppOwner(connection, owner);
      if (!updated || ownerForWhatsApp(updated.id) !== owner) return NextResponse.json({ ok: true, ignored: true });
      connection = updated;
    }
    const messages = parseEvolutionMessages(body);
    let received = 0; let autoReplies = 0;
    const reasons: string[] = [];
    for (const message of messages) {
      if (event === "send.message" && message.direction !== "outgoing") continue;
      if (!getConnection("whatsapp", connection.id)) break;
      const result = await storeIncoming({ ...message, connectionRef: connection.id });
      if (result.id) received++;
      if (result.autoReply) autoReplies++;
      if (result.reason && result.reason !== "人工回复模式") reasons.push(result.reason);
    }
    return NextResponse.json({ ok: true, received, autoReplies, ...(reasons.length ? { note: reasons[0] } : {}) });
  });
}
