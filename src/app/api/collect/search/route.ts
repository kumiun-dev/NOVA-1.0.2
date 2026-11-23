import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";
import { cutServiceFetch } from "@/lib/cut-service-client";
import type { LeadCandidate } from "@/lib/sources/types";

export const runtime = "nodejs";

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const keyword = String(body.keyword || "").trim().slice(0, 120);
  const country = String(body.country || "").trim().slice(0, 100);
  const industry = String(body.industry || "").trim().slice(0, 100);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 50)));
  if (!keyword) return NextResponse.json({ error: "请输入公司或产品关键词" }, { status: 400 });

  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      const push = (event: unknown) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        let rows: any[];
        {
          const endpoint = String(process.env.NOVA_SHARED_CATALOG_URL || "https://svr.admarket.cn/api/shared-catalog/search").trim();
          const response = await cutServiceFetch(endpoint, JSON.stringify({ keyword, country, industry, limit }));
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(String(data.error || "共享采购商资料暂时无法连接"));
          rows = Array.isArray(data.leads) ? data.leads : [];
        }

        push({ type: "start", keyword, sources: ["NOVA 共享采购商资料"] });
        const leads = rows.map((row, index) => {
          const existing = db.prepare("SELECT id FROM leads WHERE country=? AND (lower(company)=lower(?) OR (lower(email)=lower(?) AND email!='')) LIMIT 1")
            .get(row.country, row.company, row.email || "") as { id: number } | undefined;
          const candidate: LeadCandidate = {
            company: row.company || "", name: row.contact_name || "", email: row.email || "", phone: row.phone || "",
            whatsapp: row.whatsapp || "", country: row.country || "", industry: row.industry || row.buyer_type || "",
            position: row.position || "", website: row.website || "", address: row.address || "", source: "共享采集资料",
          };
          const lead = {
            ...candidate, id: existing?.id ?? -(index + 1), inCustomers: Boolean(existing),
            completeness: [candidate.company, candidate.email, candidate.phone].filter(Boolean).length,
            rank: (candidate.email ? 3 : 0) + (candidate.phone || candidate.whatsapp ? 2 : 0) + (candidate.name ? 1 : 0) + (candidate.website ? 1 : 0),
          };
          push({ type: "lead", lead });
          return lead;
        });
        push({
          type: "done", leads, checked: leads.length, rejectedIncomplete: 0, reasons: {}, target: limit,
          warnings: [], total: leads.length, keyword,
          skipped: leads.filter((lead: any) => lead.inCustomers).length,
        });
      } catch (error) {
        push({ type: "error", message: error instanceof Error ? error.message : "搜索企业资料失败，请稍后重试" });
      } finally {
        controller.close();
      }
    },
    cancel() {},
  }), { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
});
