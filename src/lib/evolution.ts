import { CUSTOMER_EDITION } from "./edition";
import { evolutionFetch } from "./whatsapp-gateway";
import { getPlatformSetting, getSetting } from "./db";

export function evolutionConfig() {
  if (CUSTOMER_EDITION) return { url: "https://whatsapp.nova.invalid", key: "" };
  const url = (getPlatformSetting("evolution_url") || process.env.EVOLUTION_URL || getSetting("evolution_url") || "").replace(/\/+$/, "");
  const key = getPlatformSetting("evolution_key") || process.env.EVOLUTION_KEY || getSetting("evolution_key") || "";
  return { url, key };
}

export type QrResult = { ok: boolean; message: string; qr?: string; state?: "open" };

// Evolution adds a fixed wait to instance creation when requested to return a QR code.
export async function createWhatsAppInstance(instanceName: string): Promise<{ ok: boolean; message: string }> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: false, message: "未配置 Evolution API 地址，请先在「设置」页填写" };
  try {
    const res = await evolutionFetch(`${url}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { apikey: key } : {}) },
      body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || (res.status === 403 && /already in use/i.test(JSON.stringify(data)))) {
      return { ok: true, message: "实例已就绪" };
    }
    const detail = data?.response?.message || data?.message || data?.error;
    return { ok: false, message: typeof detail === "string" ? detail : `创建实例失败（${res.status}）` };
  } catch (e: any) {
    return { ok: false, message: e?.message || "无法连接 Evolution 服务" };
  }
}

// 对已存在实例调 connect，重新生成扫码二维码
export async function connectWhatsAppInstance(instanceName = "beacon"): Promise<QrResult> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: false, message: "未配置 Evolution API 地址，请先在「设置」页填写" };
  try {
    const res = await evolutionFetch(`${url}/instance/connect/${encodeURIComponent(instanceName)}`, {
      method: "GET",
      headers: key ? { apikey: key } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.instance?.state === "open") return { ok: true, message: "已连接，无需扫码", state: "open" };
    if (!res.ok || data?.error === true) {
      const m = data?.response?.message || data?.message || data?.error;
      return { ok: false, message: typeof m === "string" ? m : `获取二维码失败（${res.status}）` };
    }
    const qr = data?.qrcode?.base64 || data?.qrcode?.code || data?.pairingCode?.base64 || data?.pairingCode?.code || data?.qr || data?.base64 || "";
    if (qr) return { ok: true, message: "请用手机 WhatsApp 扫码", qr };
    return { ok: true, message: "正在等待 WhatsApp 生成二维码" };
  } catch (e: any) {
    return { ok: false, message: e?.message || "无法连接 Evolution 服务" };
  }
}

export type WhatsAppConnectionState = "not_configured" | "not_linked" | "open" | "close" | "connecting";
export type WhatsAppStatusResult =
  | { ok: true; state: WhatsAppConnectionState }
  | { ok: false; message: string };

export async function whatsAppState(instanceName: string): Promise<WhatsAppStatusResult> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: true, state: "not_configured" };
  if (!instanceName) return { ok: true, state: "not_linked" };
  try {
    const res = await evolutionFetch(`${url}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      headers: key ? { apikey: key } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json().catch(() => ({}));
    const errorMessage = String(data?.response?.message ?? data?.message ?? "");
    if (res.status === 404 && /instance does not exist/i.test(errorMessage)) return { ok: true, state: "not_linked" };
    if (!res.ok) return { ok: false, message: `暂时无法查询 WhatsApp 连接状态（HTTP ${res.status}）` };
    const state = String(data?.instance?.state ?? data?.state ?? "").toLowerCase();
    if (state === "refused") return { ok: true, state: "close" };
    if (state === "open" || state === "close" || state === "connecting") return { ok: true, state };
    return { ok: false, message: "消息服务未返回有效的 WhatsApp 连接状态" };
  } catch {
    return { ok: false, message: "暂时无法连接消息服务，请稍后重试" };
  }
}

