"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type Inputs = { qty: string; unitCost: string; packing: string; inspection: string; inland: string; exportFees: string; port: string; freightUsd: string; fx: string; commission: string; bankPct: string; bankFixed: string; margin: string; insurance: string; term: string };
const initial: Inputs = { qty: "1000", unitCost: "18", packing: "1.2", inspection: "0.3", inland: "1800", exportFees: "900", port: "1200", freightUsd: "0", fx: "7.2", commission: "0", bankPct: "0.5", bankFixed: "150", margin: "20", insurance: "0.15", term: "FOB" };
const Field = ({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) => <label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[#53625A]">{label}</span><span className="flex items-center rounded-lg border border-[#E5E1F4] bg-white focus-within:border-[#8EB5A2]"><input type="number" min="0" step="any" className="w-full border-0 bg-transparent px-3 py-2.5 text-[12px] focus:border-0" value={value} onChange={(event) => onChange(event.target.value)}/>{suffix ? <span className="pr-3 text-[10px] text-[#9AA49F]">{suffix}</span> : null}</span></label>;

export default function QuoteCalculatorPage() {
  const [form, setForm] = useState(initial);
  const set = (key: keyof Inputs, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => {
    const n = (key: keyof Inputs) => Math.max(0, Number(form[key]) || 0);
    const qty = Math.max(1, n("qty")); const fx = Math.max(0.0001, n("fx"));
    const factory = qty * (n("unitCost") + n("packing") + n("inspection"));
    const exportCost = ["FOB", "CFR", "CIF"].includes(form.term) ? n("inland") + n("exportFees") + n("port") : 0;
    const freight = ["CFR", "CIF"].includes(form.term) ? n("freightUsd") * fx : 0;
    const fixedCost = factory + exportCost + freight + n("bankFixed");
    const margin = n("margin") / 100; const commission = n("commission") / 100; const bank = n("bankPct") / 100;
    const insuranceRate = form.term === "CIF" ? n("insurance") / 100 * 1.1 : 0;
    const divisor = 1 - margin - commission - bank - insuranceRate;
    if (divisor <= 0) return { valid: false, totalUsd: 0, unitUsd: 0, profitCny: 0, grossMargin: 0, costsCny: fixedCost };
    const revenueCny = fixedCost / divisor;
    const profitCny = revenueCny - fixedCost - revenueCny * (margin + commission + bank + insuranceRate);
    return { valid: true, totalUsd: revenueCny / fx, unitUsd: revenueCny / fx / qty, profitCny, grossMargin: revenueCny ? profitCny / revenueCny * 100 : 0, costsCny: fixedCost };
  }, [form]);
  const money = (value: number, currency: string) => `${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;

  return <AppShell><div className="min-h-screen bg-[#F8F7FC] px-5 py-7 lg:px-8"><div className="mx-auto max-w-[1180px]">
    <div className="mb-6"><p className="text-[10px] font-semibold tracking-[0.16em] text-[#7167C8]">EXPORT PRICING</p><h1 className="mt-1 text-[22px] font-semibold text-[#24322B]">报价与利润计算器</h1><p className="mt-1.5 text-[12px] text-[#89958F]">按出口成本、贸易术语、佣金与目标毛利反推建议报价。</p></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <section className="rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><h2 className="mb-4 text-[14px] font-semibold text-[#34423B]">产品与订单成本</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="订单数量" value={form.qty} onChange={(v) => set("qty", v)} suffix="件"/><Field label="产品出厂成本 / 件" value={form.unitCost} onChange={(v) => set("unitCost", v)} suffix="CNY"/><Field label="包装成本 / 件" value={form.packing} onChange={(v) => set("packing", v)} suffix="CNY"/><Field label="验货等单件成本" value={form.inspection} onChange={(v) => set("inspection", v)} suffix="CNY"/><Field label="汇率（1 USD = ? CNY）" value={form.fx} onChange={(v) => set("fx", v)} suffix="CNY"/><label className="block"><span className="mb-1.5 block text-[11px] font-medium text-[#53625A]">贸易术语</span><select className="w-full rounded-lg border border-[#E5E1F4] px-3 py-2.5 text-[12px]" value={form.term} onChange={(e) => set("term", e.target.value)}><option>EXW</option><option>FOB</option><option>CFR</option><option>CIF</option></select></label>
        </div></section>
        <section className="rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><h2 className="mb-1 text-[14px] font-semibold text-[#34423B]">出口费用与销售费用</h2><p className="mb-4 text-[10px] text-[#97A19B]">FOB 起计入国内段与出口港杂费；CFR/CIF 再计入海运费。</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="国内运输（整单）" value={form.inland} onChange={(v) => set("inland", v)} suffix="CNY"/><Field label="报关 / 单证 / 商检（整单）" value={form.exportFees} onChange={(v) => set("exportFees", v)} suffix="CNY"/><Field label="港杂费（整单）" value={form.port} onChange={(v) => set("port", v)} suffix="CNY"/><Field label="海运费（整单）" value={form.freightUsd} onChange={(v) => set("freightUsd", v)} suffix="USD"/><Field label="银行固定费用（整单）" value={form.bankFixed} onChange={(v) => set("bankFixed", v)} suffix="CNY"/><Field label="银行 / 收款费率" value={form.bankPct} onChange={(v) => set("bankPct", v)} suffix="%"/>
        </div></section>
        <section className="rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><h2 className="mb-4 text-[14px] font-semibold text-[#34423B]">目标利润与保险</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="销售佣金" value={form.commission} onChange={(v) => set("commission", v)} suffix="%"/><Field label="目标毛利率（按销售额）" value={form.margin} onChange={(v) => set("margin", v)} suffix="%"/><Field label="海运保险费率（CIF）" value={form.insurance} onChange={(v) => set("insurance", v)} suffix="%"/></div></section>
      </div>
      <aside className="h-fit rounded-2xl bg-[#342B70] p-5 text-white shadow-[0_12px_35px_rgba(24,63,50,.16)] xl:sticky xl:top-6"><p className="text-[10px] font-semibold tracking-[0.14em] text-[#D7D1FF]">建议报价 · {form.term}</p>{result.valid ? <><div className="mt-5"><p className="text-[11px] text-[#D7D1FF]">建议单价</p><p className="mt-1 text-[31px] font-semibold tracking-tight">${result.unitUsd.toFixed(2)}<span className="ml-1 text-[12px] font-normal text-[#D7D1FF]">/ 件</span></p></div><div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4"><div><p className="text-[10px] text-[#D7D1FF]">订单总报价</p><p className="mt-1 text-[15px] font-semibold">{money(result.totalUsd,"USD")}</p></div><div><p className="text-[10px] text-[#D7D1FF]">估算毛利</p><p className="mt-1 text-[15px] font-semibold">{money(result.profitCny,"CNY")}</p></div><div><p className="text-[10px] text-[#D7D1FF]">目标毛利率</p><p className="mt-1 text-[13px]">{result.grossMargin.toFixed(1)}%</p></div><div><p className="text-[10px] text-[#D7D1FF]">计入成本</p><p className="mt-1 text-[13px]">{money(result.costsCny,"CNY")}</p></div></div></> : <div className="mt-5 rounded-xl bg-white/10 p-4 text-[12px] leading-6">佣金、银行费、保险与目标毛利合计过高，分母小于或等于 0。请调低费率后再计算。</div>}<div className="mt-5 rounded-xl bg-white/10 p-3 text-[10px] leading-5 text-[#E0DCFF]">公式：报价收入 = 已计入成本 ÷（1 − 佣金率 − 银行费率 − 保险率 − 目标毛利率）。CIF 保险按发票金额 110% 估算。目的港费用、关税、汇率波动和特殊融资费用需按实际补充核价。</div><button onClick={() => setForm(initial)} className="mt-4 w-full rounded-lg border border-white/25 py-2 text-[11px] text-white hover:bg-white/10">恢复示例参数</button></aside>
    </div>
  </div></div></AppShell>;
}
