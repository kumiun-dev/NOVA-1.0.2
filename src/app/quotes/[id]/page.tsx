"use client";

import { use, useEffect, useState } from "react";
import BrandLogo from "@/components/BrandLogo";
import PrintButton from "@/components/PrintButton";
import type { QuoteItem } from "@/lib/quote-assistant";

type QuoteDocument = { quote_no: string; created_at: string; valid_until: string; currency: string; total: number; company: string | null; country: string | null; items: QuoteItem[] };

export default function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [q, setQuote] = useState<QuoteDocument | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/quotes/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法加载报价单。");
      if (!controller.signal.aborted) setQuote(data.quote);
    }).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [id]);

  if (!q) return <main className="mx-auto max-w-2xl px-6 py-8">
    <a href="/quotes" className="text-sm text-muted underline">返回报价单</a>
    <p role={error ? "alert" : "status"} className="mt-4 text-sm text-ink">{error || "正在加载报价单…"}</p>
  </main>;
  const items = q.items;

  return (
    <div className="min-h-screen bg-[#F0F0EC] px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <a href="/quotes" className="print:hidden text-[12px] text-muted underline">← 返回</a>
          <PrintButton />
        </div>
        <div className="rounded-xl border border-line bg-white p-8">
          <div className="flex items-start justify-between border-b border-line pb-5">
            <div>
              <BrandLogo size={38} />
              <p className="mt-2 text-[16px] font-medium tracking-[2px] text-ink">NOVA</p>
              <p className="text-[12px] text-faint">报价单 Quotation</p>
            </div>
            <div className="text-right text-[12px] text-muted">
              <p className="font-medium text-ink">{q.quote_no}</p>
              <p>日期：{q.created_at}</p>
              <p>有效期至：{q.valid_until || "—"}</p>
              <p>币种：{q.currency}</p>
            </div>
          </div>
          <div className="border-b border-line py-4 text-[13px]">
            <p className="text-faint">致 / To</p>
            <p className="font-medium text-ink">{q.company || "—"}</p>
            {q.country ? <p className="text-muted">{q.country}</p> : null}
          </div>
          <table className="mt-4 w-full text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-faint">
                <th className="py-2 font-normal">品名</th>
                <th className="py-2 font-normal">规格</th>
                <th className="py-2 text-right font-normal">数量</th>
                <th className="py-2 text-right font-normal">单价</th>
                <th className="py-2 text-right font-normal">金额</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-[#F0F0EC]">
                  <td className="py-2 text-ink">{it.name}</td>
                  <td className="py-2 text-muted">{it.spec}</td>
                  <td className="py-2 text-right text-ink">{it.qty}</td>
                  <td className="py-2 text-right text-ink">{it.unit.toFixed(2)}</td>
                  <td className="py-2 text-right text-ink">{it.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <div className="text-right">
              <p className="text-[12px] text-faint">总计 Total</p>
              <p className="text-[18px] font-medium text-ink">{q.total.toFixed(2)} {q.currency}</p>
            </div>
          </div>
          <p className="mt-8 border-t border-line pt-4 text-[11px] text-faint">
            本报价单金额需人工核对确认，报价有效期以右上角为准。付款与交期条款另行约定。
          </p>
        </div>
      </div>
    </div>
  );
}
