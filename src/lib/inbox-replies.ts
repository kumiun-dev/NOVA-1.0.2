import { db } from "./db";

export type SentReply = { id: number; body: string; mode: string; created_at: string };

export function recordSentReply(inboxId: number, body: string, mode: "人工" | "AI自动回复", externalId = "", whatsappRef = "", dedupe = false): { replies: SentReply[]; echoedIds: number[] } {
  return db.transaction(() => {
    if (dedupe && externalId && db.prepare("SELECT 1 FROM inbox_replies WHERE inbox_id=? AND external_id=?").get(inboxId, externalId)) {
      const replies = db.prepare("SELECT id, body, mode, created_at FROM inbox_replies WHERE inbox_id=? ORDER BY id").all(inboxId) as SentReply[];
      return { replies, echoedIds: [] };
    }
    db.prepare(`
      INSERT INTO inbox_replies (inbox_id, body, mode, created_at, external_id)
      SELECT id, draft, COALESCE(reply_mode, ''), COALESCE(created_at, ''), COALESCE(external_id, '')
      FROM inbox WHERE id = ? AND state = '已发送' AND COALESCE(draft, '') <> ''
    `).run(inboxId);
    db.prepare(`
      INSERT INTO inbox_replies (inbox_id, body, mode, created_at, external_id, connection_ref)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(inboxId, body, mode, new Date().toISOString(), externalId, whatsappRef);
    db.prepare(`
      UPDATE inbox SET state = '已发送', draft = '', reply_mode = ?,
        external_id = COALESCE(NULLIF(?, ''), external_id) WHERE id = ?
    `).run(mode, externalId, inboxId);
    const echoedIds = externalId && whatsappRef ? (db.prepare(`
      DELETE FROM inbox WHERE channel='WhatsApp' AND direction='outgoing'
        AND connection_ref=? AND source_message_id=? AND id<>? RETURNING id
    `).all(whatsappRef, externalId, inboxId) as { id: number }[]).map(({ id }) => id) : [];
    const replies = db.prepare("SELECT id, body, mode, created_at FROM inbox_replies WHERE inbox_id = ? ORDER BY id").all(inboxId) as SentReply[];
    return { replies, echoedIds };
  })();
}
