import { randomUUID } from "node:crypto";
import { db, systemDb, getPlatformSetting } from "./db";
import { getConnection, saveConnection, type MetaChannel, type ZernioPlatform } from "./channel-connections";

const API = "https://zernio.com/api/v1";
export const zernioId = /^[a-f\d]{24}$/i;
export const zernioRef = (accountId: string) => `zernio-${accountId}`;
const ZERNIO_LABELS = { facebook: "Facebook 主页", instagram: "Instagram 账号", linkedin: "LinkedIn 账号" };
export const isZernioPlatform = (value: unknown): value is ZernioPlatform => typeof value === "string" && Object.hasOwn(ZERNIO_LABELS, value);
export const zernioKind = (platform: ZernioPlatform) => `zernio_${platform}` as const;
export const zernioLabel = (platform: ZernioPlatform) => ZERNIO_LABELS[platform];
export const zernioInboxPlatform = (channel: string): MetaChannel => channel === "Instagram" ? "instagram" : "facebook";
export const zernioConfigured = () => Boolean(getPlatformSetting("zernio_api_key").trim() && getPlatformSetting("zernio_webhook_secret").trim());
export const ZERNIO_IMAGE_LIMIT = 8 * 1024 * 1024;

export async function isAllowedZernioImage(file: File) {
  if (file.size <= 0 || file.size > ZERNIO_IMAGE_LIMIT) return false;
  const head = Buffer.from(await file.slice(0, 12).arrayBuffer());
  return (file.type === "image/jpeg" && head.subarray(0, 3).toString("hex") === "ffd8ff") ||
    (file.type === "image/png" && head.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") ||
    (file.type === "image/gif" && /^GIF8[79]a/.test(head.toString("ascii")));
}

export class ZernioError extends Error {
  constructor(public status: number, public code = "") {
    super("社媒服务 请求失败");
  }
}

export async function zernioRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getPlatformSetting("zernio_api_key").trim();
  if (!key) throw new ZernioError(503, "missing_key");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${key}`);
  if (typeof init?.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, {
    ...init, headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new ZernioError(502, "unavailable"); });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ZernioError(response.status, typeof data?.code === "string" ? data.code : "");
  if (response.status !== 204 && (!data || data.success === false)) throw new ZernioError(502);
  return data as T;
}

export function zernioMessage(error: unknown, platform: ZernioPlatform = "facebook") {
  if (error instanceof ZernioError) {
    if (error.code === "relay_upgrade_required") return `请先更新 NOVA 托管主站以支持 ${zernioLabel(platform)}授权。`;
    if (error.code === "relay_disabled") return "NOVA 主站尚未为此服务器开通 社媒服务 接入，请联系管理员。";
    if (error.code === "relay_license") return "当前服务器授权无效或缺少社媒和消息权限。";
    if (error.code === "page_limit") return `已达到 NOVA 管理员为此服务器设置的 ${zernioLabel(platform)}名额。`;
    if (error.code === "connect_pending") return "此服务器已有一个账号授权正在进行，请完成后再添加。";
    if (error.status === 402) return "社媒服务 连接名额或用量不足，请联系管理员查看账单。";
    if (error.status === 429) return "此主页发送过于频繁，请稍后再试。";
    if (error.status === 401 || error.code === "missing_key") return "社媒服务 API 密钥不可用，请联系管理员。";
    if (error.status === 409 || error.code === "account_disconnected") return `请重新授权这个 ${zernioLabel(platform)}。`;
    if (error.code === "platform_api_error" && platform !== "linkedin") return `${platform === "instagram" ? "Instagram" : "Facebook"} 拒绝发送。请检查私信权限和回复时限。`;
  }
  return "社媒服务 暂时无法完成操作，请稍后重试。";
}

export async function zernioProfile(ownerId: string) {
  systemDb.prepare("INSERT OR IGNORE INTO zernio_profiles (owner_id, external_id) VALUES (?, ?)").run(ownerId, `nova-${randomUUID()}`);
  const row = systemDb.prepare("SELECT external_id, profile_id FROM zernio_profiles WHERE owner_id=?").get(ownerId) as { external_id: string; profile_id: string | null };
  if (row.profile_id) return row.profile_id;
  let profile: { _id: string; externalId?: string } | undefined;
  try {
    const result = await zernioRequest<{ profile: { _id: string; externalId?: string } }>("/profiles", {
      method: "POST", body: JSON.stringify({ name: row.external_id, externalId: row.external_id }),
      headers: { "Idempotency-Key": row.external_id },
    });
    profile = result.profile;
  } catch (error) {
    if (!(error instanceof ZernioError) || error.status !== 409) throw error;
    const query = new URLSearchParams({ externalId: row.external_id });
    const result = await zernioRequest<{ profiles: { _id: string; externalId?: string }[] }>(`/profiles?${query}`);
    profile = result.profiles.find((candidate) => candidate.externalId === row.external_id);
  }
  if (!profile?._id || !zernioId.test(profile._id)) throw new ZernioError(502);
  systemDb.prepare("UPDATE zernio_profiles SET profile_id=? WHERE owner_id=?").run(profile._id, ownerId);
  return profile._id;
}

export function zernioProfileOwner(profileId: string) {
  const row = systemDb.prepare("SELECT owner_id FROM zernio_profiles WHERE profile_id=?").get(profileId) as { owner_id: string } | undefined;
  return row?.owner_id;
}

type ListedAccount = {
  _id?: string; id?: string; platform?: string; profileId?: string | { _id?: string; id?: string };
  displayName?: string; username?: string; isActive?: boolean; needsReconnection?: boolean;
};

export async function zernioOwnedAccount(accountId: string, profileId: string, platform: ZernioPlatform = "facebook") {
  const { account } = await zernioRequest<{ account: ListedAccount }>(`/accounts/${encodeURIComponent(accountId)}`);
  const providerProfile = typeof account?.profileId === "string" ? account.profileId : account?.profileId?._id || account?.profileId?.id;
  if ((account?._id || account?.id) !== accountId || account.platform !== platform || providerProfile !== profileId) {
    throw new ZernioError(403, "wrong_profile");
  }
  return account;
}

export function updateZernioConnection(accountId: string, status: "expired" | "disconnected", changedAt: number, platform: ZernioPlatform = "facebook") {
  const ref = zernioRef(accountId);
  const kind = zernioKind(platform);
  const connection = getConnection(kind, ref);
  if (!connection || connection.status === "disconnected" || changedAt < connection.changedAt) return;
  saveConnection(kind, ref, { ...connection, status, changedAt });
}

export function reserveZernioSend(ref: string, id: string) {
  return db.transaction(() => {
    const now = Date.now();
    db.prepare("DELETE FROM zernio_send_attempts WHERE attempted_at<=?").run(now - 3_600_000);
    const existing = db.prepare("SELECT connection_ref FROM zernio_send_attempts WHERE id=?").get(id) as { connection_ref: string } | undefined;
    if (existing) return existing.connection_ref === ref;
    const usage = db.prepare(`
      SELECT COUNT(*) AS hour, COUNT(CASE WHEN attempted_at>? THEN 1 END) AS minute
      FROM zernio_send_attempts WHERE connection_ref=?
    `).get(now - 60_000, ref) as { hour: number; minute: number };
    if (usage.hour >= 30 || usage.minute >= 5) return false;
    db.prepare("INSERT INTO zernio_send_attempts (id, connection_ref, attempted_at) VALUES (?, ?, ?)").run(id, ref, now);
    return true;
  }).immediate();
}

export function zernioConversationPath(thread: string) {
  return `/inbox/conversations/${encodeURIComponent(thread)}/messages`;
}

export async function zernioSendReply(accountId: string, profileId: string, thread: string, key: string, text: string, image?: File, platform: MetaChannel = "facebook") {
  const account = await zernioOwnedAccount(accountId, profileId, platform);
  if (account.isActive === false || account.needsReconnection) throw new ZernioError(409, "account_disconnected");
  let body: string | FormData = JSON.stringify({ accountId, message: text });
  if (image) {
    body = new FormData();
    body.set("accountId", accountId);
    body.set("attachment", image, "reply-image." + image.type.split("/")[1]);
  }
  const result = await zernioRequest<{ success?: boolean; data?: { messageId?: string } }>(zernioConversationPath(thread), {
    method: "POST", body, headers: { "Idempotency-Key": key },
  });
  if (!result?.success) throw new ZernioError(502);
  return { messageId: result.data?.messageId || "" };
}

export async function zernioAttachment(accountId: string, profileId: string, thread: string, mid: string, index: number, platform: MetaChannel = "facebook") {
  await zernioOwnedAccount(accountId, profileId, platform);
  const query = new URLSearchParams({ accountId, format: "json" });
  return zernioRequest<{ url: string }>(`${zernioConversationPath(thread)}/${encodeURIComponent(mid)}/attachments/${index}?${query}`);
}

export async function zernioConnectUrl(profileId: string, callback: URL, target?: string, platform: ZernioPlatform = "facebook") {
  const query = new URLSearchParams({ profileId, redirect_url: callback.href, scopes: platform === "linkedin" ? "posting" : "messaging" });
  if (platform === "instagram") query.set("loginMethod", "instagram_login");
  if (target) query.set("reconnectAccountId", target);
  const { authUrl } = await zernioRequest<{ authUrl: string }>(`/connect/${platform}?${query}`);
  const destination = new URL(authUrl);
  const platformHost = {
    facebook: /^(?:[a-z\d-]+\.)*facebook\.com$/i,
    instagram: /^(?:[a-z\d-]+\.)*(?:facebook\.com|instagram\.com)$/i,
    linkedin: /^(?:[a-z\d-]+\.)*linkedin\.com$/i,
  }[platform];
  if (destination.protocol !== "https:" || destination.username || destination.password ||
    !(/^(?:[a-z\d-]+\.)*zernio\.com$/i.test(destination.hostname) || platformHost.test(destination.hostname))) throw new ZernioError(502);
  return destination.href;
}
