import { NextResponse, type NextRequest } from "next/server";
import { getPlatformSetting } from "@/lib/db";
import { createOAuthFlow, getConnection } from "@/lib/channel-connections";
import { withAuth } from "@/lib/auth";
import { publicAppUrl } from "@/lib/public-url";

export const GET = withAuth(async function GET(req: NextRequest) {
  const appId = getPlatformSetting("meta_app_id");
  if (!appId || !getPlatformSetting("meta_app_secret")) return NextResponse.json({ error: "未配置 Meta 应用" }, { status: 400 });
  const channel = req.nextUrl.searchParams.get("channel") === "instagram" ? "instagram" : "facebook";
  const target = req.nextUrl.searchParams.get("id") || undefined;
  if (target && !getConnection(channel, target)) return NextResponse.json({ error: "这个连接已退出" }, { status: 404 });
  const state = createOAuthFlow(channel, { target });
  const redirect = `${publicAppUrl(req.nextUrl.origin)}/api/channels/meta/callback`;
  const pagePermissions = "pages_show_list,pages_read_engagement,pages_manage_metadata,pages_messaging";
  const scope = channel === "instagram" ? `${pagePermissions},instagram_basic,instagram_manage_messages` : pagePermissions;
  const params = new URLSearchParams({ client_id: appId, redirect_uri: redirect, scope, response_type: "code", state });
  return NextResponse.redirect(`https://www.facebook.com/v27.0/dialog/oauth?${params}`);
});

