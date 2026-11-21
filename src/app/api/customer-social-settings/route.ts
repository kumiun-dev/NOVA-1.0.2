import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, withAuth } from "@/lib/auth";
import { getPlatformSetting, setPlatformSetting, systemDb } from "@/lib/db";
import { publicAppUrl } from "@/lib/public-url";
async function allowed(req: NextRequest) { return (await getRequestUser(req))?.role === "admin"; }
export const GET = withAuth(async (req: NextRequest) => {
  if (!await allowed(req)) return NextResponse.json({ error: "仅公司管理员可以配置" }, { status: 403 });
  return NextResponse.json({ configured: Boolean(getPlatformSetting("zernio_api_key") && getPlatformSetting("zernio_webhook_secret")), callback: publicAppUrl(req.nextUrl.origin) + "/api/webhooks/zernio" }, { headers: { "Cache-Control": "private, no-store" } });
});
export const POST = withAuth(async (req: NextRequest) => {
  if (!await allowed(req)) return NextResponse.json({ error: "仅公司管理员可以配置" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body.apiKey !== "string" || typeof body.webhookSecret !== "string") return NextResponse.json({ error: "请输入有效配置" }, { status: 400 });
  const key = body.apiKey.trim(), secret = body.webhookSecret.trim();
  if (key.length > 4096 || secret.length > 4096 || /[\r\n]/.test(key + secret) || (!key && !getPlatformSetting("zernio_api_key")) || (!secret && !getPlatformSetting("zernio_webhook_secret"))) return NextResponse.json({ error: "请填写 API Key 和签名密钥，已保存项可留空保留" }, { status: 400 });
  systemDb.transaction(() => { if (key) setPlatformSetting("zernio_api_key", key); if (secret) setPlatformSetting("zernio_webhook_secret", secret); })();
  return NextResponse.json({ ok: true });
});
