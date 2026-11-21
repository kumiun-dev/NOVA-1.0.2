import { db } from "./db";
import { processAutoReply } from "./autoReply";

type Incoming = { channel: string; contactId: string; sender: string; text: string; messageId: string; phone?: string; lid?: string; connectionRef?: string; createdAt?: string; direction?: "outgoing"; mediaType?: string; provider?: "zernio"; eventId?: string; threadId?: string; attachmentTypes?: string[] };

function nowText() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function digits(value: string) { return value.replace(/\D/g, ""); }

function leadFor(message: Incoming): number | null {
  if (message.channel === "WhatsApp" && message.phone) {
    const target = digits(message.phone);
    const rows = db.prepare("SELECT id,phone,whatsapp FROM leads WHERE phone<>'' OR whatsapp<>''").all() as { id: number; phone: string; whatsapp: string }[];
    const existing = rows.find((row) => digits(row.whatsapp) === target || digits(row.phone) === target);
    if (existing) return existing.id;
  } else if (message.contactId) {
    const existing = db.prepare("SELECT id FROM leads WHERE channel_id=? AND source=? LIMIT 1").get(message.contactId, message.channel) as { id: number } | undefined;
    if (existing) return existing.id;
  }

  const display = message.sender.trim().slice(0, 180);
  const company = message.channel === "WhatsApp" ? "WhatsApp 联系人" : `${message.channel} 联系人`;
  const phone = message.phone || "";
  const created = db.prepare(`INSERT INTO leads (company,name,phone,whatsapp,source,status,acquired_at,channel_id,note) VALUES (?,?,?,?,?,'线索',?,?,?)`).run(
    company, display, phone, message.channel === "WhatsApp" ? phone : "", message.channel, new Date().toISOString().slice(0, 10), message.contactId, "由已连接渠道的客户来信自动建立；公司资料待补充。",
  );
  return Number(created.lastInsertRowid);
}

function persistIncoming(message: Incoming): { duplicate: boolean; id?: number; reason?: string } {
  if (!message.text.trim() || !message.messageId || !message.contactId) return { duplicate: false, reason: "消息内容或会话标识为空" };
  const connectionRef = message.connectionRef || "";
  if (message.eventId && db.prepare("SELECT 1 FROM inbox WHERE channel_source=? AND connection_ref=? AND event_id=?").get(message.provider, connectionRef, message.eventId)) {
    return { duplicate: true };
  }
  if (message.lid && message.phone && connectionRef) {
    db.prepare("UPDATE inbox SET recipient_id=? WHERE channel='WhatsApp' AND connection_ref=? AND recipient_id=?")
      .run(message.phone, connectionRef, message.lid);
  }
  const exists = db.prepare("SELECT id,state FROM inbox WHERE channel=? AND source_message_id=? AND (connection_ref=? OR COALESCE(connection_ref, '')='') LIMIT 1").get(message.channel, message.messageId, connectionRef) as { id: number; state: string } | undefined;
  if (exists) return { duplicate: true, id: exists.id };
  const outgoing = message.direction === "outgoing";
  if (outgoing && db.prepare(`
    SELECT 1 FROM inbox_replies r JOIN inbox i ON i.id=r.inbox_id
    WHERE r.external_id=? AND i.channel='WhatsApp' AND (r.connection_ref=? OR i.connection_ref=?) LIMIT 1
  `).get(message.messageId, connectionRef, connectionRef)) return { duplicate: true };
  const leadId = leadFor(message);
  const result = db.prepare(`INSERT INTO inbox (lead_id,channel,sender,subject,body,classification,draft,state,created_at,recipient_id,source_message_id,reply_mode,connection_ref,direction,media_type,channel_source,attachment_types,contact_ref,event_id)
    VALUES (?,?,?,?,?,'待分类','',?,?,?,?, '',?,?,?,?,?,?,?)`).run(leadId, message.channel, message.sender || "客户", "", message.text.slice(0, 12000), outgoing ? "已发送" : "待批准", message.createdAt || nowText(), message.threadId || message.contactId, message.messageId, connectionRef, outgoing ? "outgoing" : "incoming", message.mediaType || "", message.provider || "official", JSON.stringify(message.attachmentTypes || []), message.provider ? message.contactId : "", message.eventId || "");
  return { duplicate: false, id: Number(result.lastInsertRowid) };
}

export async function storeIncoming(message: Incoming): Promise<{ duplicate: boolean; id?: number; autoReply?: boolean; reason?: string }> {
  const stored = message.provider ? db.transaction(() => persistIncoming(message)).immediate() : persistIncoming(message);
  if (!stored.id || stored.duplicate || message.direction === "outgoing" || message.mediaType || message.provider) return stored;
  const auto = await processAutoReply(stored.id);
  return { ...stored, autoReply: auto.sent, reason: auto.reason };
}

export function parseEvolutionMessages(payload: any): Incoming[] {
  const source = Array.isArray(payload?.data) ? payload.data : [payload?.data || payload];
  const out: Incoming[] = [];
  for (const item of source) {
    const key = item?.key || item?.data?.key;
    const message = item?.message || item?.data?.message;
    if (!key) continue;
    const jids = [String(key.remoteJid || ""), String(key.remoteJidAlt || "")];
    if (jids.some((jid) => /@(?:g\.us|broadcast|newsletter)$/.test(jid))) continue;
    const phoneJid = jids.find((jid) => /^\d+(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/.test(jid));
    const phone = phoneJid?.split(/[:@]/)[0];
    const lid = jids.find((jid) => /^\d+(?::\d+)?@lid$/.test(jid));
    const contactId = phone || lid;
    const media = (["image", "video", "document", "audio", "sticker"] as const).find((kind) => message?.[`${kind}Message`]);
    const content = message?.conversation || message?.extendedTextMessage?.text
      || (message?.imageMessage && (message.imageMessage.caption || "[图片]"))
      || (message?.videoMessage && (message.videoMessage.caption || "[视频]"))
      || (message?.documentMessage && (message.documentMessage.caption || message.documentMessage.fileName || "[文件]"))
      || (message?.audioMessage && "[语音]") || (message?.stickerMessage && "[贴纸]") || "";
    if (!content || !contactId) continue;
    const timestamp = Number(item?.messageTimestamp || item?.data?.messageTimestamp);
    const date = new Date(timestamp * 1000);
    const createdAt = timestamp > 0 && Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
    const sender = key.fromMe ? phone : item?.pushName || item?.data?.pushName || phone;
    out.push({ channel: "WhatsApp", contactId, sender: String(sender || "WhatsApp 客户"), text: String(content), messageId: String(key.id || ""), phone, lid, createdAt, direction: key.fromMe ? "outgoing" : undefined, mediaType: media });
  }
  return out;
}

export function parseMetaMessages(payload: any, instagramAccountId = ""): Incoming[] {
  const out: Incoming[] = [];
  for (const entry of payload?.entry || []) {
    const channel = instagramAccountId && String(entry.id || "") === instagramAccountId ? "Instagram" : "Facebook";
    for (const event of entry.messaging || []) {
      if (event?.message?.is_echo || event?.message?.is_deleted || !event?.message?.text) continue;
      const sender = String(event?.sender?.id || "");
      const messageId = String(event?.message?.mid || "");
      if (!sender || !messageId) continue;
      out.push({ channel, contactId: sender, sender: `${channel} 客户`, text: String(event.message.text), messageId, phone: "" });
    }
  }
  return out;
}
