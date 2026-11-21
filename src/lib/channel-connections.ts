import { whatsappDomainSuffix } from "./whatsapp-gateway";
import { randomBytes, randomUUID } from "node:crypto";
import { db, deleteSettings, getAllSettings, getSetting, setSetting } from "./db";

export type MetaChannel = "facebook" | "instagram";
export type ZernioPlatform = MetaChannel | "linkedin";
export type MailProvider = "gmail" | "enterprise";
export type ChannelKind = MetaChannel | MailProvider | "whatsapp" | `zernio_${ZernioPlatform}`;
export type MetaConnection = { assetId: string; pageId: string; label: string; pageToken: string };
export type ZernioConnection = { accountId: string; profileId: string; label: string; status: "connected" | "expired" | "disconnected"; changedAt: number; relay?: boolean };
export type WhatsAppConnection = { instance: string; webhookToken: string; label: string };
export type GmailConnection = { label: string; accessToken: string; refreshToken: string; expiresAt: number; oauthClientId?: string };
export const ENTERPRISE_MAIL_KEYS = [
  "smtp_host", "smtp_port", "smtp_secure", "smtp_user", "smtp_pass", "smtp_from",
  "imap_host", "imap_port", "imap_secure", "imap_user", "imap_pass", "mail_proxy",
] as const;
export type EnterpriseMail = Partial<Record<typeof ENTERPRISE_MAIL_KEYS[number], string>> & { label: string };

type Configs = {
  facebook: MetaConnection;
  zernio_facebook: ZernioConnection;
  zernio_instagram: ZernioConnection;
  zernio_linkedin: ZernioConnection;
  instagram: MetaConnection;
  whatsapp: WhatsAppConnection;
  gmail: GmailConnection;
  enterprise: EnterpriseMail;
};
export type Connection<K extends ChannelKind> = Configs[K] & { id: string };

const legacyKeys = [
  "meta_connected", "meta_page_id", "meta_page_name", "meta_access_token", "meta_page_access_token",
  "meta_instagram_id", "meta_facebook_connection", "meta_instagram_connection",
  "evolution_instance", "evolution_connection_id", "evolution_webhook_token", "google_connected",
  "google_email", "google_access_token", "google_refresh_token", "google_token_expiry",
  ...ENTERPRISE_MAIL_KEYS,
];
const migration = "channel_connections_migrated";

function parseRecord<T>(raw: string): T | null {
  try { return JSON.parse(raw) as T | null; }
  catch { return null; }
}

function writeConnection<K extends ChannelKind>(kind: K, id: string, config: Configs[K]) {
  db.prepare("INSERT INTO channel_connections (kind,id,data) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data")
    .run(kind, id, JSON.stringify(config));
}

function attachOldMessages(channel: string, ref: string) {
  db.prepare("UPDATE inbox SET connection_ref=? WHERE channel=? AND COALESCE(connection_ref,'')='' AND source_message_id<>''")
    .run(ref, channel);
}

export function ensureChannelConnections() {
  if (getSetting(migration)) return;
  db.transaction(() => {
    if (getSetting(migration)) return;
    const old = getAllSettings();
    for (const channel of ["facebook", "instagram"] as const) {
      const pageId = old.meta_page_id;
      const assetId = channel === "facebook" ? pageId : old.meta_instagram_id;
      const pageToken = old.meta_page_access_token || old.meta_access_token;
      const record = old[`meta_${channel}_connection`];
      const connection = record ? parseRecord<MetaConnection>(record)
        : old.meta_connected === "true" && assetId && pageId && pageToken
          ? { assetId, pageId, pageToken, label: channel === "facebook" ? old.meta_page_name || pageId : assetId } : null;
      if (connection?.assetId && connection.pageToken) {
        writeConnection(channel, connection.assetId, connection);
        attachOldMessages(channel === "facebook" ? "Facebook" : "Instagram", connection.assetId);
      }
    }
    if (old.evolution_instance) {
      const id = old.evolution_connection_id || old.evolution_instance;
      writeConnection("whatsapp", id, {
        instance: old.evolution_instance, label: "WhatsApp 原有账号",
        webhookToken: old.evolution_webhook_token || randomBytes(24).toString("hex"),
      });
      attachOldMessages("WhatsApp", id);
    }
    if (old.google_connected === "true" && (old.google_access_token || old.google_refresh_token)) {
      writeConnection("gmail", randomUUID(), { label: old.google_email || "Gmail", accessToken: old.google_access_token || "",
        refreshToken: old.google_refresh_token || "", expiresAt: Number(old.google_token_expiry || 0) });
    }
    const oldMail = Object.fromEntries(ENTERPRISE_MAIL_KEYS.filter((key) => old[key]).map((key) => [key, old[key]]));
    if (Object.keys(oldMail).some((key) => key !== "mail_proxy")) {
      writeConnection("enterprise", randomUUID(), { ...oldMail, label: oldMail.smtp_user || oldMail.imap_user || "企业邮箱" });
    }
    if (old.mail_proxy) setSetting("enterprise_default_mail_proxy", old.mail_proxy);
    deleteSettings(legacyKeys);
    setSetting(migration, "true");
  }).immediate();
}

