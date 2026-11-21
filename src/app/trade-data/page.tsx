"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Row = { name: string; count: number; total?: number; currency?: string };
type Data = { customers: number; quotes: number; accepted: number; acceptanceRate: number; quoteValues: Row[]; byCountry: Row[]; byIndustry: Row[]; byStage: Row[]; bySource: Row[]; months: Row[]; sourceLabel: string };
function Bars({ title, rows, suffix = "家", money = false }: { title: string; rows: Row[]; suffix?: string; money?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => money ? Number(row.total || 0) : row.count));
  return <section className="rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-[13px] font-semibold text-[#34423B]">{title}</h2><span className="text-[9px] text-[#9AA49F]">{money ? "报价单金额按币种汇总" : "记录数"}</span></div>{rows.length ? <div className="space-y-3">{rows.map((row) => <div key={`${row.name}:${row.currency || ""}`}><div className="mb-1 flex justify-between gap-3 text-[10px]"><span className="truncate text-[#56645C]">{row.name}{money && row.currency ? ` · ${row.currency}` : ""}</span><span className="shrink-0 text-[#7C8881]">{money ? `${Number(row.total || 0).toLocaleString(undefined,{maximumFractionDigits:2})} ${row.currency || ""}` : `${row.count} ${suffix}`}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#F0EEFF]"><div className="h-full rounded-full bg-[#7167C8]" style={{ width: `${Math.max(4,(money ? Number(row.total || 0) : row.count)/max*100)}%` }}/></div></div>)}</div> : <p className="py-5 text-center text-[10px] text-[#A1AAA5]">暂无记录</p>}</section>;
}
export default function TradeDataPage() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => { fetch("/api/trade-data").then((response) => response.json()).then(setData); }, []);
  return <AppShell><div className="min-h-screen bg-[#F8F7FC] px-5 py-7 lg:px-8"><div className="mx-auto max-w-[1180px]">
    <div className="mb-5"><p className="text-[10px] font-semibold tracking-[0.16em] text-[#7167C8]">TRADE INSIGHTS</p><h1 className="mt-1 text-[22px] font-semibold text-[#24322B]">贸易数据</h1><p className="mt-1.5 text-[12px] text-[#89958F]">从客户、获客来源、销售阶段与报价记录中，查看你的目标市场和销售进度。</p></div>
    <div className="mb-5 flex gap-2 rounded-xl border border-[#E7E4F1] bg-white px-4 py-3 text-[10px] leading-5 text-[#758079]"><span className="text-[#7167C8]">ⓘ</span><span>当前数据源：{data?.sourceLabel || "本平台记录"}。这反映你已录入的业务线索与报价，不代表全球海关进出口总量；如需外部提单或官方贸易统计，需要另接对应数据源。</span></div>
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label:"客户与线索",value:data?.customers||0,note:"CRM 已录入"},{label:"报价单",value:data?.quotes||0,note:"全部状态"},{label:"已接受报价",value:data?.accepted||0,note:"客户确认成交意向"},{label:"报价接受率",value:`${data?.acceptanceRate||0}%`,note:"已接受 ÷ 报价单"}].map((card)=><div key={card.label} className="rounded-2xl border border-[#E5E1F4] bg-white p-4 shadow-sm"><p className="text-[10px] text-[#929D97]">{card.label}</p><p className="mt-2 text-[25px] font-semibold tracking-tight text-[#5548C8]">{card.value}</p><p className="mt-1 text-[9px] text-[#A2AAA6]">{card.note}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-2"><Bars title="客户国家 / 市场分布" rows={data?.byCountry||[]}/><Bars title="客户行业分布" rows={data?.byIndustry||[]}/><Bars title="销售阶段" rows={data?.byStage||[]}/><Bars title="客户来源" rows={data?.bySource||[]}/><Bars title="报价金额（按币种）" rows={data?.quoteValues||[]} money/><Bars title="近月报价活跃度" rows={(data?.months||[]).map((row)=>({...row,name:row.name||"未注明月份"}))} suffix="张"/></div>
  </div></div></AppShell>;
}
