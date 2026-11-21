import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { listConnections } from "@/lib/channel-connections";
import { withAuth } from "@/lib/auth";
import type { SentReply } from "@/lib/inbox-replies";
import { whatsappContinuations } from "@/lib/whatsapp-connections";
import { zernioConfigured, zernioKind } from "@/lib/zernio";
import { canUseZernioRelay } from "@/lib/zernio-relay-client";

export const GET = withAuth(async function GET(req: NextRequest) {
  const after = req.nextUrl.searchParams.get("after");
  const cursor = Number(after);
  if (after !== null && (!Number.isSafeInteger(cursor) || cursor < 0)) {
    return NextResponse.json({ error: "消息位置无效" }, { status: 400 });
  }
  const labels = new Map<string, string>();
  const whatsapp = whatsappContinuations();
  const zernio = new Map([...listConnections(zernioKind("facebook")), ...listConnections(zernioKind("instagram"))].map((account) => [account.id, account]));
  for (const [channel, kind] of [["Facebook", "facebook"], ["Instagram", "instagram"]] as const) {
    for (const { id, label } of listConnections(kind)) labels.set(`${channel}:${id}`, label);
  }
  const query = `
    SELECT i.*, l.company, l.name AS lead_name,
      (SELECT json_group_array(json_object('id', r.id, 'body', r.body, 'mode', r.mode, 'created_at', r.created_at))
       FROM (SELECT id, body, mode, created_at FROM inbox_replies WHERE inbox_id = i.id ORDER BY id) r) AS reply_json
    FROM inbox i LEFT JOIN leads l ON l.id = i.lead_id
  `;
  const rows = (after === null
    ? db.prepare(`${query} ORDER BY i.id DESC`).all()
    : db.prepare(`${query} WHERE i.id > ? ORDER BY i.id ASC LIMIT 200`).all(cursor)
  ) as { id: number; channel: string; channel_source: string; connection_ref: string; attachment_types: string; read_at: string; state: string; draft: string; reply_mode: string; created_at: string; reply_json: string }[];
  const inbox = rows.map(({ reply_json, ...row }) => {
    const wa = row.channel === "WhatsApp" ? whatsapp.get(row.connection_ref) : undefined;
    const linked = row.channel_source === "zernio" ? zernio.get(row.connection_ref) : undefined;
    const replies: SentReply[] = JSON.parse(reply_json);
    if (row.state === "已发送" && row.draft) {
      replies.unshift({ id: -row.id, body: row.draft, mode: row.reply_mode, created_at: row.created_at });
    }
    return {
      ...row,
      draft: row.state === "已发送" ? "" : row.draft,
      replies,
      attachment_types: JSON.parse(row.attachment_types),
      connection_group: wa?.id || row.connection_ref,
      connection_label: wa?.label || linked?.label || (row.connection_ref ? labels.get(`${row.channel}:${row.connection_ref}`) || `历史连接 · ${row.connection_ref.slice(-6)}` : ""),
      reply_available: row.channel_source === "zernio" ? linked?.status === "connected" && (linked.relay ? canUseZernioRelay() : zernioConfigured()) : row.channel !== "WhatsApp" || Boolean(wa),
    };
  });
  return NextResponse.json({ inbox });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const { id, state, draft, action } = await req.json();
  if (action === "read") {
    const result = db.prepare(`
      UPDATE inbox SET read_at=? WHERE channel_source='zernio' AND direction='incoming' AND read_at=''
      AND (connection_ref,recipient_id) = (SELECT connection_ref,recipient_id FROM inbox WHERE id=? AND channel_source='zernio')
    `).run(new Date().toISOString(), Number(id));
    return NextResponse.json({ ok: true, read: result.changes });
  }
  if (state === "已发送") return NextResponse.json({ error: "请使用工作台的发送按钮。状态不能代替真实发送。" }, { status: 400 });
  if (draft !== undefined) db.prepare("UPDATE inbox SET draft = ? WHERE id = ? AND state <> '已发送'").run(draft, id);
  return NextResponse.json({ ok: true });
});