export function listConnections<K extends ChannelKind>(kind: K): Connection<K>[] {
  ensureChannelConnections();
  const rows = db.prepare("SELECT id,data FROM channel_connections WHERE kind=? ORDER BY rowid").all(kind) as { id: string; data: string }[];
  return rows.map((row) => ({ ...JSON.parse(row.data) as Configs[K], id: row.id }));
}

export function getConnection<K extends ChannelKind>(kind: K, id: string): Connection<K> | null {
  ensureChannelConnections();
  const row = db.prepare("SELECT data FROM channel_connections WHERE kind=? AND id=?").get(kind, id) as { data: string } | undefined;
  return row ? { ...JSON.parse(row.data) as Configs[K], id } : null;
}

export function saveConnection<K extends ChannelKind>(kind: K, id: string, config: Configs[K]) {
  ensureChannelConnections();
  writeConnection(kind, id, config);
}

export function removeConnection(kind: ChannelKind, id: string) {
  ensureChannelConnections();
  return db.prepare("DELETE FROM channel_connections WHERE kind=? AND id=?").run(kind, id).changes > 0;
}

export function createWhatsAppConnection(accountId: string, label: string) {
  const prefix = accountId === "owner" ? "nova_owner" : `nova_${accountId.replace(/-/g, "").slice(0, 24)}`;
  const id = randomUUID();
  const connection = { id, label, instance: `${prefix}_${randomBytes(6).toString("hex")}${whatsappDomainSuffix()}`, webhookToken: randomBytes(24).toString("hex") };
  saveConnection("whatsapp", id, connection);
  return connection;
}

export type OAuthKind = MetaChannel | "gmail" | `zernio_${ZernioPlatform}`;
type OAuthData = { target?: string; options?: MetaConnection[]; profileId?: string; relay?: boolean };

export function createOAuthFlow(kind: OAuthKind, data: OAuthData) {
  const state = randomBytes(24).toString("hex");
  db.prepare("DELETE FROM channel_oauth WHERE expires_at<=?").run(Date.now());
  db.prepare("INSERT INTO channel_oauth (state,kind,expires_at,data) VALUES (?,?,?,?)")
    .run(state, kind, Date.now() + 15 * 60_000, JSON.stringify(data));
  return state;
}

export function getOAuthFlow(state: string) {
  const row = db.prepare("SELECT kind,data FROM channel_oauth WHERE state=? AND expires_at>?").get(state, Date.now()) as { kind: OAuthKind; data: string } | undefined;
  return row ? { kind: row.kind, ...JSON.parse(row.data) as OAuthData } : null;
}

export function finishOAuthFlow(state: string) {
  return db.prepare("DELETE FROM channel_oauth WHERE state=? AND expires_at>?").run(state, Date.now()).changes > 0;
}

export function setOAuthProfile(state: string, profileId: string) {
  return db.prepare("UPDATE channel_oauth SET data=json_set(data,'$.profileId',?) WHERE state=? AND expires_at>?")
    .run(profileId, state, Date.now()).changes > 0;
}

