import { NextResponse, type NextRequest } from "next/server";
import { getGmailOAuth } from "@/lib/db";
import { createOAuthFlow, getConnection } from "@/lib/channel-connections";
import { withAuth } from "@/lib/auth";
import { googleOAuthAppUrl } from "@/lib/public-url";

export const GET = withAuth(async function GET(req: NextRequest) {
  const { clientId, clientSecret } = getGmailOAuth();
  if (!clientId || !clientSecret) return new NextResponse(null, {
    status: 307, headers: { Location: "/settings?configure=gmail#gmail-settings", "Cache-Control": "private, no-store" },
  });
  const target = req.nextUrl.searchParams.get("id") || undefined;
  const connection = target ? getConnection("gmail", target) : null;
  if (target && !connection) return NextResponse.json({ error: "这个 Gmail 已退出" }, { status: 404 });
  const state = createOAuthFlow("gmail", { target });
  const redirect = `${googleOAuthAppUrl(req)}/api/channels/google/callback`;
  const scope = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope, access_type: "offline", prompt: "consent select_account", state });
  if (connection) params.set("login_hint", connection.label);
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

