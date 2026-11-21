import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, withAuth } from "@/lib/auth";
import { createOAuthFlow, finishOAuthFlow, getConnection, setOAuthProfile } from "@/lib/channel-connections";
import { publicAppUrl } from "@/lib/public-url";
import { updateZernioConnection, zernioConfigured, zernioConnectUrl, ZernioError, zernioMessage, zernioOwnedAccount, zernioProfile, zernioRequest, isZernioPlatform, zernioKind, zernioLabel } from "@/lib/zernio";
import { callZernioRelay, canUseZernioRelay } from "@/lib/zernio-relay-client";

export const POST = withAuth(async function POST(req: NextRequest) {
  const { id, platform = "facebook" } = await req.json().catch(() => null) ?? {};
  if (!isZernioPlatform(platform)) return NextResponse.json({ error: "请选择受支持的社媒渠道。" }, { status: 400 });
  const kind = zernioKind(platform);
  const target = typeof id === "string" && id ? getConnection(kind, id) : null;
  if (id && (!target || target.status === "disconnected")) return NextResponse.json({ error: `找不到可重新授权的 ${zernioLabel(platform)}。` }, { status: 404 });
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "请重新登录 NOVA。" }, { status: 401 });
  const relay = Boolean(target?.relay || (!target && !zernioConfigured() && canUseZernioRelay()));
  if (!relay && !zernioConfigured()) return NextResponse.json({ error: "管理员尚未配置 社媒服务 接入。" }, { status: 503 });
  let flow = "";
  try {
    if (relay) {
      flow = createOAuthFlow(kind, { target: target?.id, relay: true });
      const { authUrl, profileId, platform: confirmedPlatform } = await callZernioRelay<{ authUrl: string; profileId: string; platform?: string }>({
        action: "start", actor: user.id, state: flow, accountId: target?.accountId, platform,
      });
      if (platform !== "facebook" && confirmedPlatform !== platform) throw new ZernioError(503, "relay_upgrade_required");
      if (!setOAuthProfile(flow, profileId)) throw new ZernioError(409);
      return NextResponse.json({ authUrl }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const profileId = await zernioProfile(user.id);
    flow = createOAuthFlow(kind, { profileId, target: target?.id });
    const callback = new URL(`${publicAppUrl(req.nextUrl.origin)}/api/channels/zernio/callback`);
    callback.searchParams.set("nova_flow", flow);
    const authUrl = await zernioConnectUrl(profileId, callback, target?.accountId, platform);
    return NextResponse.json({ authUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (flow) {
      finishOAuthFlow(flow);
      if (relay && !(error instanceof ZernioError && ["relay_disabled", "relay_license"].includes(error.code))) {
        await callZernioRelay({ action: "cancel", actor: user.id, state: flow }).catch(() => {});
      }
    }
    const cause = relay && platform === "linkedin" && error instanceof ZernioError && error.status === 400 && !error.code
      ? new ZernioError(503, "relay_upgrade_required") : error;
    return NextResponse.json({ error: zernioMessage(cause, platform) }, { status: cause instanceof ZernioError && cause.status === 402 ? 402 : 502 });
  }
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get("platform") ?? "facebook";
  if (!isZernioPlatform(platform)) return NextResponse.json({ error: "请选择受支持的社媒渠道。" }, { status: 400 });
  const connection = getConnection(zernioKind(platform), req.nextUrl.searchParams.get("id") || "");
  if (!connection || connection.status === "disconnected") return NextResponse.json({ error: `找不到该 ${zernioLabel(platform)}连接。` }, { status: 404 });
  try {
    if (connection.relay) {
      const user = await getRequestUser(req);
      if (!user) return NextResponse.json({ error: "请重新登录 NOVA。" }, { status: 401 });
      await callZernioRelay({ action: "disconnect", actor: user.id, accountId: connection.accountId });
    } else {
      await zernioOwnedAccount(connection.accountId, connection.profileId, platform);
      await zernioRequest(`/accounts/${encodeURIComponent(connection.accountId)}`, { method: "DELETE" });
    }
  } catch (error) {
    if (!(error instanceof ZernioError) || (error.status !== 404 && error.code !== "wrong_profile")) return NextResponse.json({ error: zernioMessage(error, platform) }, { status: 502 });
  }
  updateZernioConnection(connection.accountId, "disconnected", Date.now(), platform);
  return NextResponse.json({ ok: true });
});
