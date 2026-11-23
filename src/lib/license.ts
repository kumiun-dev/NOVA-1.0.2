import { systemDb } from "./db";
export type NovaLicense = {
  product: "NOVA";
  domain: string;
  expiresAt: string;
  maxEmployees: number;
  modules: string[];
};

export type TenantLicense = { authorized: boolean; expiresAt: string; maxEmployees: number; modules: string[] };


export function isSelfHosted() { return true; }
export function getLicense(): { valid: true; license: NovaLicense } | { valid: false; reason: string } {
 return { valid:true,license:{product:"NOVA",domain:process.env.NOVA_DOMAIN || "",expiresAt:"",maxEmployees:Number.MAX_SAFE_INTEGER,modules:["*"]} };
}
export function isModuleLicensed(_module: string) { return true; }
export function getTenantLicense(tenantId: string): TenantLicense | null {
  if (!tenantId) return null;
  const row = systemDb.prepare("SELECT authorized,expires_at,max_employees,modules FROM auth_tenants WHERE tenant_id=?").get(tenantId) as { authorized: number; expires_at: string; max_employees: number; modules: string } | undefined;
  if (!row) return null;
  let modules: string[] = [];
  try { modules = JSON.parse(row.modules || "[]"); } catch {}
  const expires = Date.parse(row.expires_at);
  return { authorized: row.authorized === 1 && Number.isFinite(expires) && expires > Date.now(), expiresAt: row.expires_at || "", maxEmployees: Number(row.max_employees) || 0, modules: modules.filter((v) => typeof v === "string") };
}

export function isTenantModuleLicensed(tenantId: string, module: string) {
  const license = getTenantLicense(tenantId);
  return Boolean(license?.authorized && (license.modules.includes("*") || license.modules.includes(module)));
}
