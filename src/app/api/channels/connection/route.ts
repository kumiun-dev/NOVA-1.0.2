import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { getGmailOAuth, getPlatformSetting } from "@/lib/db";
import { listConnections, removeConnection, type ZernioPlatform } from "@/lib/channel-connections";
import { zernioConfigured, zernioKind } from "@/lib/zernio";
import { canUseZernioRelay } from "@/lib/zernio-relay-client";

export const GET = withAuth(async function GET() {
  const list = (kind: "facebook" | "instagram" | "gmail" | "enterprise") =>
    listConnections(kind).map(({ id, label }) => ({ id, label }));
  const zernioAccounts = (platform: ZernioPlatform) =>
    listConnections(zernioKind(platform)).filter(({ status }) => status !== "disconnected")
      .map(({ id, label, status }) => ({ id, label, status, provider: "zernio" }));
  const google = getGmailOAuth();
  return NextResponse.json({
    configured: {
      meta: Boolean(getPlatformSetting("meta_app_id") && getPlatformSetting("meta_app_secret")),
      gmail: Boolean(google.clientId && google.clientSecret),
      zernio: zernioConfigured() || canUseZernioRelay(),
    },
    facebook: [...list("facebook"), ...zernioAccounts("facebook")],
    instagram: [...list("instagram"), ...zernioAccounts("instagram")],
    linkedin: zernioAccounts("linkedin"),
    gmail: list("gmail"), enterprise: list("enterprise"),
  }, { headers: { "Cache-Control": "private, no-store" } });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("channel");
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !(kind === "facebook" || kind === "instagram" || kind === "gmail" || kind === "enterprise")) {
    return NextResponse.json({ error: "请选择要退出的账号" }, { status: 400 });
  }
  if (!removeConnection(kind, id)) return NextResponse.json({ error: "这个连接已退出" }, { status: 404 });
  return NextResponse.json({ ok: true, message: "账号已退出" });
});

