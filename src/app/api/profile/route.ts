import { NextRequest, NextResponse } from "next/server";
import { getRequestUser, isValidEmail, makePassword, verifyPassword, issueSession, normalizeEmail, secureSessionCookies } from "@/lib/auth";
import { systemDb } from "@/lib/db";
import { getLicense, getTenantLicense, isSelfHosted } from "@/lib/license";
import { validTheme } from "@/lib/appearance";

function appearance(id: string): {theme: string; avatar: string} {
  try { return {theme: "orange", avatar: "", ...JSON.parse((systemDb.prepare("SELECT value FROM auth_meta WHERE key=?").get(`appearance:${id}`) as {value: string} | undefined)?.value || "{}")}; }
  catch { return {theme: "orange", avatar: ""}; }
}

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
  return NextResponse.json({ ...appearance(user.id), id: user.id, displayName: user.display_name, email: user.email, role: user.role, permissions, selfHosted, authorized, license: selfHosted && license.valid ? { expiresAt: license.license.expiresAt, maxEmployees: license.license.maxEmployees, modules } : tenantLicense ? { expiresAt: tenantLicense.expiresAt, maxEmployees: tenantLicense.maxEmployees, modules } : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(req: NextRequest) {
  const license = getLicense();
  if (!license.valid) return NextResponse.json({ error: license.reason }, { status: 403 });
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "请重新登录" }, { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 300000) return NextResponse.json({error: "图片过大"}, {status: 413});
  const body = await req.json().catch(() => ({}));
  if (body.action === "appearance") {
    const next = appearance(user.id);
    if (body.theme !== undefined) {
      if (!validTheme(body.theme)) return NextResponse.json({error: "无效主题"}, {status: 400});
      next.theme = body.theme;
    }
    if (body.avatar !== undefined) {
      if (typeof body.avatar !== "string" || body.avatar.length > 250000) return NextResponse.json({error: "无效头像"}, {status: 400});
      if (body.avatar) {
        const match = body.avatar.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) return NextResponse.json({error: "不支持的图片"}, {status: 400});
        const bytes = Buffer.from(match[2], "base64");
        const valid = match[1] === "png" ? bytes.subarray(0,8).toString("hex") === "89504e470d0a1a0a" : match[1] === "jpeg" ? bytes.subarray(0,3).toString("hex") === "ffd8ff" : bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
        if (!valid) return NextResponse.json({error: "图片格式不匹配"}, {status: 400});
      }
      next.avatar = body.avatar;
    }
    systemDb.prepare("INSERT INTO auth_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`appearance:${user.id}`, JSON.stringify(next));
    return NextResponse.json({ok: true});
  }
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
