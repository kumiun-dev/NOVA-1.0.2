import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSalesStage, localDay, type SalesLead, type SalesSnapshot } from "@/lib/sales-overview";

export const GET = withAuth(async function GET(req: NextRequest) {
  const input = req.nextUrl.searchParams.get("date") || "";
  const end = new Date(`${input}T00:00:00Z`);
  const to = /^\d{4}-\d{2}-\d{2}$/.test(input) && Number.isFinite(+end) && end.toISOString().slice(0, 10) === input
    ? input : localDay();
  const period = req.nextUrl.searchParams.get("period");
  const days = period === "today" ? 1 : period === "week" ? 7 : period === "month" ? Number(to.slice(-2)) : 30;
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  const from = start.toISOString().slice(0, 10);
  const leads = db.prepare(`
    SELECT l.id,l.company,COALESCE(l.country,'') AS country,COALESCE(l.industry,'') AS industry,
      COALESCE(l.status,'') AS status,COALESCE(l.acquired_at,'') AS acquired_at,COALESCE(f.next_at,'') AS next_at,
      COALESCE((SELECT i.classification IN ('有意向','要报价单') FROM inbox i
        WHERE i.lead_id=l.id AND i.direction='incoming' AND i.classification IN ('有意向','要报价单','暂缓','休假')
        ORDER BY i.id DESC LIMIT 1),0) AS interested
    FROM leads l LEFT JOIN followups f ON f.id=(SELECT MAX(j.id) FROM followups j WHERE j.lead_id=l.id)
    ORDER BY l.id DESC
  `).all() as SalesLead[];
  const scoped = leads.filter((lead) => lead.acquired_at >= from && lead.acquired_at <= to);
  const leadDays = new Map<string, number>();
  for (const { acquired_at } of scoped) leadDays.set(acquired_at, (leadDays.get(acquired_at) || 0) + 1);
  const arrivals = db.prepare(`
    SELECT substr(created_at,1,10) AS date,COUNT(*) AS count FROM inbox
    WHERE direction='incoming' AND substr(created_at,1,10) BETWEEN ? AND ? GROUP BY date
  `).all(from, to) as { date: string; count: number }[];
  const inquiryDays = new Map(arrivals.map(({ date, count }) => [date, count]));
  const trend = Array.from({ length: days }, (_, offset) => {
    const date = new Date(+start + offset * 86_400_000).toISOString().slice(0, 10);
    return { date, leads: leadDays.get(date) || 0, inquiries: inquiryDays.get(date) || 0 };
  });
  const pending = db.prepare("SELECT COUNT(*) AS count FROM inbox WHERE state='待批准' AND direction='incoming'").get() as { count: number };
  const acceptedByCurrency = db.prepare(`
    SELECT currency, ROUND(SUM(total),2) AS total FROM quotes WHERE status='已接受'
    AND substr(accepted_at,1,10) BETWEEN ? AND ? GROUP BY currency ORDER BY currency
  `).all(`${to.slice(0, 7)}-01`, to) as SalesSnapshot["acceptedByCurrency"];
  return NextResponse.json({
    from, to, leads, trend, pending: pending.count, acceptedByCurrency,
    followupToday: leads.filter((lead) => lead.next_at.slice(0, 10) === to && !["成交", "流失"].includes(lead.status)).length,
    overdue: leads.filter((lead) => lead.next_at && lead.next_at.slice(0, 10) < to && !["成交", "流失"].includes(lead.status)).length,
    interested: leads.filter((lead) => lead.interested && !["成交", "流失"].includes(lead.status)).length,
  } satisfies SalesSnapshot);
});

export const PATCH = withAuth(async function PATCH(req: NextRequest) {
  const { id, status, previous } = await req.json().catch(() => ({})) ?? {};
  if (!Number.isSafeInteger(id) || id < 1 || !isSalesStage(status) || typeof previous !== "string") {
    return NextResponse.json({ error: "请选择有效的客户阶段。" }, { status: 400 });
  }
  const updated = db.prepare("UPDATE leads SET status=? WHERE id=? AND COALESCE(status,'')=?").run(status, id, previous);
  if (!updated.changes) return NextResponse.json({ error: "客户阶段已变更，请刷新后重试。" }, { status: 409 });
  return NextResponse.json({ ok: true });
});
