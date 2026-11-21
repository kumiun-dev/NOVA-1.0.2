import type { MetaConnection } from "./channel-connections";

export async function subscribeMetaPage(connection: MetaConnection) {
  const url = new URL(`https://graph.facebook.com/v27.0/${encodeURIComponent(connection.pageId)}/subscribed_apps`);
  url.searchParams.set("subscribed_fields", "messages");
  const response = await fetch(url, {
    method: "POST", cache: "no-store", headers: { Authorization: `Bearer ${connection.pageToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success !== true) throw new Error(String(data.error?.message || "Meta 未确认消息订阅").slice(0, 400));
}

