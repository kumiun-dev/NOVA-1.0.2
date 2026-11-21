import { updateZernioConnection, zernioRef, zernioKind } from "./zernio";
import { getConnection, type MetaChannel, type ZernioPlatform } from "./channel-connections";
import { storeIncoming } from "./incoming";

type Incoming = Parameters<typeof storeIncoming>[0];
export type ZernioEvent =
  | { kind: "message"; incoming: Incoming; platform?: MetaChannel }
  | { kind: "status"; status: "expired" | "disconnected"; time: number; platform?: ZernioPlatform };

export type ZernioHook = {
  id?: unknown; event?: unknown; timestamp?: string; test?: boolean;
  account?: { accountId?: string; id?: string; profileId?: string; platform?: string; disconnectionType?: string };
  message?: {
    platform?: string; direction?: string; conversationId?: string; platformMessageId?: string; text?: string | null;
    sentAt?: string; sender?: { id?: string; name?: string; username?: string }; attachments?: { type?: string }[];
  };
};

const MEDIA_LABELS: Record<string, string> = { image: "图片", video: "视频", audio: "语音", sticker: "贴纸", document: "文件" };

export function parseZernioEvent(event: ZernioHook, accountId: string, platform: ZernioPlatform): ZernioEvent | null {
  if (event.event === "account.disconnected") {
    const time = Date.parse(event.timestamp || "");
    return Number.isFinite(time) ? { kind: "status", platform, status: event.account?.disconnectionType === "intentional" ? "disconnected" : "expired", time } : null;
  }
  if (platform === "linkedin") return null;
  const message = event.message;
  if (message?.platform !== platform || message.direction !== "incoming") return null;
  const thread = message.conversationId;
  const contact = message.sender?.id;
  const mid = message.platformMessageId;
  if (![thread, contact, mid].every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)) return null;
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 20).map((item) =>
    Object.hasOwn(MEDIA_LABELS, item?.type || "") ? item.type! : "document") : [];
  const time = Date.parse(message.sentAt || event.timestamp || "");
  const sender = typeof message.sender?.name === "string" ? message.sender.name : message.sender?.username;
  const channel = platform === "instagram" ? "Instagram" : "Facebook";
  return { kind: "message", platform, incoming: {
    channel, provider: "zernio", eventId: event.id as string, connectionRef: zernioRef(accountId),
    contactId: contact!, threadId: thread!, messageId: mid!, sender: typeof sender === "string" ? sender.slice(0, 180) : `${channel} 客户`,
    text: (typeof message.text === "string" ? message.text.trim().slice(0, 12000) : "") || (attachments[0] ? `[${MEDIA_LABELS[attachments[0]]}]` : ""),
    createdAt: Number.isFinite(time) ? new Date(time).toISOString() : undefined, mediaType: attachments[0], attachmentTypes: attachments,
  } };
}

export async function applyZernioEvent(accountId: string, event: ZernioEvent) {
  if (event.kind === "status") {
    updateZernioConnection(accountId, event.status, event.time, event.platform ?? "facebook");
    return 0;
  }
  if (getConnection(zernioKind(event.platform ?? "facebook"), zernioRef(accountId))?.status !== "connected") return 0;
  const result = await storeIncoming(event.incoming);
  return result.id && !result.duplicate ? 1 : 0;
}
