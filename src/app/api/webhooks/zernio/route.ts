import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { userById } from "@/lib/auth";
import { getConnection } from "@/lib/channel-connections";
import { db, runWithTenantDatabase, getPlatformSetting } from "@/lib/db";
import { getLicense, getTenantLicense, isModuleLicensed, isSelfHosted } from "@/lib/license";
import { zernioId, zernioProfileOwner, zernioRef, isZernioPlatform, zernioKind } from "@/lib/zernio";
import { applyZernioEvent, parseZernioEvent, type ZernioHook } from "@/lib/zernio-events";

const MAX_EVENT_BYTES = 512 * 1024;

export async function POST(req: Request) {
  const secret = getPlatformSetting("zernio_webhook_secret").trim();
  const signature = req.headers.get("x-zernio-signature") || "";
  if (!secret || !/^[a-f0-9]{64}$/.test(signature)) return new Response(null, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > MAX_EVENT_BYTES) return new Response(null, { status: 413 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > MAX_EVENT_BYTES) return new Response(null, { status: 413 });
  const expected = createHmac("sha256", secret).update(raw).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) return new Response(null, { status: 401 });
  let event: ZernioHook;
  try { event = JSON.parse(raw.toString("utf8")); }
  catch { return new Response(null, { status: 400 }); }
  if (!event || typeof event.event !== "string" || typeof event.id !== "string" || !event.id || event.id.length > 180) return new Response(null, { status: 400 });
  if (event.test || !["message.received", "account.disconnected"].includes(event.event)) return new Response(null, { status: 204 });
  const { profileId, platform } = event.account || {};
  const accountId = event.account?.accountId || event.account?.id;
  if (!isZernioPlatform(platform) || !accountId || !profileId || !zernioId.test(accountId) || !zernioId.test(profileId)) return new Response(null, { status: 204 });
  const parsed = parseZernioEvent(event, accountId, platform);
  if (!parsed) return new Response(null, { status: 204 });
  const owner = zernioProfileOwner(profileId);

  const module = platform === "linkedin" ? "channels" : "messages";
  if (!getLicense().valid || !isModuleLicensed(module)) return new Response(null, { status: 204 });
  const user = owner && userById(owner);
  if (!user) return new Response(null, { status: 204 });
  if (!isSelfHosted() && user.id !== "owner" && user.role !== "admin") {
    const license = getTenantLicense(user.tenant_id || user.id);
    if (!license?.authorized || !license.modules.some((value) => value === "*" || value === module)) return new Response(null, { status: 204 });
  }
  return runWithTenantDatabase(user.id, async () => {
    const kind = zernioKind(platform);
    const link = getConnection(kind, zernioRef(accountId));
    if (!link) {
      if (parsed.kind === "message" && db.prepare("SELECT 1 FROM channel_oauth WHERE kind=? AND expires_at>? LIMIT 1").get(kind, Date.now())) {
        return new Response(null, { status: 503, headers: { "Retry-After": "5" } });
      }
      return new Response(null, { status: 204 });
    }
    if (parsed.kind === "status") {
      await applyZernioEvent(accountId, parsed);
      return new Response(null, { status: 204 });
    }
    if (link.status !== "connected") return new Response(null, { status: 204 });
    return NextResponse.json({ ok: true, received: await applyZernioEvent(accountId, parsed) });
  });
}
