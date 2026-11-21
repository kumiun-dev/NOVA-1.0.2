import { createPublicKey, verify } from "node:crypto";
import { systemDb } from "@/lib/db";
import { MODULES } from "@/lib/permissions";

// Public half of the NOVA customer release signing key. The private half never ships.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAvHNMcuIEPwVGT3cq9z7J
ePCPwzmKP8Tso74D4nZEAMCFft1BHbqkzzyNyYfV7jJwEYPakUDYkijTXUDOLpjk
IsiPEPC82oS7RoRIMIVz+o7BdSqmLSOuF6Dy/KtlutU1kNvb7ctw7idhXmJWriH8
seZrSCD272osR9fDU7I7Iez5GNZoIL4qciW5/fGURSUzfd1ccL/BXone5IModf/+
mbuHU+BXwzlaTILpGQwdDendTwXqbSSiNwIbDi4z4+EjFqcRCgNk8lbj0Gb1yOBt
LW1nZaA6MKRUXdOq4v+VV4PwNPlq5dw8BodvXa2XOQ4J8+JSlbiFf9/MIzDgKfG7
x4aNAeWNJa0x+97ESp4C6uQwmDHgzYDT/C2Et6mF2k8723I/AqfXXrRHTU0IO2uR
KbPJDpQ34L6bjIV0LEdIGk3URvBVEBxqZNpXoB2uJ8dYD1+VYXsh+b0KbgcCJxbf
4tkQdEETzaj55ZYv8DruNQg1M1FLKCFC9Valp/nFQ20BAgMBAAE=
-----END PUBLIC KEY-----`;

export type NovaLicense = {
  product: "NOVA";
  domain: string;
  expiresAt: string;
  maxEmployees: number;
  modules: string[];
};

export type TenantLicense = { authorized: boolean; expiresAt: string; maxEmployees: number; modules: string[] };

export function isSelfHosted() { return true; }

export function verifyLicenseToken(token: string, configuredDomain: string): { valid: true; license: NovaLicense } | { valid: false; reason: string } {
  token = token.trim();
  const domain = configuredDomain.trim().toLowerCase();
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return { valid: false, reason: "此 NOVA 实例尚未获得授权，请联系 NOVA 管理员" };
  try {
    const ok = verify("RSA-SHA256", Buffer.from(payload), createPublicKey(PUBLIC_KEY), Buffer.from(signature, "base64url"));
    if (!ok) return { valid: false, reason: "授权凭证无效，请联系 NOVA 管理员" };
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as any;
    if (claims.v === 1 && (!Number.isInteger(claims.e) || claims.e <= 0 || !Number.isInteger(claims.n) || claims.n < 0 || !Number.isInteger(claims.m) || claims.m <= 0 || claims.m >= (1 << MODULES.length))) {
      return { valid: false, reason: "授权内容无效，请联系 NOVA 管理员" };
    }
    const license: NovaLicense = claims.v === 1
      ? { product: "NOVA", domain: String(claims.d || ""), expiresAt: new Date(Number(claims.e) * 1000).toISOString(), maxEmployees: Number(claims.n), modules: MODULES.filter((_, index) => (Number(claims.m) & (1 << index)) !== 0).map(([id]) => id) }
      : claims as NovaLicense;
    if (license.product !== "NOVA" || !domain || license.domain.toLowerCase() !== domain) return { valid: false, reason: "授权域名不匹配，请联系 NOVA 管理员" };
    if (!Number.isFinite(Date.parse(license.expiresAt)) || Date.parse(license.expiresAt) <= Date.now()) return { valid: false, reason: "授权已到期，请联系 NOVA 管理员续期" };
    if (!Number.isInteger(license.maxEmployees) || license.maxEmployees < 0 || !Array.isArray(license.modules) || license.modules.length === 0) return { valid: false, reason: "授权内容无效，请联系 NOVA 管理员" };
    return { valid: true, license };
  } catch {
    return { valid: false, reason: "授权凭证无法读取，请联系 NOVA 管理员" };
  }
}

export function getStoredLicenseToken() {
  const configured = String(process.env.NOVA_LICENSE_TOKEN || "").trim();
  if (configured) return configured;
  try { return String((systemDb.prepare("SELECT value FROM settings WHERE key='selfhost_license_token'").get() as { value?: string } | undefined)?.value || "").trim(); }
  catch { return ""; }
}

export function getLicense(): { valid: true; license: NovaLicense } | { valid: false; reason: string } {
  if (!isSelfHosted()) return { valid: true, license: { product: "NOVA", domain: "hosted", expiresAt: "", maxEmployees: 0, modules: ["*"] } };
  return verifyLicenseToken(getStoredLicenseToken(), String(process.env.NOVA_DOMAIN || ""));
}

export function isModuleLicensed(module: string) {
  const result = getLicense();
  return result.valid && (result.license.modules.includes("*") || result.license.modules.includes(module));
}

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
