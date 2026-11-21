import { NextRequest, NextResponse } from "next/server";
import { createEmployee, getRequestUser, updateEmployee, withAuth } from "@/lib/auth";
import { normalizePermissions } from "@/lib/permissions";
import { getLicense, getTenantLicense, isSelfHosted } from "@/lib/license";
import { db, runWithTenantDatabase, systemDb } from "@/lib/db";

export const GET = withAuth(async function GET(req: NextRequest) {
  const actor = await getRequestUser(req);
  const isTenantAdmin = isSelfHosted() ? actor?.role === "admin" : actor?.role === "customer_admin";
  if (!isTenantAdmin) return NextResponse.json({ error: "只有客户管理员可以管理员工账号" }, { status: 403 });
  const tenantId = isSelfHosted() ? "owner" : actor!.id;
  const license = isSelfHosted() ? getLicense() : null;
  const hostedLicense = !isSelfHosted() ? getTenantLicense(tenantId) : null;
  if (isSelfHosted() && !license?.valid) return NextResponse.json({ error: license?.reason || "授权无效" }, { status: 403 });
  if (!isSelfHosted() && !hostedLicense?.authorized) return NextResponse.json({ error: "此账户尚未获准使用" }, { status: 403 });
  const employees = systemDb.prepare("SELECT id,email,display_name,active,permissions,created_at FROM auth_users WHERE role='user' AND tenant_id=? ORDER BY created_at DESC").all(tenantId) as any[];
  const result = employees.map((employee) => {
    const counts = runWithTenantDatabase(employee.id, () => ({ customers: (db.prepare("SELECT COUNT(*) c FROM leads").get() as any).c, messages: (db.prepare("SELECT COUNT(*) c FROM inbox").get() as any).c, quotes: (db.prepare("SELECT COUNT(*) c FROM quotes").get() as any).c }));
    return { ...employee, permissions: normalizePermissions(parseJson(employee.permissions)), counts };
  });
  return NextResponse.json({ employees: result, license: isSelfHosted() ? { maxEmployees: license && license.valid ? license.license.maxEmployees : 0, modules: license && license.valid ? license.license.modules : [] } : { maxEmployees: hostedLicense!.maxEmployees, modules: hostedLicense!.modules }, selfHosted: isSelfHosted() });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const actor = await getRequestUser(req);
  const isTenantAdmin = isSelfHosted() ? actor?.role === "admin" : actor?.role === "customer_admin";
  if (!isTenantAdmin) return NextResponse.json({ error: "只有客户管理员可以创建员工账号" }, { status: 403 });
  try {
    const body = await req.json();
    const employee = createEmployee({ email: String(body.email || ""), password: String(body.password || ""), displayName: String(body.displayName || ""), permissions: body.permissions, tenantId: isSelfHosted() ? "owner" : actor!.id });
    return NextResponse.json({ ok: true, employee: { id: employee.id, email: employee.email, displayName: employee.display_name } }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "创建员工账户失败" }, { status: 400 }); }
});

export const PATCH = withAuth(async function PATCH(req: NextRequest) {
  const actor = await getRequestUser(req);
  const isTenantAdmin = isSelfHosted() ? actor?.role === "admin" : actor?.role === "customer_admin";
  if (!isTenantAdmin) return NextResponse.json({ error: "只有客户管理员可以管理员工账号" }, { status: 403 });
  try {
    const body = await req.json();
    if (!/^[0-9a-f-]{36}$/i.test(String(body.id || ""))) return NextResponse.json({ error: "员工账号无效" }, { status: 400 });
    const updated = updateEmployee(String(body.id), { displayName: body.displayName, password: body.password, permissions: body.permissions, active: body.active }, isSelfHosted() ? "owner" : actor!.id);
    return NextResponse.json({ ok: true, employee: { id: updated.id, email: updated.email, displayName: updated.display_name, active: updated.active } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "保存员工设置失败" }, { status: 400 }); }
});

function parseJson(value: string) { try { return JSON.parse(value || "[]"); } catch { return []; } }
