"use client";

import { useState } from "react";
import { NavIcon } from "@/components/AppShell";
import { formatSalesAmount } from "@/components/SalesMetrics";
import { APPROVAL_LABELS, quoteItems, reviewQuoteLine, sameQuotedProduct, type Quote, type QuoteItem, type QuoteProduct } from "@/lib/quote-assistant";

const tabs = { price: "价格分析", history: "历史报价", profit: "利润测算", rules: "报价规则" } as const;
type Tab = keyof typeof tabs;
type Props = { items: QuoteItem[]; products: QuoteProduct[]; quotes: Quote[]; currency: string; leadId?: number; quote?: Quote; approvalBusy: boolean; onSubmit: (id: number) => void };

export default function QuoteAssistant({ items, products, quotes, currency, leadId, quote, approvalBusy, onSubmit }: Props) {
  const [tab, setTab] = useState<Tab>("price");
  const [rates, setRates] = useState<Record<string, string>>({});
  const [request, setRequest] = useState<{ context: string; text?: string; error?: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const currentRates = Object.fromEntries(Object.entries(rates).filter(([key]) => key.startsWith(`${currency}/`)).map(([key, rate]) => [key.split("/")[1], rate]));
  const lines = items.map((item) => reviewQuoteLine(item, products, currency, currentRates));
  const requiredRates = [...new Set(lines.flatMap(({ product }) => product?.unit_cost && product.cost_currency !== currency ? [product.cost_currency] : []))];
  const history = quotes.filter((past) => past.id !== quote?.id && past.currency === currency && ["已发", "已查看", "已接受", "成交"].includes(past.status) && (items.length || (leadId && past.lead_id === leadId)))
    .flatMap((past) => quoteItems(past.items).filter((item) => (items.length ? items.some((active) => sameQuotedProduct(active, item)) : true) && Number.isFinite(Number(item.unit)))
      .map((item, index) => ({ quote: past, item, index }))).slice(0, 8);
  const noPrice = lines.filter(({ item }) => !(item.unit > 0)).length;
  const belowMoq = lines.filter((line) => line.belowMoq).length;
  const noCost = lines.filter(({ cost }) => cost === null).length;
  const noLeadTime = lines.filter(({ product }) => !product?.lead_time).length;
  const revenue = lines.reduce((sum, { item }) => sum + Number(item.amount || 0), 0);
  const costTotal = noCost ? null : lines.reduce((sum, { item, cost }) => sum + Number(item.qty || 0) * (cost ?? 0), 0);
  const gross = costTotal !== null && revenue > 0 ? revenue - costTotal : null;
  const context = JSON.stringify({
    currency, revenue, gross, belowMoq, noCost, noLeadTime,
    lines: lines.slice(0, 16).map(({ item, product, cost, margin }) => ({
      name: item.name.slice(0, 100), qty: item.qty, unitPrice: item.unit, unitCostInQuoteCurrency: cost,
      estimatedMargin: margin, targetMargin: product?.default_margin, moq: product?.moq, leadTime: product?.lead_time?.slice(0, 80),
    })),
    history: history.map(({ item, quote }) => ({ product: item.name.slice(0, 100), date: quote.created_at, qty: item.qty, unitPrice: item.unit })),
  });

  async function analyze() {
    setAnalyzing(true);
    setRequest(null);
    try {
      const response = await fetch("/api/quotes/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "报价分析失败。");
      setRequest({ context, text: data.text });
    } catch (error) {
      setRequest({ context, error: error instanceof Error ? error.message : "报价分析失败。" });
    } finally { setAnalyzing(false); }
  }

  return <aside aria-label="报价助手" className="min-w-0 space-y-4 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5 xl:sticky xl:top-4">
    <header className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F0EAFE] text-[#664ED0]"><NavIcon name="spark" /></span>
      <div><h2 className="text-sm font-semibold text-ink">报价助手</h2>{quote ? <p className="mt-0.5 text-[11px] text-muted">{quote.quote_no}</p> : null}</div>
    </header>
    <div role="group" aria-label="报价助手视图" className="grid grid-cols-4 gap-0.5 rounded-xl bg-[#F4F1F9] p-1">
      {(Object.entries(tabs) as [Tab, string][]).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key}
        className={`rounded-lg py-1.5 text-[11px] font-medium ${key === tab ? "bg-white text-[#5946C1] shadow-sm" : "text-muted hover:text-ink"}`} onClick={() => setTab(key)}>{label}</button>)}
    </div>
    {tab === "price" ? <>
      {lines.length ? <>
        <div className="space-y-2 rounded-xl bg-[#F7F4FC] p-3 text-xs text-ink">
          <p>同币种历史记录 <strong>{history.length}</strong> 条</p>
          <p>低于最小订购量 <strong className={belowMoq ? "text-[#9C4F1C]" : "text-[#237357]"}>{belowMoq}</strong> 项</p>
          <p>缺少单价 <strong>{noPrice}</strong> 项 · 交期待核实 <strong>{noLeadTime}</strong> 项</p>
        </div>
        {belowMoq || noPrice || noLeadTime ? <div className="rounded-xl border border-[#F0DBC5] bg-[#FFF7EE] p-3 text-xs leading-5 text-[#864B22]">
          <p className="font-semibold">核价提醒</p>
          {belowMoq ? <p>按最低订购量检查报价数量。</p> : null}
          {noPrice ? <p>补齐产品单价后再确认总额。</p> : null}
          {noLeadTime ? <p>有产品尚未记录交期，请确认可交货时间。</p> : null}
        </div> : null}
        <button type="button" disabled={analyzing} onClick={() => void analyze()}
          className="rounded-lg bg-[#5947C9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4937B6] disabled:opacity-50">{analyzing ? "正在分析…" : "生成 AI 核价建议"}</button>
        {request?.context === context && request.text ? <p className="whitespace-pre-wrap rounded-xl bg-[#F4EFFF] p-3 text-xs leading-relaxed text-ink">{request.text}</p> : null}
        {request?.context === context && request.error ? <p role="alert" className="text-xs text-[#9B3127]">{request.error}</p> : null}
      </> : <p className="rounded-xl bg-[#F8F7FC] p-3 text-xs leading-relaxed text-muted">填写报价明细，或从下方报价列表选择一张查看价格、成本与交期。</p>}
    </> : null}
    {tab === "history" ? <>
      {history.length ? <ul className="max-h-64 divide-y divide-line overflow-auto text-xs">
        {history.map(({ item, quote, index }) => <li key={`${quote.id}-${index}`} className="space-y-1 py-2.5">
          <div className="flex items-start justify-between gap-2"><span className="font-medium text-ink">{item.name}</span><strong className="shrink-0 text-[#5946C1]">{formatSalesAmount(Number(item.unit), quote.currency)} / 件</strong></div>
          <p className="text-muted">{quote.created_at} · {quote.company || quote.quote_no} · {item.qty} 件</p>
        </li>)}
      </ul> : <p className="rounded-xl bg-[#F8F7FC] p-3 text-xs text-muted">暂无同产品、同币种的历史报价。</p>}
    </> : null}
    {tab === "profit" ? <>
      {requiredRates.map((code) => <label className="block text-xs text-muted" key={code}>1 {code} 折合 {currency}
        <input className="mt-1 w-full" type="number" min="0" step="any" value={rates[`${currency}/${code}`] || ""} placeholder="填写换算汇率"
          onChange={(event) => setRates((current) => ({ ...current, [`${currency}/${code}`]: event.target.value }))} />
      </label>)}
      <dl className="grid grid-cols-2 gap-2 rounded-xl bg-[#F7F4FC] p-3 text-xs">
        <dt className="text-muted">报价收入</dt><dd className="text-right font-medium text-ink">{lines.length ? formatSalesAmount(revenue, currency) : "—"}</dd>
        <dt className="text-muted">产品和包装成本</dt><dd className="text-right font-medium text-ink">{costTotal !== null && lines.length ? formatSalesAmount(costTotal, currency) : "待补齐"}</dd>
        <dt className="text-muted">估算毛利率</dt><dd className="text-right font-semibold text-[#5946C1]">{gross !== null ? `${(gross / revenue * 100).toFixed(1)}%` : "—"}</dd>
      </dl>
      {lines.map(({ item, product, margin }, index) => margin !== null && product && margin < product.default_margin ?
        <p key={index} className="text-xs text-[#92532A]">{item.name} 毛利率低于资料库目标 {product.default_margin}%。</p> : null)}
      <p className="text-[11px] leading-relaxed text-muted">按产品和包装成本估算。整单运费、佣金和其他费用可在<a href="/quotes/calculator" className="text-[#5946C1] underline">报价与利润计算器</a>里计算。</p>
    </> : null}
    {tab === "rules" ? <>
      <ul className="max-h-64 divide-y divide-line overflow-auto">
        {lines.map(({ item, product, belowMoq }, index) => <li key={index} className="space-y-1 py-2.5 text-xs">
          <p className="font-medium text-ink">{item.name}</p>
          <p className={belowMoq ? "text-[#9C4F1C]" : "text-muted"}>最低订购量 {product?.moq ?? "待补齐"} · 当前 {item.qty} 件</p>
          <p className="text-muted">资料库交期 {product?.lead_time || "待核实"}</p>
        </li>)}
      </ul>
      <a href="/quotes/library" className="inline-block text-xs font-medium text-[#5946C1] hover:underline">查看报价资料库</a>
    </> : null}
    {quote ? <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
      <p className="text-muted">审批状态 <strong className="ml-1 text-ink">{APPROVAL_LABELS[quote.approval_status] || "未提交"}</strong></p>
      {quote.status === "草稿" && (!quote.approval_status || quote.approval_status === "rejected") ? <button type="button" disabled={approvalBusy || !lines.length}
        onClick={() => onSubmit(quote.id)} className="rounded-lg border border-[#D9D0F9] px-3 py-2 font-medium text-[#5946C1] hover:bg-[#F4F0FE] disabled:opacity-50">提交审批</button> : null}
    </div> : null}
  </aside>;
}
