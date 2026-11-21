import { NextResponse, type NextRequest } from "next/server";
import { db, getPlatformSetting } from "@/lib/db";
import { createOAuthFlow, finishOAuthFlow, getConnection, getOAuthFlow, listConnections, saveConnection, type MetaConnection } from "@/lib/channel-connections";
import { subscribeMetaPage } from "@/lib/meta-connections";
import { withAuth } from "@/lib/auth";
import { publicAppUrl } from "@/lib/public-url";

type MetaPage = { id?: string; name?: string; access_token?: string; instagram_business_account?: { id: string; username?: string } };

export const GET = withAuth(async function GET(req: NextRequest) {
  const appUrl = publicAppUrl(req.nextUrl.origin);
  const redirect = (query: string) => NextResponse.redirect(`${appUrl}/channels?${query}`);
  const params = req.nextUrl.searchParams;
  const state = params.get("state") || "";
  const flow = getOAuthFlow(state);
  if (!flow || flow.kind === "gmail" || flow.options) return redirect("status=error&reason=meta_state");
  const code = params.get("code");
  if (params.has("error") || !code) {
    finishOAuthFlow(state);
    return redirect("status=error&reason=meta_auth");
  }
  const { kind, target } = flow;

  try {
    const credentials = { client_id: getPlatformSetting("meta_app_id"), client_secret: getPlatformSetting("meta_app_secret") };
    const tokenUrl = "https://graph.facebook.com/v27.0/oauth/access_token";
    const exchange = await fetch(`${tokenUrl}?${new URLSearchParams({ ...credentials, redirect_uri: `${appUrl}/api/channels/meta/callback`, code })}`);
    const token = await exchange.json().catch(() => ({}));
    if (!exchange.ok || !token.access_token) return redirect("status=error&reason=meta_token");
    const extended = await fetch(`${tokenUrl}?${new URLSearchParams({ ...credentials, grant_type: "fb_exchange_token", fb_exchange_token: token.access_token })}`);
    const extendedToken = await extended.json().catch(() => ({}));
    const accessToken = extended.ok && extendedToken.access_token ? extendedToken.access_token : token.access_token;

    const url = new URL("https://graph.facebook.com/v27.0/me/accounts");
    url.searchParams.set("fields", kind === "instagram" ? "id,name,access_token,instagram_business_account{id,username}" : "id,name,access_token");
    const assets = new Map<string, MetaConnection>();
    while (true) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.data)) return redirect("status=error&reason=page_access");
      for (const page of data.data as MetaPage[]) {
        const assetId = kind === "facebook" ? page.id : page.instagram_business_account?.id;
        if (!assetId || !page.id || !page.access_token) continue;
        const label = kind === "facebook" ? page.name || assetId : page.instagram_business_account?.username || assetId;
        assets.set(assetId, { assetId, pageId: page.id, label, pageToken: page.access_token });
      }
      const after = data.paging?.cursors?.after;
      if (!data.paging?.next || !after || after === url.searchParams.get("after")) break;
      url.searchParams.set("after", after);
    }

    const bound = new Set(listConnections(kind).map(({ id }) => id));
    const options = [...assets.values()].filter(({ assetId }) => target ? target === assetId && bound.has(assetId) : !bound.has(assetId));
    if (!options.length) {
      finishOAuthFlow(state);
      if (!target && assets.size) return redirect("status=error&reason=already_connected");
      return redirect(`status=error&reason=${kind === "instagram" ? "instagram_access" : "page_access"}`);
    }
    if (options.length > 1) {
      const pick = db.transaction(() => finishOAuthFlow(state) ? createOAuthFlow(kind, { options }) : "")();
      return pick ? redirect(`pick=${pick}`) : redirect("status=error&reason=meta_state");
    }

    const connection = options[0];
    try { await subscribeMetaPage(connection); }
    catch { return redirect("status=error&reason=meta_webhook_subscription"); }
    const saved = db.transaction(() => {
      if (!finishOAuthFlow(state) || (target && !getConnection(kind, target))) return false;
      if (!target && getConnection(kind, connection.assetId)) return false;
      saveConnection(kind, connection.assetId, connection);
      return true;
    })();
    return redirect(saved ? `status=ok&provider=${kind}` : "status=error&reason=meta_state");
  } catch {
    return redirect("status=error&reason=meta_network");
  }
});

