import { NextResponse, type NextRequest } from "next/server";
import { issueSession, normalizeEmail, verifyPassword, secureSessionCookies } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { getLicense, getTenantLicense, isSelfHosted } from "@/lib/license";

export async function POST(req: NextRequest) {
  const license = getLicense();
  if (!license.valid) return NextResponse.json({ ok: false, code: "LICENSE_REQUIRED", error: license.reason }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(String(body.email || ""));
  const user = (email
    ? systemDb.prepare("SELECT * FROM auth_users WHERE email=? AND active=1").get(email)
    : systemDb.prepare("SELECT * FROM auth_users WHERE role='admin' AND email='' AND active=1 LIMIT 1").get()) as any;
  if (!user || !verifyPassword(String(body.password || ""), user)) {
    return NextResponse.json({ ok: false, error: "邮箱或密码错误" }, { status: 401 });
  }
  if (!isSelfHosted() && user.id !== "owner" && user.role !== "admin") {
    const tenantLicense = getTenantLicense(user.tenant_id || user.id);
    if (!tenantLicense?.authorized) return NextResponse.json({ ok: false, code: "TENANT_LICENSE_REQUIRED", error: "此客户账户尚未获得 NOVA 授权，请联系平台管理员" }, { status: 403 });
  }
  const session = issueSession(user);
  const res = NextResponse.json({ ok: true, user: { displayName: user.display_name } });
  res.cookies.set("nova_session", session.token, { path: "/", httpOnly: true, sameSite: "lax", secure: secureSessionCookies(), maxAge: session.maxAge });
  return res;
}
