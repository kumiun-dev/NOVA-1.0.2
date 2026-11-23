import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { systemDb } from "./db";

// Generated per installation, saved with the database; never a NOVA-issued credential.
function identity() {
  const load = () => (systemDb.prepare("SELECT value FROM settings WHERE key='cut_service_identity'").get() as { value: string } | undefined)?.value;
  let pem = load();
  if (!pem) {
    const generated = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    systemDb.prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('cut_service_identity',?)").run(generated);
    pem = load()!;
  }
  const privateKey = createPrivateKey(pem);
  const publicKey = createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64url");
  return { privateKey, publicKey };
}
export function cutInstanceSuffix() {
  return "__" + createHash("sha256").update(identity().publicKey).digest("hex").slice(0, 16);
}
export function cutServiceFetch(endpoint: string, body: string, signal?: AbortSignal | null) {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("共享服务需要 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("共享服务地址无效");
  const { privateKey, publicKey } = identity();
  const domain = String(process.env.NOVA_DOMAIN || "").trim().toLowerCase();
  const time = String(Date.now()), nonce = randomUUID();
  const message = ["POST", url.pathname, domain, time, nonce, body].join("\n");
  return fetch(url, { method: "POST", headers: {
    "Content-Type": "application/json", "X-Nova-Cut-Key": publicKey, "X-Nova-Cut-Domain": domain,
    "X-Nova-Cut-Time": time, "X-Nova-Cut-Nonce": nonce,
    "X-Nova-Cut-Signature": sign(null, Buffer.from(message), privateKey).toString("base64url"),
  }, body, signal: signal || AbortSignal.timeout(25000), cache: "no-store", redirect: "error" });
}
