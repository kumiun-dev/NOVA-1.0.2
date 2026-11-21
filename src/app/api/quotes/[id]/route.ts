import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { quoteItems } from "@/lib/quote-assistant";

export const GET = withAuth(async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = db.prepare(`
    SELECT q.quote_no,q.items,q.total,q.currency,q.valid_until,q.created_at,l.company,l.country
    FROM quotes q LEFT JOIN leads l ON l.id=q.lead_id WHERE q.id=?
  `).get(id) as { items: string } | undefined;
  if (!quote) return NextResponse.json({ error: "报价单不存在。" }, { status: 404 });
  return NextResponse.json({ quote: { ...quote, items: quoteItems(quote.items) } });
});
