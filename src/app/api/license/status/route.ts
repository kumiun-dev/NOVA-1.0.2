import { NextResponse } from "next/server";
import { getLicense, isSelfHosted } from "@/lib/license";
import { userById } from "@/lib/auth";
export async function GET() {
  const result = getLicense();
  const selfHosted = isSelfHosted();
  const setupRequired = selfHosted && !userById("owner");
  return NextResponse.json({ selfHosted, setupRequired, authorized: result.valid, message: result.valid ? "" : setupRequired ? "首次使用，请使用 NOVA 提供的授权码注册管理员账户。" : result.reason, license: result.valid ? { expiresAt: result.license.expiresAt, maxEmployees: result.license.maxEmployees, modules: result.license.modules } : null });
}