export async function disconnectWhatsAppInstance(instanceName: string): Promise<{ ok: boolean; message: string }> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: false, message: "WhatsApp 消息服务尚未配置" };
  try {
    const response = await evolutionFetch(`${url}/instance/delete/${encodeURIComponent(instanceName)}`, {
      method: "DELETE",
      headers: key ? { apikey: key } : {},
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    const detail = String(data?.response?.message ?? data?.message ?? "");
    if ((response.ok && !data?.error) || (response.status === 404 && /instance does not exist/i.test(detail))) {
      return { ok: true, message: "WhatsApp 已退出" };
    }
    return { ok: false, message: `WhatsApp 退出失败（HTTP ${response.status}），请稍后重试` };
  } catch {
    return { ok: false, message: "暂时无法连接 WhatsApp 消息服务，请稍后重试" };
  }
}

export async function sendWhatsAppText(number: string, text: string, instanceName = "beacon"): Promise<{ ok: boolean; message: string; id?: string }> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: false, message: "未配置 Evolution API 地址" };
  if (number.includes("@")) return { ok: false, message: "这条消息没有可用的 WhatsApp 手机号" };
  const digits = number.replace(/[^\d]/g, "");
  if (!digits) return { ok: false, message: "客户没有可用的 WhatsApp 号码" };
  try {
    const res = await evolutionFetch(`${url}/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { apikey: key } : {}) },
      body: JSON.stringify({ number: digits, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, message: data?.message?.[0] || data?.message || `WhatsApp 发送失败（${res.status}）` };
    return { ok: true, message: "WhatsApp 消息已发送", id: data?.key?.id || data?.messageId || "" };
  } catch (e: any) {
    return { ok: false, message: e?.message || "无法连接 Evolution 服务" };
  }
}

export async function configureWhatsAppWebhook(instanceName: string, callbackUrl: string, token: string): Promise<{ ok: boolean; message: string }> {
  const { url, key } = evolutionConfig();
  if (!url) return { ok: false, message: "Evolution API 地址未配置" };
  const target = new URL(callbackUrl);
  target.searchParams.set("token", token);
  try {
    const response = await evolutionFetch(`${url}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { apikey: key } : {}) },
      body: JSON.stringify({ webhook: { enabled: true, url: target.toString(), webhookByEvents: false, webhookBase64: false, events: ["MESSAGES_UPSERT", "SEND_MESSAGE", "CONNECTION_UPDATE"] } }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, message: data?.response?.message?.[0] || data?.message || `Evolution webhook 设置失败（${response.status}）` };
    return { ok: true, message: "WhatsApp 收消息 webhook 已启用" };
  } catch (error: any) {
    return { ok: false, message: error?.message || "无法配置 WhatsApp webhook" };
  }
}

export async function whatsAppOwner(instance: string): Promise<string | null> {
  const { url, key } = evolutionConfig();
  if (!url || !instance) return null;
  try {
    const response = await evolutionFetch(`${url}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`, {
      headers: key ? { apikey: key } : {}, cache: "no-store", signal: AbortSignal.timeout(3500),
    });
    const data = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(data)) return null;
    const current = data.find((item) => (item.name || item.instance?.instanceName) === instance);
    const jid = String(current?.ownerJid || current?.owner || current?.instance?.ownerJid || current?.instance?.owner || "");
    return jid.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function whatsAppProfilePicture(instance: string, number: string): Promise<string | null> {
  const { url, key } = evolutionConfig();
  if (!url || !/^\d{5,18}$/.test(number)) return null;
  try {
    const response = await evolutionFetch(`${url}/chat/fetchProfilePictureUrl/${encodeURIComponent(instance)}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { apikey: key } : {}) },
      body: JSON.stringify({ number }), signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    if (!response.ok || !data.profilePictureUrl) return null;
    const picture = new URL(data.profilePictureUrl);
    return picture.protocol === "https:" && !picture.username && !picture.password && !picture.port
      && /(^|\.)(whatsapp\.net|whatsapp\.com|fbcdn\.net)$/.test(picture.hostname) ? picture.href : null;
  } catch {
    return null;
  }
}

export async function readWhatsAppAttachment(instance: string, id: string) {
  const { url, key } = evolutionConfig();
  if (!url) return null;
  try {
    const response = await evolutionFetch(`${url}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(key ? { apikey: key } : {}) },
      body: JSON.stringify({ message: { key: { id } }, convertToMp4: false }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    const limit = 16 * 1024 * 1024;
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof data.base64 !== "string" || !data.base64) return null;
    const mime = String(data.mimetype || "").split(";")[0].toLowerCase();
    const inline = /^(?:image\/(?:png|jpe?g|webp|gif)|audio\/(?:ogg|mpeg|mp4|webm|wav)|video\/(?:mp4|webm))$/.test(mime);
    const filename = String(data.fileName || "WhatsApp 附件").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
    return { bytes: new Uint8Array(Buffer.from(data.base64, "base64")), mime: inline ? mime : "application/octet-stream", inline, filename };
  } catch {
    return null;
  }
}
