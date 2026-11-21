import { CUSTOMER_EDITION } from "./edition";
import { getStoredLicenseToken } from "./license";
import { createHash } from "node:crypto";

export function whatsappDomainSuffix() {
  return CUSTOMER_EDITION ? "__" + createHash("sha256").update((process.env.NOVA_DOMAIN || "").trim().toLowerCase()).digest("hex").slice(0, 16) : "";
}

export async function evolutionFetch(input: string, init: RequestInit = {}) {
  if (!CUSTOMER_EDITION) return fetch(input, init);
  const url = new URL(input);
  const headers = new Headers(init.headers);
  headers.delete("apikey");
  headers.set("Authorization", "Bearer " + getStoredLicenseToken());
  headers.set("Content-Type", "application/json");
  return fetch("https://svr.admarket.cn/api/whatsapp-gateway", {
    method: "POST", headers, cache: "no-store", signal: init.signal || AbortSignal.timeout(20000),
    body: JSON.stringify({ path: url.pathname + url.search, method: init.method || "GET", body: init.body ? JSON.parse(String(init.body)) : undefined }),
  });
}
