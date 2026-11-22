import { randomUUID } from "node:crypto";
import { db, getSetting } from "./db";
import { ENTERPRISE_MAIL_KEYS, getConnection, listConnections, saveConnection, type Connection, type EnterpriseMail } from "./channel-connections";

export type MailAccount = ({ type: "gmail" } & Connection<"gmail">) | ({ type: "enterprise" } & Connection<"enterprise">);
export function mailAccounts(): MailAccount[] {
  return [
    ...listConnections("gmail").map((account) => ({ ...account, type: "gmail" as const })),
    ...listConnections("enterprise").map((account) => ({ ...account, type: "enterprise" as const })),
  ];
}

export function resolveMailAccount(reference?: string): MailAccount | undefined {
  const accounts = mailAccounts();
  if (reference === "gmail" || reference === "enterprise") {
    const matching = accounts.filter((account) => account.type === reference);
    return matching.length === 1 ? matching[0] : undefined;
  }
  return reference ? accounts.find((account) => account.id === reference) : accounts[0];
}

export function canSendMail(account?: MailAccount) {
  return Boolean(account && (account.type === "gmail" || (account.smtp_host && account.smtp_user && account.smtp_pass)));
}

export function canReceiveMail(account?: MailAccount) {
  return Boolean(account && (account.type === "gmail" || (account.imap_host && account.imap_user && account.imap_pass)));
}

export function listMailAccounts() {
  return mailAccounts().map((account) => ({
    id: account.id, type: account.type, label: account.label,
    smtp: canSendMail(account), imap: canReceiveMail(account),
  }));
}

export function saveEnterpriseAccount(raw: Record<string, unknown>, reference: string): string {
  return db.transaction(() => {
    const existing = reference === "new" ? null : reference ? getConnection("enterprise", reference) : listConnections("enterprise")[0] || null;
    if (reference && reference !== "new" && !existing) throw new Error("该企业邮箱已退出，请重新添加");
    const config: EnterpriseMail = { label: existing?.label || "" };
    for (const key of ENTERPRISE_MAIL_KEYS) {
      const previous = existing?.[key];
      if (previous !== undefined) config[key] = previous;
      const value = raw[key];
      if (typeof value !== "string") continue;
      const text = value.trim();
      if ((key === "smtp_pass" || key === "imap_pass") && !text) continue;
      config[key] = text;
    }
    config.mail_proxy ??= getSetting("enterprise_default_mail_proxy");
    for (const prefix of ["smtp", "imap"] as const) {
      if (existing && (existing[`${prefix}_user`] !== config[`${prefix}_user`] || existing[`${prefix}_host`] !== config[`${prefix}_host`]) && !raw[`${prefix}_pass`]) {
        delete config[`${prefix}_pass`];
      }
      const port = config[`${prefix}_port`];
      if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) throw new Error(`${prefix.toUpperCase()} 端口无效`);
    }
    config.label = config.smtp_user || config.imap_user || "";
    const candidate = { ...config, id: "", type: "enterprise" as const };
    if (!canSendMail(candidate) && !canReceiveMail(candidate)) throw new Error("请至少完整填写一组 SMTP 或 IMAP 配置及邮箱授权码");
    const duplicate = listConnections("enterprise").some((account) =>
      account.id !== existing?.id && account.label.toLowerCase() === config.label.toLowerCase());
    if (duplicate) throw new Error("该企业邮箱已添加，可在渠道页编辑现有账号");
    const id = existing?.id || randomUUID();
    saveConnection("enterprise", id, config);
    return id;
  }).immediate();
}

export function enterpriseFormValues(id: string) {
  const account = id === "new" ? null : id ? getConnection("enterprise", id) : listConnections("enterprise")[0] || null;
  if (id && id !== "new" && !account) return null;
  return {
    id: account?.id || "new", label: account?.label || "",
    ...Object.fromEntries(ENTERPRISE_MAIL_KEYS.map((key) => {
      const secret = key === "smtp_pass" || key === "imap_pass";
      const defaultValue = key.endsWith("_secure") ? "true" : key === "mail_proxy" ? getSetting("enterprise_default_mail_proxy") : "";
      return [key, secret ? "" : account?.[key] ?? defaultValue];
    })),
    smtp_pass_configured: Boolean(account?.smtp_pass),
    imap_pass_configured: Boolean(account?.imap_pass),
  };
}


