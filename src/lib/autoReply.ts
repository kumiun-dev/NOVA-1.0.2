import { db, getSetting } from "./db";
import { chat } from "./deepseek";
import { knowledgePrompt } from "./knowledge";
import { sendWhatsAppText } from "./evolution";
import { getConnection } from "./channel-connections";
import { recordSentReply } from "./inbox-replies";

export async function processAutoReply(inboxId: number): Promise<{ sent: boolean; reason?: string }> {
  if (getSetting("ai_auto_reply") !== "true") return { sent: false, reason: "人工回复模式" };
  const item = db.prepare("SELECT i.*,l.whatsapp,l.name AS customer_name,l.company FROM inbox i LEFT JOIN leads l ON l.id=i.lead_id WHERE i.id=?").get(inboxId) as any;
  if (!item || item.channel !== "WhatsApp") return { sent: false, reason: "自动回复仅对 WhatsApp 开放" };
  if (item.state === "已发送") return { sent: false, reason: "该会话已有回复" };
  const knowledge = knowledgePrompt(`${item.subject || ""}\n${item.body || ""}`, 4);
  let answer = "";
  try {
    answer = (await chat([
      { role: "system", content: `你是 NOVA 外贸销售助手，正在代表用户回复一位海外客户。请用客户来信的语言回复，语气自然、礼貌、简洁。先阅读以下用户知识库资料：\n${knowledge}\n\n只根据资料中明确的信息回答。不要编造价格、MOQ、认证、库存、交期或承诺；资料没有的信息，简短说明需要核实并跟进。不要称自己是 AI，不要提供与业务无关内容。只返回准备发送给客户的正文。` },
      { role: "user", content: `渠道：${item.channel}\n客户：${item.sender || item.customer_name || "客户"}\n客户消息：${item.body}` },
    ])).trim();
    if (!answer) throw new Error("AI 未生成回复内容");
  } catch (error: any) {
    db.prepare("UPDATE inbox SET draft=?,reply_mode='AI草稿' WHERE id=? AND state<>'已发送'").run("", item.id);
    return { sent: false, reason: error?.message || "AI 生成失败" };
  }
  const pending = db.prepare("UPDATE inbox SET draft=?,reply_mode='AI待发送' WHERE id=? AND state<>'已发送'").run(answer, item.id);
  if (!pending.changes) return { sent: false, reason: "该会话已有回复" };

  const connection = getConnection("whatsapp", item.connection_ref);
  if (!connection) return { sent: false, reason: "原 WhatsApp 连接已退出" };
  const result = await sendWhatsAppText(item.recipient_id || item.whatsapp || "", answer, connection.instance);
  if (!result.ok) return { sent: false, reason: result.message };
  recordSentReply(item.id, answer, "AI自动回复", result.id, connection.id);
  return { sent: true };
}
