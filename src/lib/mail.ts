import { getGmailOAuth, getPlatformSetting } from "./db";
import { getConnection, saveConnection } from "./channel-connections";
import { canReceiveMail, canSendMail, resolveMailAccount, type MailAccount } from "./mail-accounts";
import { resolveEndpoint } from "./mailnet";
import nodemailer from "nodemailer";

async function gmailAccessToken(account: Extract<MailAccount, { type: "gmail" }>): Promise<string> {
  const { id, accessToken: access, refreshToken: refresh, expiresAt: expiry } = account;
  if (access && expiry > Date.now() + 60_000) return access;
  const connection = getConnection("gmail", id);
  const own = getGmailOAuth();
  const clientId = connection?.oauthClientId || getPlatformSetting("google_client_id");
  const clientSecret = connection?.oauthClientId
    ? (own.clientId === clientId ? own.clientSecret : "")
    : getPlatformSetting("google_client_secret");
  if (!refresh || !clientId || !clientSecret) {
    if (access && (!expiry || expiry > Date.now())) return access;
    throw new Error("Gmail 授权已失效，请重新连接 Gmail");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refresh, grant_type: "refresh_token" }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Gmail 授权刷新失败，请重新连接");
  const current = getConnection("gmail", id);
  if (!current || current.refreshToken !== refresh) throw new Error("Gmail 连接已变更，请重新选择邮箱");
  if (current.accessToken !== access && current.expiresAt > Date.now() + 60_000) return current.accessToken;
  const accessToken = String(data.access_token);
  saveConnection("gmail", id, { ...current, accessToken, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 });
  return accessToken;
}

function gmailText(payload: any): string {
  const decode = (part: any) => part?.body?.data ? Buffer.from(String(part.body.data), "base64url").toString("utf8") : "";
  const walk = (part: any): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain") return decode(part);
    for (const child of part.parts || []) { const text = walk(child); if (text) return text; }
    if (part.mimeType === "text/html") return decode(part).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?\s*>|<\/p\s*>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").trim();
    return part.parts?.length ? "" : decode(part);
  };
  return walk(payload).slice(0, 30000);
}

async function fetchGmailInbox(limit: number, account: Extract<MailAccount, { type: "gmail" }>): Promise<InboxMail[]> {
  const token = await gmailAccessToken(account);
  const headers = { Authorization: `Bearer ${token}` };
  const listResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${Math.max(1, Math.min(50, limit))}`, { headers });
  const list = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) throw new Error(list.error?.message || "Gmail 收件箱读取失败");
  const messages = list.messages || [];
  const rows = await Promise.all(messages.map(async (item: any): Promise<InboxMail | null> => {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=full`, { headers });
    const message = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    const header = (name: string) => message.payload?.headers?.find((h: any) => String(h.name).toLowerCase() === name.toLowerCase())?.value || "";
    const body = gmailText(message.payload);
    return { id: String(message.id), from: header("From"), subject: header("Subject") || "(无主题)", date: header("Date") ? new Date(header("Date")).toLocaleString("zh-CN") : new Date(Number(message.internalDate || 0)).toLocaleString("zh-CN"), preview: String(message.snippet || body).slice(0, 400), body };
  }));
  return rows.filter(Boolean) as InboxMail[];
}

