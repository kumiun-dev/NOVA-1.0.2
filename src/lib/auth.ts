import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { deleteTenantDatabase, runWithTenantDatabase, systemDb } from "@/lib/db";
import { getLicense, getTenantLicense, isModuleLicensed, isSelfHosted } from "@/lib/license";
import { moduleForPath, normalizePermissions } from "@/lib/permissions";

const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const secureSessionCookies = () => process.env.NOVA_SECURE_COOKIES === "true";

export type AccountUser = {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "customer_admin" | "user";
  tenant_id?: string;
  password_salt: string;
  password_hash: string;
  active: number;
  session_version: number;
  permissions?: string;
};

function hashPassword(password: string, salt: string) {
  return scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
}

function ensureAuthSchema() {
  systemDb.exec(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      tenant_id TEXT NOT NULL DEFAULT '',
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      session_version INTEGER NOT NULL DEFAULT 0,
      permissions TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS shared_quotes (token TEXT PRIMARY KEY, account_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_tenants (
      tenant_id TEXT PRIMARY KEY,
      authorized INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL DEFAULT '',
      max_employees INTEGER NOT NULL DEFAULT 0,
      modules TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_issued_licenses (
      id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      max_employees INTEGER NOT NULL,
      modules TEXT NOT NULL,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const columns = systemDb.prepare("PRAGMA table_info(auth_users)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "permissions")) systemDb.exec("ALTER TABLE auth_users ADD COLUMN permissions TEXT NOT NULL DEFAULT ''");
  if (!columns.some((column) => column.name === "tenant_id")) systemDb.exec("ALTER TABLE auth_users ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ''");
  if (isSelfHosted()) systemDb.prepare("UPDATE auth_users SET tenant_id='owner' WHERE role='user' AND tenant_id=''").run();
  else {
    const legacy = systemDb.prepare("SELECT id FROM auth_users WHERE role='user' AND tenant_id=''").all() as { id: string }[];
    const now = new Date().toISOString();
    const migrate = systemDb.transaction(() => { for (const account of legacy) {
      systemDb.prepare("UPDATE auth_users SET role='customer_admin',tenant_id=? WHERE id=?").run(account.id, account.id);
      systemDb.prepare("INSERT OR IGNORE INTO auth_tenants (tenant_id,authorized,expires_at,max_employees,modules,created_at,updated_at) VALUES (?,0,'',0,'[]',?,?)").run(account.id, now, now);
    }});
    migrate();
  }
  let secret = systemDb.prepare("SELECT value FROM auth_meta WHERE key='session_secret'").get() as { value: string } | undefined;
  if (!secret) {
    const value = randomBytes(32).toString("hex");
    systemDb.prepare("INSERT OR IGNORE INTO auth_meta (key,value) VALUES ('session_secret',?)").run(value);
  }
  const admin = systemDb.prepare("SELECT id FROM auth_users WHERE role='admin' LIMIT 1").get();
  if (!admin) {
    const salt = randomBytes(16).toString("hex");
    const password = process.env.NOVA_ADMIN_PASSWORD || process.env.BEACON_PASSWORD || "";
    const email = normalizeEmail(process.env.NOVA_ADMIN_EMAIL || "");
    if (isSelfHosted() && !email && !password) {
      systemDb.prepare("INSERT OR IGNORE INTO shared_quotes(token,account_id) SELECT token,'owner' FROM quotes WHERE token!=''").run();
      return;
    }
    if (!isValidEmail(email)) throw new Error("First start requires NOVA_ADMIN_EMAIL to be a valid email address");
    if (password.length < 12) throw new Error("First start requires NOVA_ADMIN_PASSWORD to contain at least 12 characters");
    const name = (systemDb.prepare("SELECT value FROM settings WHERE key='account_name'").get() as { value?: string } | undefined)?.value || "森哥";
    systemDb.prepare("INSERT OR IGNORE INTO auth_users (id,email,display_name,role,password_salt,password_hash,created_at) VALUES ('owner',?,?, 'admin',?,?,?)")
      .run(email, process.env.NOVA_ADMIN_NAME || name, salt, hashPassword(password, salt), new Date().toISOString());
  }
  systemDb.prepare("INSERT OR IGNORE INTO shared_quotes(token,account_id) SELECT token,'owner' FROM quotes WHERE token!=''").run();
}

ensureAuthSchema();

export function normalizeEmail(value: string) { return value.trim().toLocaleLowerCase(); }
export function isValidEmail(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function makePassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}
export function verifyPassword(password: string, user: Pick<AccountUser, "password_salt" | "password_hash">) {
  const actual = Buffer.from(hashPassword(password, user.password_salt), "hex");
  const expected = Buffer.from(user.password_hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sessionSecret() {
  return (systemDb.prepare("SELECT value FROM auth_meta WHERE key='session_secret'").get() as { value: string }).value;
}

export function issueSession(user: Pick<AccountUser, "id" | "session_version">) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = Buffer.from(`${user.id}|${expires}|${user.session_version}`).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, maxAge: SESSION_SECONDS };
}

export async function getRequestUser(req: NextRequest): Promise<AccountUser | null> {
  const token = req.cookies.get("nova_session")?.value || "";
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(supplied, "base64url"); } catch { return null; }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  let id = ""; let expires = 0; let version = -1;
  try {
    const decoded = Buffer.from(payload, "base64url").toString("utf8").split("|");
    id = decoded[0]; expires = Number(decoded[1]); version = Number(decoded[2]);
  } catch { return null; }
  if (!id || !Number.isFinite(expires) || expires <= Date.now() / 1000) return null;
  const user = systemDb.prepare("SELECT * FROM auth_users WHERE id=? AND active=1").get(id) as AccountUser | undefined;
  return user && user.session_version === version ? user : null;
}

export function withAuth<T extends (...args: any[]) => any>(handler: T) {
  return (async (...args: Parameters<T>) => {
    const req = args[0] as NextRequest;
    const user = await getRequestUser(req);
    if (!user) return NextResponse.json({ error: "登录状态已失效，请重新登录" }, { status: 401 });
    const license = getLicense();
    if (!license.valid) return NextResponse.json({ error: license.reason, code: "LICENSE_REQUIRED" }, { status: 403 });
    const pathname = req.nextUrl.pathname;
    const module = moduleForPath(pathname);
    if (!isSelfHosted() && user.id !== "owner" && user.role !== "admin") {
      const tenantLicense = getTenantLicense(user.tenant_id || user.id);
      if (!tenantLicense?.authorized) return NextResponse.json({ error: "此客户账户尚未获得 NOVA 授权，请联系平台管理员", code: "TENANT_LICENSE_REQUIRED" }, { status: 403 });
      if (module && !tenantLicense.modules.includes("*") && !tenantLicense.modules.includes(module)) return NextResponse.json({ error: "当前账户授权未包含此功能" }, { status: 403 });
    }
    if (module && !isModuleLicensed(module)) return NextResponse.json({ error: "此功能未包含在当前 NOVA 授权中，请联系管理员" }, { status: 403 });
    const permissions = normalizePermissions(parsePermissions(user.permissions));
    const settingsApiAllowed = pathname === "/api/settings" && ["settings", "channels", "mail", "agent"].some((key) => permissions.includes(key as any));
    if (isSelfHosted() && user.role !== "admin" && pathname === "/api/settings" && !settingsApiAllowed) return NextResponse.json({ error: "此账户没有访问该功能的权限" }, { status: 403 });
    if (!isSelfHosted() && user.role === "user" && pathname === "/api/settings" && !settingsApiAllowed) return NextResponse.json({ error: "此账户没有访问设置项的权限" }, { status: 403 });
    if (!isSelfHosted() && user.id !== "owner" && user.role !== "admin" && pathname === "/api/settings") {
      const tenantLicense = getTenantLicense(user.tenant_id || user.id);
      const allowedByRole = user.role === "customer_admin" ? tenantLicense?.modules || [] : permissions;
      if (!["settings", "channels", "mail", "agent", "messages"].some((key) => allowedByRole?.includes("*") || allowedByRole?.includes(key))) return NextResponse.json({ error: "此账户没有访问设置项的权限" }, { status: 403 });
    }
    if (isSelfHosted() && user.role !== "admin" && module && !permissions.includes(module)) {
      return NextResponse.json({ error: "此账户没有访问该功能的权限" }, { status: 403 });
    }
    if (!isSelfHosted() && user.role === "user" && module && !permissions.includes(module)) return NextResponse.json({ error: "此账户没有访问该功能的权限" }, { status: 403 });
    return runWithTenantDatabase(user.id, () => handler(...args));
  }) as (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>> | NextResponse>;
}

function parsePermissions(raw?: string): unknown {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export function runWithAccount<T>(accountId: string, callback: () => T) {
  return runWithTenantDatabase(accountId, callback);
}

export function userById(id: string) {
  return systemDb.prepare("SELECT * FROM auth_users WHERE id=? AND active=1").get(id) as AccountUser | undefined;
}

export function registerSelfHostedAdmin(input: { email: string; password: string; displayName?: string; authorizationCode?: string }) {
  if (!isSelfHosted()) throw new Error("此操作只适用于客户服务器");
  const email = normalizeEmail(input.email);
  const displayName = String(input.displayName || email.split("@")[0] || "NOVA 管理员").trim().slice(0, 40);
  if (!isValidEmail(email)) throw new Error("请输入有效邮箱地址");
  if (input.password.length < 8) throw new Error("密码至少需要 8 位");

  if (systemDb.prepare("SELECT 1 FROM auth_users WHERE role='admin' LIMIT 1").get()) throw new Error("此服务器已完成管理员注册；员工账号请由管理员在团队管理中创建");
  if (systemDb.prepare("SELECT 1 FROM auth_users WHERE email=?").get(email)) throw new Error("这个邮箱已注册");
  const { salt, hash } = makePassword(input.password);
  const now = new Date().toISOString();
  const transaction = systemDb.transaction(() => {
    if (systemDb.prepare("SELECT 1 FROM auth_users WHERE role='admin' LIMIT 1").get()) throw new Error("此服务器已完成管理员注册");
    systemDb.prepare("INSERT INTO auth_users (id,email,display_name,role,password_salt,password_hash,created_at) VALUES ('owner',?,?, 'admin',?,?,?)")
      .run(email, displayName || "NOVA 管理员", salt, hash, now);
    systemDb.prepare("INSERT OR IGNORE INTO shared_quotes(token,account_id) SELECT token,'owner' FROM quotes WHERE token!=''").run();
  });
  transaction();
  runWithTenantDatabase("owner", () => undefined);
  return userById("owner")!;
}

export function createEmployee(input: { email: string; password: string; displayName: string; permissions: unknown; tenantId?: string }) {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().slice(0, 40);
  if (!isValidEmail(email)) throw new Error("请输入有效邮箱地址");
  if (input.password.length < 12) throw new Error("员工初始密码至少需要 12 位");
  if (!displayName) throw new Error("请输入员工称呼");
  if (systemDb.prepare("SELECT 1 FROM auth_users WHERE email=?").get(email)) throw new Error("这个邮箱已被使用");
  const permissions = normalizePermissions(input.permissions);
  const tenantId = input.tenantId || "owner";
  const selfHostedLicense = isSelfHosted() ? getLicense() : null;
  const license = selfHostedLicense ? (selfHostedLicense.valid ? { authorized: true, modules: selfHostedLicense.license.modules, maxEmployees: selfHostedLicense.license.maxEmployees } : null) : getTenantLicense(tenantId);
  if (!license?.authorized) throw new Error("此客户账户尚未获得平台授权");
  const permitted = new Set(license.modules);
  const denied = permissions.filter((module) => !permitted.has("*") && !permitted.has(module));
  if (denied.length) throw new Error("当前授权未包含所选模块");
  const employeeCount = (systemDb.prepare("SELECT COUNT(*) c FROM auth_users WHERE role='user' AND tenant_id=? AND active=1").get(tenantId) as { c: number }).c;

  const { salt, hash } = makePassword(input.password);
  const id = randomUUID();
  systemDb.prepare("INSERT INTO auth_users (id,email,display_name,role,tenant_id,password_salt,password_hash,permissions,created_at) VALUES (?,?,?,'user',?,?,?,?,?)")
    .run(id, email, displayName, tenantId, salt, hash, JSON.stringify(permissions), new Date().toISOString());
  runWithTenantDatabase(id, () => undefined);
  return systemDb.prepare("SELECT * FROM auth_users WHERE id=?").get(id) as AccountUser;
}

export function updateEmployee(id: string, patch: { displayName?: string; password?: string; permissions?: unknown; active?: boolean }, tenantId?: string) {
  const employee = systemDb.prepare("SELECT * FROM auth_users WHERE id=? AND role='user' AND tenant_id=?").get(id, tenantId || "owner") as AccountUser | undefined;
  if (!employee) throw new Error("员工账户不存在");
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.displayName !== undefined) { const value = patch.displayName.trim().slice(0, 40); if (!value) throw new Error("员工称呼不能为空"); fields.push("display_name=?"); values.push(value); }
  if (patch.password) { if (patch.password.length < 12) throw new Error("新密码至少需要 12 位"); const password = makePassword(patch.password); fields.push("password_salt=?", "password_hash=?", "session_version=session_version+1"); values.push(password.salt, password.hash); }
  if (patch.permissions !== undefined) { fields.push("permissions=?"); values.push(JSON.stringify(normalizePermissions(patch.permissions))); }
  if (patch.active !== undefined) { fields.push("active=?", "session_version=session_version+1"); values.push(patch.active ? 1 : 0); }
  if (fields.length) systemDb.prepare(`UPDATE auth_users SET ${fields.join(",")} WHERE id=?`).run(...values, id);
  return systemDb.prepare("SELECT * FROM auth_users WHERE id=?").get(id) as AccountUser;
}
