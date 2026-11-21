import { randomUUID } from "node:crypto";
import { getConnection, listConnections, removeConnection, saveConnection, type Connection } from "./channel-connections";
import { db } from "./db";
import { whatsAppOwner, whatsAppState } from "./evolution";

type WhatsApp = Connection<"whatsapp">;

export function ownerForWhatsApp(ref: string): string | undefined {
  return (db.prepare("SELECT owner_number FROM whatsapp_account_history WHERE connection_id = ?").get(ref) as { owner_number: string } | undefined)?.owner_number;
}

export function recordWhatsAppOwner(connection: WhatsApp, owner: string): WhatsApp | null {
  if (!/^\d{5,18}$/.test(owner)) return null;
  return db.transaction(() => {
    const current = getConnection("whatsapp", connection.id);
    if (!current || current.instance !== connection.instance) return null;
    const previous = ownerForWhatsApp(current.id);
    if (previous === owner) return current;
    let id = current.id;
    if (previous) {
      id = randomUUID();
      removeConnection("whatsapp", current.id);
      const { instance, label, webhookToken } = current;
      saveConnection("whatsapp", id, { instance, label, webhookToken });
    }
    db.prepare("INSERT INTO whatsapp_account_history (connection_id, owner_number) VALUES (?, ?)").run(id, owner);
    return { ...current, id };
  }).immediate();
}

export async function identifyWhatsApp(connection: WhatsApp): Promise<WhatsApp | null> {
  const owner = await whatsAppOwner(connection.instance);
  return owner ? recordWhatsAppOwner(connection, owner) : getConnection("whatsapp", connection.id);
}

export function whatsappContinuations(accounts = listConnections("whatsapp")) {
  const byRef = new Map(accounts.map((account) => [account.id, account]));
  const history = db.prepare("SELECT connection_id, owner_number FROM whatsapp_account_history").all() as { connection_id: string; owner_number: string }[];
  const currentByOwner = new Map<string, WhatsApp[]>();
  for (const entry of history) {
    const current = byRef.get(entry.connection_id);
    if (!current) continue;
    const candidates = currentByOwner.get(entry.owner_number) || [];
    candidates.push(current);
    currentByOwner.set(entry.owner_number, candidates);
  }
  for (const entry of history) {
    const candidates = currentByOwner.get(entry.owner_number);
    if (!byRef.has(entry.connection_id) && candidates?.length === 1) byRef.set(entry.connection_id, candidates[0]);
  }
  return byRef;
}

export async function whatsAppForReply(ref: string): Promise<{ account?: WhatsApp; error?: string; status?: number }> {
  if (!ref) return { error: "这条历史消息未关联 WhatsApp 账号", status: 409 };
  const account = whatsappContinuations().get(ref);
  if (!account) return { error: "请重新连接这段会话原先使用的 WhatsApp 账号", status: 409 };
  const state = await whatsAppState(account.instance);
  if (!state.ok) return { error: state.message, status: 502 };
  if (state.state !== "open") return { error: `「${account.label}」当前离线，请连接后重试`, status: 409 };
  const current = await identifyWhatsApp(account);
  if (!current || current.id !== account.id) return { error: "这段会话的 WhatsApp 账号已变更，请重新打开会话", status: 409 };
  return { account: current };
}
