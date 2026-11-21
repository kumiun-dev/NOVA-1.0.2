import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { whatsAppProfilePicture } from "@/lib/evolution";
import { whatsappContinuations } from "@/lib/whatsapp-connections";

const cache = new Map<string, { url: string | null; expires: number }>();

export const POST = withAuth(async function POST(req: NextRequest) {
  const user = await getRequestUser(req);
  if (!user) return NextResponse.json({ error: "登录状态已失效" }, { status: 401 });
  const { ids } = await req.json().catch(() => ({}));
  const selected = Array.isArray(ids) ? ([...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))] as number[]).slice(0, 24) : [];
  if (!selected.length) return NextResponse.json({ avatars: {} });
  const rows = db.prepare(`
    SELECT id, connection_ref, recipient_id FROM inbox
    WHERE channel='WhatsApp' AND id IN (${selected.map(() => "?").join(",")})
  `).all(...selected) as { id: number; connection_ref: string; recipient_id: string }[];
  const accounts = whatsappContinuations();
  const avatars: Record<number, string | null> = {};
  for (let start = 0; start < rows.length; start += 4) {
    await Promise.all(rows.slice(start, start + 4).map(async (row) => {
      const account = accounts.get(row.connection_ref);
      if (!account) { avatars[row.id] = null; return; }
      const key = `${user.id}:${account.id}:${row.recipient_id}`;
      const known = cache.get(key);
      if (known && known.expires > Date.now()) { avatars[row.id] = known.url; return; }
      const url = await whatsAppProfilePicture(account.instance, row.recipient_id);
      if (cache.size >= 2000) cache.delete(cache.keys().next().value!);
      cache.set(key, { url, expires: Date.now() + (url ? 15 : 3) * 60_000 });
      avatars[row.id] = url;
    }));
  }
  return NextResponse.json({ avatars }, { headers: { "Cache-Control": "private, no-store" } });
});
