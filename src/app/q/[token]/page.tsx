"use client";
import BrandLogo from "@/components/BrandLogo";


import { use, useEffect, useState } from "react";

type Quote = {
  id: number;
  quote_no: string;
  items: { name: string; spec: string; qty: number; unit: number; amount: number }[];
  total: number;
  currency: string;
  status: string;
  valid_until: string;
  created_at: string;
  company: string;
  country: string;
  contact: string;
  email: string;
};

const STATUS_LABEL: Record<string, string> = {
  草稿: "草稿",
  已发: "已发送",
  已查看: "已查看",
  已接受: "已接受",
};

export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/q/${token}`)
      .then((r) => (r.ok ? r.json() : r.json().then((d) => { throw new Error(d.error || "加载失败"); })))
      .then((d) => setQuote(d.quote))
      .catch((e) => setError(e.message || "链接无效"));
  }, [token]);

  async function accept() {
    if (!quote) return;
    setAccepting(true);
    const r = await fetch(`/api/q/${token}`, { method: "POST" });
    const d = await r.json();
    setAccepting(false);
    if (d.ok) {
      setDone(true);
      setQuote({ ...quote, status: "已接受" });
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <div className="rounded-xl border border-line bg-card px-10 py-12 text-center">
          <p className="text-[15px] font-medium text-ink">报价单不可用</p>
          <p className="mt-2 text-[12px] text-faint">{error}</p>
        </div>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-[13px] text-faint">加载中…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0EC] px-6 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-xl border border-line bg-white p-8">
          <div className="flex items-start justify-between border-b border-line pb-5">
            <div>
              <BrandLogo size={38} />
              <p className="mt-2 text-[16px] font-medium tracking-[2px] text-ink">NOVA</p>
              <p className="text-[12px] text-faint">报价单 Quotation</p>
            </div>
            <div className="text-right text-[12px] text-muted">
              <p className="font-medium text-ink">{quote.quote_no}</p>
              <p>日期：{quote.created_at}</p>
              <p>有效期至：{quote.valid_until || "—"}</p>
              <p>币种：{quote.currency}</p>
            </div>
          </div>

          <div className="border-b border-line py-4 text-[13px]">
            <p className="text-faint">致 / To</p>
            <p className="font-medium text-ink">{quote.company || "—"}</p>
            {quote.country ? <p className="text-muted">{quote.country}</p> : null}
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
              {quote.items.map((it, i) => (
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
              <p className="text-[18px] font-medium text-ink">{quote.total.toFixed(2)} {quote.currency}</p>
            </div>
          </div>

          <p className="mt-8 border-t border-line pt-4 text-[11px] text-faint">
            本报价单金额需人工核对确认，报价有效期以右上角为准。付款与交期条款另行约定。
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            {done || quote.status === "已接受" ? (
              <span className="rounded-md border border-[#2E7D5B] px-5 py-2 text-[13px] text-[#2E7D5B]">已接受</span>
            ) : (
              <button
                onClick={accept}
                disabled={accepting}
                className="rounded-md bg-[#16181A] px-8 py-2.5 text-[13px] text-white disabled:opacity-60"
              >
                {accepting ? "提交中…" : "接受报价"}
              </button>
            )}
            <span className="text-[11px] text-faint">当前状态：{STATUS_LABEL[quote.status] || quote.status}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
