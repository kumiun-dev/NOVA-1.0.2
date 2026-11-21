import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, withAuth } from "@/lib/auth";
import { finishOAuthFlow, getConnection, getOAuthFlow, saveConnection } from "@/lib/channel-connections";
import { db, systemDb } from "@/lib/db";
import { publicAppUrl } from "@/lib/public-url";
import { isZernioPlatform, ZernioError, zernioId, zernioKind, zernioOwnedAccount, zernioRef, zernioLabel } from "@/lib/zernio";
import { callZernioRelay } from "@/lib/zernio-relay-client";

export const GET = withAuth(async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams;
  function redirect(reason?: string) {
    const destination = new URL(`${publicAppUrl(req.nextUrl.origin)}/channels`);
    destination.searchParams.set("status", reason ? "error" : "ok");
    if (reason) destination.searchParams.set("reason", reason);
    return NextResponse.redirect(destination, { headers: { "Referrer-Policy": "no-referrer", "Cache-Control": "private, no-store" } });
  }
  const state = query.get("nova_flow") || "";
  const flow = getOAuthFlow(state);
  const platform = flow?.kind.startsWith("zernio_") ? flow.kind.slice("zernio_".length) : "";
  if (!flow?.profileId || !isZernioPlatform(platform)) return redirect("zernio_expired");
  const kind = zernioKind(platform);
  const actor = flow.relay ? (await getRequestUser(req))?.id : undefined;
  if (flow.relay && !actor) return redirect("zernio_expired");
  if (query.has("error")) {
    finishOAuthFlow(state);
    if (actor) await callZernioRelay({ action: "cancel", actor, state }).catch(() => {});
    return redirect(query.get("error") === "reconnect_account_mismatch" ? "zernio_wrong_page" : "zernio_declined");
  }
  const id = query.get("accountId") || "";
  if (query.get("connected") !== platform || query.get("profileId") !== flow.profileId || !zernioId.test(id)) return redirect("zernio_declined");
  const ref = zernioRef(id);
  if (flow.target && flow.target !== ref) return redirect("zernio_wrong_page");
  try {
    const profileId = flow.profileId;
    const missing = query.has("missing_permissions");
    let status: "connected" | "expired";
    let label: string;
    if (actor) {
      const result = await callZernioRelay<{ status: typeof status; label: string }>({
        action: "finish", actor, state, accountId: id, missingPermissions: missing,
      });
      ({ status, label } = result);
      systemDb.prepare("INSERT OR IGNORE INTO zernio_relay_members (actor) VALUES (?)").run(actor);
    } else {
      const account = await zernioOwnedAccount(id, profileId, platform);
      status = !missing && account.isActive !== false && !account.needsReconnection ? "connected" : "expired";
      label = (account.displayName || account.username || zernioLabel(platform)).slice(0, 180);
    }
    const saved = db.transaction(() => {
      if (!finishOAuthFlow(state)) return false;
      if (flow.target && getConnection(kind, ref)?.status === "disconnected") return false;
      saveConnection(kind, ref, {
        accountId: id, profileId, label, status, relay: Boolean(actor), changedAt: Date.now(),
      });
      return true;
    }).immediate();
    if (!saved) return redirect("zernio_expired");
    return redirect(status === "connected" ? undefined : platform === "linkedin" ? "linkedin_permissions" : "zernio_permissions");
  } catch (error) {
    return redirect(error instanceof ZernioError && error.code === "wrong_profile" ? "zernio_wrong_page" : "zernio_unavailable");
  }
});
