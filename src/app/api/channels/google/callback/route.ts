import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db, getGmailOAuth } from "@/lib/db";
import { finishOAuthFlow, getConnection, getOAuthFlow, listConnections, saveConnection } from "@/lib/channel-connections";
import { withAuth } from "@/lib/auth";
import { googleOAuthAppUrl } from "@/lib/public-url";

export const GET = withAuth(async function GET(req: NextRequest) {
  const appUrl = googleOAuthAppUrl(req);
  const failed = (reason = "google_connection") => NextResponse.redirect(`${appUrl}/channels?status=error&reason=${reason}`);
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") || "";
  const flow = getOAuthFlow(state);
  if (!flow || flow.kind !== "gmail") return failed();
  if (params.has("error") || !code) {
    finishOAuthFlow(state);
    return failed();
  }

  const { clientId, clientSecret } = getGmailOAuth();
  if (!clientId || !clientSecret) return failed();

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: `${appUrl}/api/channels/google/callback`, grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const token = await response.json().catch(() => ({}));
    if (!response.ok || !token.access_token) return failed();
    const responseProfile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(15_000),
    });
    const profile = await responseProfile.json().catch(() => ({}));
    const email = String(profile.emailAddress || "").trim().toLowerCase();
    if (!responseProfile.ok || !email) return failed();

    const result = db.transaction(() => {
      if (!finishOAuthFlow(state)) return "google_connection";
      const existing = flow.target ? getConnection("gmail", flow.target) : null;
      if (flow.target && existing?.label.toLowerCase() !== email) return "google_wrong_account";
      if (!flow.target && listConnections("gmail").some((account) => account.label.toLowerCase() === email)) return "already_connected";
      const refreshToken = token.refresh_token || (existing?.oauthClientId === clientId ? existing.refreshToken : "");
      if (!refreshToken) return "google_connection";
      saveConnection("gmail", existing?.id || randomUUID(), {
        label: email, oauthClientId: clientId, accessToken: token.access_token, refreshToken, expiresAt: Date.now() + Number(token.expires_in || 3600) * 1000,
      });
      return "ok";
    }).immediate();
    return result === "ok" ? NextResponse.redirect(`${appUrl}/channels?status=ok&provider=google`) : failed(result);
  } catch {
    return failed();
  }
});

