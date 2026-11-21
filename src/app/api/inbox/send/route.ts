import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ensureChannelConnections, getConnection } from "@/lib/channel-connections";
import { sendWhatsAppText } from "@/lib/evolution";
import { languageName, translateText } from "@/lib/messages";
import { recordSentReply } from "@/lib/inbox-replies";
import { whatsAppForReply } from "@/lib/whatsapp-connections";
import { getRequestUser, withAuth } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { isAllowedZernioImage, reserveZernioSend, updateZernioConnection, zernioConfigured, ZernioError, ZERNIO_IMAGE_LIMIT, zernioMessage, zernioSendReply, zernioInboxPlatform, zernioKind, zernioLabel } from "@/lib/zernio";
import { callZernioRelay } from "@/lib/zernio-relay-client";

export const POST = withAuth(async function POST(req: NextRequest) {
  const multipart = req.headers.get("content-type")?.startsWith("multipart/form-data");
  if (multipart && Number(req.headers.get("content-length") || 0) > ZERNIO_IMAGE_LIMIT + 16_384) {
    return NextResponse.json({ error: "图片不能超过 8 MB" }, { status: 413 });
  }
  const form = multipart ? await req.formData().catch(() => null) : null;
  const { id, text, translatedText, requestId } = multipart ? Object.fromEntries(form || []) : await req.json().catch(() => ({}));
  const image = form?.get("image");
  ensureChannelConnections();
  const item = db.prepare("SELECT i.*, l.whatsapp FROM inbox i LEFT JOIN leads l ON l.id=i.lead_id WHERE i.id=?").get(Number(id)) as any;
  if (!item) return NextResponse.json({ error: "找不到这条消息" }, { status: 404 });
  if (item.channel_source === "zernio") {
    const platform = zernioInboxPlatform(item.channel);
    const connection = getConnection(zernioKind(platform), item.connection_ref);
    if (connection?.status !== "connected" || (!connection.relay && !zernioConfigured())) return NextResponse.json({ error: `请重新授权这个 ${zernioLabel(platform)}后再回复。` }, { status: 409 });
    const outgoing = typeof (translatedText || text) === "string" ? (translatedText || text).trim() : "";
    if (multipart && (!(image instanceof File) || !(await isAllowedZernioImage(image)))) {
      return NextResponse.json({ error: "请选择 8 MB 以内的 JPG、PNG 或 GIF 图片。" }, { status: 400 });
    }
    if ((!multipart && !outgoing) || outgoing.length > 2000 || !item.recipient_id) {
      return NextResponse.json({ error: "回复需要有效会话，文字长度为 1–2000 字符。" }, { status: 400 });
    }
    const key = typeof requestId === "string" && /^[a-f0-9-]{36}$/i.test(requestId) ? requestId : randomUUID();
    if (!connection.relay && !reserveZernioSend(connection.id, key)) return NextResponse.json({ error: "此主页发送过于频繁，请稍后再试。" }, { status: 429 });
    try {
      const file = image instanceof File ? image : undefined;
      let messageId: string;
      if (connection.relay) {
        const actor = (await getRequestUser(req))?.id;
        if (!actor) return NextResponse.json({ error: "请重新登录 NOVA。" }, { status: 401 });
        ({ messageId } = await callZernioRelay<{ messageId: string }>({
          action: "send", actor, accountId: connection.accountId, thread: item.recipient_id, requestId: key, text: outgoing,
        }, file));
      } else {
        ({ messageId } = await zernioSendReply(connection.accountId, connection.profileId, item.recipient_id, key, outgoing, file, platform));
      }
      const body = multipart ? "[图片]" : outgoing;
      const recorded = recordSentReply(item.id, body, "人工", messageId, "", true);
      return NextResponse.json({ ok: true, message: `${item.channel} 消息已发送`, text: body, ...recorded });
    } catch (error) {
      if (error instanceof ZernioError && (error.code === "account_disconnected" || error.code === "reconnect_required" || error.code === "wrong_profile")) {
        updateZernioConnection(connection.accountId, "expired", Date.now(), platform);
      }
      return NextResponse.json({ error: zernioMessage(error, platform) }, { status: error instanceof ZernioError && error.status === 429 ? 429 : 502 });
    }
  }
  if (multipart) return NextResponse.json({ error: "这个渠道暂时只支持文字回复。" }, { status: 400 });
  let outgoing = String(translatedText || text || "").trim();
  if (!outgoing) return NextResponse.json({ error: "回复内容不能为空" }, { status: 400 });
  const lang = item.language || "en";
  if (!translatedText && /[\u3400-\u9fff]/.test(outgoing)) {
    try { outgoing = await translateText(outgoing, languageName(lang)); }
    catch (e: any) { return NextResponse.json({ error: e?.message || "翻译失败" }, { status: 500 }); }
  }
  let result: { ok: boolean; message: string; id?: string };
  let whatsappRef = "";
  if (item.channel === "WhatsApp") {
    const { account, error, status } = await whatsAppForReply(item.connection_ref);
    if (!account) return NextResponse.json({ error }, { status });
    whatsappRef = account.id;
    result = await sendWhatsAppText(item.recipient_id || item.whatsapp || "", outgoing, account.instance);
  } else if (item.channel === "Facebook" || item.channel === "Instagram") {
    const connection = getConnection(item.channel === "Facebook" ? "facebook" : "instagram", item.connection_ref);
    if (!connection) {
      return NextResponse.json({ error: `这条消息原来的 ${item.channel} 连接已退出，已为你保留历史记录` }, { status: 409 });
    }
    const recipient = item.recipient_id;
    if (!recipient) return NextResponse.json({ error: "这条 Meta 消息尚未关联可回复的客户会话" }, { status: 400 });
    try {
      const r = await fetch("https://graph.facebook.com/v22.0/me/messages", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${connection.pageToken}` },
        body: JSON.stringify({ recipient: { id: recipient }, message: { text: outgoing }, messaging_type: "RESPONSE" }),
      });
      const data = await r.json().catch(() => ({}));
      result = r.ok ? { ok: true, message: "消息已发送", id: data?.message_id || "" } : { ok: false, message: data?.error?.message || `Meta 发送失败（${r.status}）` };
    } catch (e: any) { result = { ok: false, message: e?.message || "Meta 请求失败" }; }
  } else {
    return NextResponse.json({ error: `${item.channel} 暂不支持在此发送` }, { status: 400 });
  }
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 502 });
  const recorded = recordSentReply(item.id, outgoing, "人工", result.id, whatsappRef);
  return NextResponse.json({ ok: true, message: result.message, text: outgoing, ...recorded });
});