export async function sendMail(opts: { to: string; subject: string; text: string }, reference?: string): Promise<{ ok: boolean; message: string; via?: string }> {
  const account = resolveMailAccount(reference);
  if (account?.type === "gmail") {
    try {
      const token = await gmailAccessToken(account);
      const from = account.label || "me";
      const encodedSubject = `=?UTF-8?B?${Buffer.from(opts.subject, "utf8").toString("base64")}?=`;
      const mime = [`From: ${from}`, `To: ${opts.to}`, `Subject: ${encodedSubject}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(opts.text, "utf8").toString("base64")].join("\r\n");
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: Buffer.from(mime, "utf8").toString("base64url") }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Gmail 发信失败");
      return { ok: true, message: "邮件已通过 Gmail 发送", via: "Google OAuth" };
    } catch (error: any) { return { ok: false, message: error?.message || "Gmail 发信失败", via: "Google OAuth" }; }
  }
  if (!account || !canSendMail(account)) {
    return { ok: false, message: reference === "gmail" ? "Gmail 尚未连接" : "未配置发信邮箱（SMTP），请在「设置」页填写。" };
  }
  const host = account.smtp_host || "";
  const port = Number(account.smtp_port || 465);
  const user = account.smtp_user;
  const pass = account.smtp_pass;
  const from = account.smtp_from || user;

  try {
    const ep = await resolveEndpoint(host, port, account.mail_proxy);
    const secure = account.smtp_secure !== "false";
    const transporter = nodemailer.createTransport({
      host: ep.host,
      port: ep.port,
      secure,
      auth: { user, pass },
      tls: { servername: ep.servername },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 60000,
    });
    await transporter.sendMail({ from, to: opts.to, subject: opts.subject, text: opts.text });
    return { ok: true, message: "已发送", via: ep.via };
  } catch (e: any) {
    return { ok: false, message: e?.message || "发送失败" };
  }
}

export type MailCheck = {
  ok: boolean;
  smtp: { ok: boolean; via: string; message: string };
  imap: { ok: boolean; via: string; message: string };
};

/** 自检：分别验证 SMTP 登录与 IMAP 登录，并报告走的直连还是代理 */
export async function verifyMail(reference?: string): Promise<MailCheck> {
  const out: MailCheck = {
    ok: false,
    smtp: { ok: false, via: "-", message: "未配置" },
    imap: { ok: false, via: "-", message: "未配置" },
  };

  const account = resolveMailAccount(reference);
  if (account?.type === "gmail") {
    try {
      const token = await gmailAccessToken(account);
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "Gmail OAuth 自检失败");
      out.smtp = { ok: true, via: "Google OAuth", message: "Gmail OAuth 发信授权通过" };
      out.imap = { ok: true, via: "Google OAuth", message: `Gmail OAuth 收件授权通过 · 收件箱 ${data.messagesTotal ?? 0} 封` };
      out.ok = true;
      return out;
    } catch (error: any) {
      out.smtp.message = error?.message || "Gmail OAuth 验证失败";
      out.imap.message = error?.message || "Gmail OAuth 验证失败";
      return out;
    }
  }

  if (!account || !canSendMail(account)) {
    out.smtp.message = reference === "gmail" ? "Gmail 尚未连接" : "缺少 smtp_host / smtp_user / smtp_pass";
  } else {
    try {
      const host = account.smtp_host || "";
      const port = Number(account.smtp_port || 465);
      const ep = await resolveEndpoint(host, port, account.mail_proxy, 6000);
      const transporter = nodemailer.createTransport({
        host: ep.host,
        port: ep.port,
        secure: account.smtp_secure !== "false",
        auth: { user: account.smtp_user, pass: account.smtp_pass },
        tls: { servername: ep.servername },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000,
      });
      await transporter.verify();
      out.smtp = { ok: true, via: ep.via, message: "SMTP 登录通过" };
    } catch (e: any) {
      out.smtp = { ok: false, via: "-", message: e?.message || "SMTP 验证失败" };
    }
  }

  if (!account || !canReceiveMail(account)) {
    out.imap.message = reference === "gmail" ? "Gmail 尚未连接" : "缺少 imap_host / imap_user / imap_pass";
  } else {
    try {
      const host = account.imap_host || "";
      const port = Number(account.imap_port || 993);
      const ep = await resolveEndpoint(host, port, account.mail_proxy, 6000);
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: ep.host,
        port: ep.port,
        secure: account.imap_secure !== "false",
        auth: { user: account.imap_user || "", pass: account.imap_pass },
        tls: { servername: ep.servername },
        logger: false,
      });
      await client.connect();
      const lock = await client.getMailboxLock("INBOX");
      const mb: any = client.mailbox;
      const count = mb ? mb.exists : 0;
      lock.release();
      await client.logout();
      out.imap = { ok: true, via: ep.via, message: `IMAP 登录通过，收件箱 ${count ?? 0} 封` };
    } catch (e: any) {
      out.imap = { ok: false, via: "-", message: e?.message || "IMAP 验证失败" };
    }
  }

  out.ok = out.smtp.ok && out.imap.ok;
  return out;
}

/** 解码 quoted-printable，并按 UTF-8 还原中文（失败则退回 latin1） */
function decodeQP(s: string): string {
  const cleaned = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i) & 0xff);
    }
  }
  const buf = Buffer.from(bytes);
  const utf8 = buf.toString("utf8");
  return utf8.includes("\uFFFD") ? buf.toString("latin1") : utf8;
}

/** 从原始邮件源码里取出可读的正文预览（处理 base64 / quoted-printable） */
type MimePart = { head: string; body: string };

function splitHeadBody(s: string): MimePart {
  const m = /\r?\n\r?\n/.exec(s);
  if (!m) return { head: s, body: "" };
  return { head: s.slice(0, m.index), body: s.slice(m.index + m[0].length) };
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把原始邮件拆成 MIME 分段（不处理嵌套，取最外层即可覆盖绝大多数邮件） */
function mimeParts(src: string): MimePart[] {
  const top = splitHeadBody(src);
  const boundary = (/boundary\s*=\s*"?([^";\r\n]+)"?/i.exec(top.head) || [])[1];
  if (!boundary) return [top];
  const chunks = top.body.split(new RegExp(`--${escapeRe(boundary)}`));
  const parts: MimePart[] = [];
  for (const c of chunks) {
    const t = c.replace(/^[^\r\n]*\r?\n/, "").replace(/\s+$/, "");
    if (!t || /^--/.test(t)) continue;
    parts.push(splitHeadBody(t));
  }
  return parts.length ? parts : [top];
}

function decodePart(p: MimePart, seen: Set<string> = new Set()): string {
  const cte = (/Content-Transfer-Encoding:\s*([\w-]+)/i.exec(p.head) || [])[1]?.toLowerCase() || "";
  const charset = ((/charset\s*=\s*"?([\w-]+)"?/i.exec(p.head) || [])[1] || "utf-8").toLowerCase();
  const isMultipart = /Content-Type:\s*multipart/i.test(p.head);
  if (isMultipart) {
    // 嵌套多段：逐段找可读正文
    for (const sub of mimeParts(p.head + "\r\n\r\n" + p.body)) {
      const txt = decodePart(sub, seen);
      if (txt.trim()) return txt;
    }
    return "";
  }
  let body = p.body;
  if (cte === "base64") {
    const clean = body.replace(/[^A-Za-z0-9+/=]/g, "");
    let buf: Buffer;
    try {
      buf = Buffer.from(clean, "base64");
    } catch {
      return "";
    }
    // 简单 charset 处理：utf-8 / ascii 直接解，其余尝试 utf-8 兜底
    body = buf.toString("utf8");
    if (!/^utf-?8$|^us-ascii$|^ascii$/.test(charset) && body.includes("\uFFFD")) {
      body = buf.toString("latin1");
    }
  } else if (cte === "quoted-printable") {
    body = decodeQP(body);
  }
  return body;
}

/** 从原始邮件源码里取出可读的正文预览 */
function extractPreview(src: string): string {
  const parts = mimeParts(src);
  const plain = parts.find((p) => /Content-Type:\s*text\/plain/i.test(p.head));
  const html = parts.find((p) => /Content-Type:\s*text\/html/i.test(p.head));
  let text = "";
  if (plain) text = decodePart(plain);
  if (!text.trim() && html) text = decodePart(html);
  if (!text.trim()) text = decodePart(parts[0]);
  // 兜底：某些邮件把编码头放在父级多段里，正文仍是 =XX 形式
  if (((text.match(/=[0-9A-F]{2}/gi) || []).length) > 2) text = decodeQP(text);
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function extractBody(src: string): string {
  const parts = mimeParts(src);
  const plain = parts.find((p) => /Content-Type:\s*text\/plain/i.test(p.head));
  const html = parts.find((p) => /Content-Type:\s*text\/html/i.test(p.head));
  let text = plain ? decodePart(plain) : "";
  if (!text.trim() && html) text = decodePart(html);
  if (!text.trim()) text = decodePart(parts[0]);
  if (((text.match(/=[0-9A-F]{2}/gi) || []).length) > 2) text = decodeQP(text);
  return text.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p\s*>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n/g, "\n\n").trim().slice(0, 30000);
}

export type InboxMail = {
  id: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
  body: string;
};

export async function fetchInbox(limit = 20, reference?: string): Promise<InboxMail[]> {
  const account = resolveMailAccount(reference);
  if (account?.type === "gmail") {
    return fetchGmailInbox(limit, account);
  }
  if (!account || !canReceiveMail(account)) return [];
  const host = account.imap_host || "";
  const port = Number(account.imap_port || 993);
  const ep = await resolveEndpoint(host, port, account.mail_proxy);
  const { ImapFlow } = await import("imapflow");
  const client = new ImapFlow({
    host: ep.host,
    port: ep.port,
    secure: account.imap_secure !== "false",
    auth: { user: account.imap_user || "", pass: account.imap_pass },
    tls: { servername: ep.servername },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    const out: InboxMail[] = [];
    try {
      const total = client.mailbox ? client.mailbox.exists : 0;
      if (!total) return [];
      const start = Math.max(1, total - limit + 1);
      const msgs = client.fetch(`${start}:*`, { envelope: true, source: true });
      for await (const msg of msgs) {
        const src = msg.source?.toString() || "";
        const preview = extractPreview(src);
        out.push({
          id: String(msg.uid || msg.seq || ""),
          from: msg.envelope?.from?.[0]?.address || "",
          subject: msg.envelope?.subject || "(无主题)",
          date: msg.envelope?.date ? new Date(msg.envelope.date).toLocaleString("zh-CN") : "",
          preview,
          body: extractBody(src),
        });
      }
    } finally {
      lock.release();
    }
    return out.reverse();
  } finally {
    if (client.usable) await client.logout().catch(() => client.close());
    else client.close();
  }
}
