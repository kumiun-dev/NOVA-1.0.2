import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isValidEmail, makePassword, verifyPassword, issueSession, normalizeEmail, secureSessionCookies } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { getLicense, getTenantLicense, isSelfHosted } from "@/lib/license";

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "请重新登录" }, { status: 401 });
  let permissions: unknown[] = [];
  try { permissions = JSON.parse(user.permissions || "[]"); } catch {}
  const selfHosted = isSelfHosted();
  const license = getLicense();
  const tenantLicense = !selfHosted && user.id !== "owner" ? getTenantLicense(user.tenant_id || user.id) : null;
  const modules = selfHosted ? (license.valid ? license.license.modules : []) : tenantLicense?.modules || [];
  if (user.role === "customer_admin") permissions = modules;
  const authorized = selfHosted ? license.valid : user.id === "owner" || Boolean(tenantLicense?.authorized);
  return NextResponse.json({ id: user.id, displayName: user.display_name, email: user.email, role: user.role, permissions, selfHosted, authorized, license: selfHosted && license.valid ? { expiresAt: license.license.expiresAt, maxEmployees: license.license.maxEmployees, modules } : tenantLicense ? { expiresAt: tenantLicense.expiresAt, maxEmployees: tenantLicense.maxEmployees, modules } : null });
}

export async function PATCH(req: NextRequest) {
  const license = getLicense();
  if (!license.valid) return NextResponse.json({ error: license.reason }, { status: 403 });
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "请重新登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const displayName = String(body.displayName || "").trim().slice(0, 40);
  const email = normalizeEmail(String(body.email || ""));
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");
  if (!displayName) return NextResponse.json({ error: "请输入称呼" }, { status: 400 });
  if (email && !isValidEmail(email)) return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  const emailChanged = email !== user.email;
  if ((emailChanged || newPassword) && !verifyPassword(currentPassword, user)) return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  if (newPassword && newPassword.length < 8) return NextResponse.json({ error: "新密码至少需要 8 位" }, { status: 400 });
  const duplicate = email ? systemDb.prepare("SELECT id FROM auth_users WHERE email=? AND id!=?").get(email, user.id) : null;
  if (duplicate) return NextResponse.json({ error: "这个邮箱已被其他账户使用" }, { status: 409 });

  if (newPassword) {
    const password = makePassword(newPassword);
    systemDb.prepare("UPDATE auth_users SET email=?,display_name=?,password_salt=?,password_hash=?,session_version=session_version+1 WHERE id=?")
      .run(email, displayName, password.salt, password.hash, user.id);
  } else {
    systemDb.prepare("UPDATE auth_users SET email=?,display_name=? WHERE id=?").run(email, displayName, user.id);
  }
  const updated = systemDb.prepare("SELECT * FROM auth_users WHERE id=?").get(user.id) as typeof user;
  const response = NextResponse.json({ ok: true, displayName: updated.display_name, email: updated.email, role: updated.role });
  if (newPassword) {
    const session = issueSession(updated);
    response.cookies.set("nova_session", session.token, { path: "/", httpOnly: true, sameSite: "lax", secure: secureSessionCookies(), maxAge: session.maxAge });
  }
  return response;
}
