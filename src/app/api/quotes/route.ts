import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import type { QuoteItem } from "@/lib/quote-assistant";

async function quoteInput(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) return null;
  const leadId = body.lead_id == null || body.lead_id === "" ? null : Number(body.lead_id);
  if (leadId !== null && (!Number.isSafeInteger(leadId) || leadId < 1 || !db.prepare("SELECT 1 FROM leads WHERE id=?").get(leadId))) return null;
  const items: QuoteItem[] = [];
  for (const entry of body.items) {
    if (!entry || typeof entry.name !== "string" || !entry.name.trim()) return null;
    const qty = Number(entry.qty);
    const unit = Number(entry.unit);
    const amount = Math.round(qty * unit * 100) / 100;
    if (!(qty > 0) || unit < 0 || !Number.isFinite(amount)) return null;
    const product = Number(entry.product_id);
    items.push({ name: entry.name.trim().slice(0, 200), spec: String(entry.spec || "").slice(0, 2000), qty, unit, amount,
      product_id: Number.isSafeInteger(product) && product > 0 ? product : undefined });
  }
  const currency = typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency) ? body.currency : "USD";
  const total = Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
  if (!Number.isFinite(total)) return null;
  const validUntil = typeof body.valid_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.valid_until) ? body.valid_until : "";
  return { id: body.id, leadId, currency, total, validUntil, items: JSON.stringify(items) };
}

export const GET = withAuth(async function GET() {
  const quotes = db.prepare(`
    SELECT q.*, l.company FROM quotes q LEFT JOIN leads l ON l.id = q.lead_id
    ORDER BY q.id DESC
  `).all();
  const counts = db.prepare(`
    SELECT (SELECT COUNT(*) FROM leads l WHERE l.status IN ('线索','已联系','谈判中')
      AND EXISTS (SELECT 1 FROM inbox i WHERE i.lead_id=l.id AND i.direction='incoming' AND i.classification='要报价单')
      AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.lead_id=l.id AND q.status IN ('已发','已查看','已接受','成交'))) AS awaiting,
    (SELECT COUNT(*) FROM quotes WHERE status IN ('已发','已查看','已接受','成交')) AS quoted,
    (SELECT COUNT(*) FROM leads WHERE status='样品中') AS samples,
    (SELECT COUNT(*) FROM leads WHERE status='成交') AS deals
  `).get();
  return NextResponse.json({ quotes, counts });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const input = await quoteInput(req);
  if (!input) return NextResponse.json({ error: "请检查客户和报价明细。每项需要品名、有效数量和非负单价。" }, { status: 400 });
  const saved = db.transaction(() => {
    const sequence = db.prepare("SELECT seq FROM sqlite_sequence WHERE name='quotes'").get() as { seq: number } | undefined;
    const quote_no = `BC-${new Date().getFullYear()}-${String((sequence?.seq ?? 0) + 1).padStart(4, "0")}`;
    const result = db.prepare(`
      INSERT INTO quotes (quote_no, lead_id, items, total, currency, status, valid_until, created_at)
      VALUES (?, ?, ?, ?, ?, '草稿', ?, ?)
    `).run(quote_no, input.leadId, input.items, input.total, input.currency, input.validUntil, new Date().toISOString().slice(0, 10));
    return { id: Number(result.lastInsertRowid), quote_no };
  }).immediate();
  return NextResponse.json({ ok: true, ...saved });
});

export const PATCH = withAuth(async function PATCH(req: NextRequest) {
  const input = await quoteInput(req);
  if (!input || !Number.isSafeInteger(input.id) || input.id < 1) return NextResponse.json({ error: "请检查报价明细。" }, { status: 400 });
  const result = db.prepare(`
    UPDATE quotes SET lead_id=?,items=?,total=?,currency=?,valid_until=?
    WHERE id=? AND status='草稿' AND approval_status IN ('','rejected')
  `).run(input.leadId, input.items, input.total, input.currency, input.validUntil, input.id);
  if (!result.changes) return NextResponse.json({ error: "报价单状态已变更，无法编辑。" }, { status: 409 });
  return NextResponse.json({ ok: true, id: input.id });
});
