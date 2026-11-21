import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getPlatformSetting, runWithTenantDatabase, systemDb } from "@/lib/db";
import { getConnection, listConnections, type Connection, type MetaChannel } from "@/lib/channel-connections";
import { parseMetaMessages, storeIncoming } from "@/lib/incoming";
import { getLicense, isModuleLicensed } from "@/lib/license";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams;
  const mode = query.get("hub.mode");
  const token = query.get("hub.verify_token");
  const challenge = query.get("hub.challenge");
  const expected = getPlatformSetting("meta_webhook_verify_token");
  if (mode === "subscribe" && expected && token === expected && challenge) return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Meta webhook verification failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const license = getLicense(); if (!license.valid) return NextResponse.json({ error: license.reason }, { status: 403 });
  if (!isModuleLicensed("messages")) return NextResponse.json({ error: "当前授权不包含消息功能" }, { status: 403 });
  const secret = getPlatformSetting("meta_app_secret");
  const signature = req.headers.get("x-hub-signature-256") || "";
  if (!secret || !signature.startsWith("sha256=")) return NextResponse.json({ error: "Meta webhook signature missing" }, { status: 401 });
  const raw = await req.text();
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected); const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) return NextResponse.json({ error: "Meta webhook signature invalid" }, { status: 401 });
  const body = JSON.parse(raw);
  let received = 0; let autoReplies = 0;
  const accounts = systemDb.prepare("SELECT id FROM auth_users WHERE active=1").all() as { id: string }[];
  for (const account of accounts) {
    const stats = await runWithTenantDatabase(account.id, async () => {
      let count = 0; let automated = 0;
      const connections = new Map<string, { connection: Connection<MetaChannel>; channel: MetaChannel }>([
        ...listConnections("facebook").map((connection) => [connection.assetId, { connection, channel: "facebook" as const }] as const),
        ...listConnections("instagram").map((connection) => [connection.assetId, { connection, channel: "instagram" as const }] as const),
      ]);
      for (const entry of body.entry || []) {
        const match = connections.get(String(entry.id || ""));
        if (!match) continue;
        const { connection, channel } = match;
        const instagramId = channel === "instagram" ? connection.assetId : "";
        for (const message of parseMetaMessages({ ...body, entry: [entry] }, instagramId)) {
          if (!getConnection(channel, connection.id)) break;
          const result = await storeIncoming({ ...message, connectionRef: connection.id });
          if (result.id) count++;
          if (result.autoReply) automated++;
        }
      }
      return { received: count, autoReplies: automated };
    });
    received += stats.received;
    autoReplies += stats.autoReplies;
  }
  return NextResponse.json({ ok: true, received, autoReplies });
}
