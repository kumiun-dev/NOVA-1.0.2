import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { readWhatsAppAttachment } from "@/lib/evolution";
import { whatsappContinuations } from "@/lib/whatsapp-connections";
import { getConnection } from "@/lib/channel-connections";
import { zernioAttachment, zernioInboxPlatform, zernioKind } from "@/lib/zernio";
import { callZernioRelay } from "@/lib/zernio-relay-client";

export const GET = withAuth(async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  const message = db.prepare(`
    SELECT channel, channel_source, connection_ref, source_message_id, recipient_id, attachment_types FROM inbox
    WHERE id=? AND media_type<>'' AND source_message_id<>''
  `).get(id) as { channel: string; channel_source: string; connection_ref: string; source_message_id: string; recipient_id: string; attachment_types: string } | undefined;
  if (message?.channel_source === "zernio") {
    const index = Number(req.nextUrl.searchParams.get("index") || 0);
    const platform = zernioInboxPlatform(message.channel);
    const link = getConnection(zernioKind(platform), message.connection_ref);
    if (!link || link.status !== "connected" || !Number.isSafeInteger(index) || index < 0 || index >= JSON.parse(message.attachment_types).length) {
      return NextResponse.json({ error: "附件不可用" }, { status: 404 });
    }
    try {
      const actor = link.relay ? (await getRequestUser(req))?.id : undefined;
      if (link.relay && !actor) return NextResponse.json({ error: "请重新登录 NOVA。" }, { status: 401 });
      const { url } = actor ? await callZernioRelay<{ url: string }>({
        action: "attachment", actor, accountId: link.accountId, thread: message.recipient_id, mid: message.source_message_id, index,
      }) : await zernioAttachment(link.accountId, link.profileId, message.recipient_id, message.source_message_id, index, platform);
      const media = new URL(url);
      if (media.protocol !== "https:" || media.username || media.password ||
        !/^(?:[a-z\d-]+\.)*(?:fbcdn\.net|fbsbx\.com|facebook\.com|cdninstagram\.com|zernio\.com)$/i.test(media.hostname)) {
        return NextResponse.json({ error: "附件网址无效" }, { status: 404 });
      }
      return NextResponse.redirect(media, { status: 302, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    } catch { return NextResponse.json({ error: "附件无法读取，文件可能已过期" }, { status: 404 }); }
  }
  if (message?.channel !== "WhatsApp") return NextResponse.json({ error: "附件不可用" }, { status: 404 });
  const account = message ? whatsappContinuations().get(message.connection_ref) : null;
  if (!message || !account) return NextResponse.json({ error: "附件不可用" }, { status: 404 });
  const file = await readWhatsAppAttachment(account.instance, message.source_message_id);
  if (!file) return NextResponse.json({ error: "无法读取附件，文件可能已过期或过大" }, { status: 404 });
  return new Response(file.bytes, { headers: {
    "Content-Type": file.mime,
    "Content-Length": String(file.bytes.length),
    "Content-Disposition": `${file.inline && req.nextUrl.searchParams.get("download") !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16))}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
});
