"use client";

import { useEffect, useState } from "react";
import AppShell, { NavIcon } from "@/components/AppShell";
import TradeRates from "@/components/TradeRates";
import { SALES_STAGES } from "@/lib/stages";

type Stats = {
  total: number; pending: number; inboxTotal: number; quoteTotal: number; quoteAccepted: number;
  dealCount: number; hasEmail: number; hasWa: number; followupToday: number; todayNew: number;
  followups: { id: number; lead_id: number; content: string; next_at: string; company: string }[];
  byStatus: { status: string; c: number }[]; bySource: { source: string; c: number }[]; byCountry: { country: string; c: number }[];
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "上午好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export default function HomePage() {
  const [s, setS] = useState<Stats | null>(null);
  const [displayName, setDisplayName] = useState("森哥");

  useEffect(() => {
    fetch("/api/stats").then((r) => r.json()).then(setS);
    fetch("/api/profile").then((r) => r.json()).then((d) => { if (d.displayName) setDisplayName(d.displayName); }).catch(() => {});
  }, []);

  if (!s) return <AppShell><div className="px-6 py-5 text-[12px] text-faint">加载中…</div></AppShell>;

  const cards = [
    { label: "今日新增客户", value: s.todayNew, href: "/customers" },
    { label: "待跟进", value: s.followupToday, href: "/customers", warn: s.followupToday > 0 },
    { label: "待处理回信", value: s.pending, href: "/workbench", warn: s.pending > 0 },
    { label: "报价单", value: s.quoteTotal, href: "/quotes" },
    { label: "成交", value: s.dealCount, href: "/customers" },
    { label: "客户总数", value: s.total, href: "/customers" },
  ];

  const statusCount = (st: string) => s.byStatus.find((x) => x.status === st)?.c ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{greeting()}，{displayName}</h1>
          <p className="text-[12px] text-faint">这里汇总今天的客户、待办和跟进</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {cards.map((c, index) => (
            <a key={c.label} href={c.href} className={`nova-metric nova-metric-${["violet","amber","blue","green","amber","violet"][index]} min-w-0 rounded-3xl border p-5 shadow-sm hover:shadow-md transition-shadow`}>
              <div className="mb-4 flex items-center justify-between"><span className="rounded-xl border border-white/90 bg-white/60 p-2 text-[#7054C8]"><NavIcon name={["users","workflow","chat","file","chart","users"][index]} /></span><span aria-hidden="true" className="text-muted">↗</span></div><div className="text-xs text-muted">{c.label}</div>
              <div className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: c.warn ? "#A32D2D" : "#16181A" }}>{c.value}</div>
            </a>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {[{label:"客户邮箱覆盖",value:s.hasEmail,total:s.total,color:"#8062BD"}, {label:"WhatsApp 联系覆盖",value:s.hasWa,total:s.total,color:"#618E83"}, {label:"报价接受占比",value:s.quoteAccepted,total:s.quoteTotal,color:"#B78670"}].map(row => <section key={row.label} className="rounded-3xl border border-white/90 bg-white/85 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><h2 className="text-xs font-semibold text-muted">{row.label}</h2><span className="rounded-full bg-[#F3EFF8] px-2 py-1 text-xs tabular-nums text-[#7054C8]">{row.total ? Math.round(row.value/row.total*100) : 0}%</span></div>
            <p className="mt-3 text-2xl font-semibold text-ink">{row.value}<span className="ml-2 text-xs font-normal text-muted">/ {row.total}</span></p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F1EDF5]"><div className="h-full rounded-full" style={{width:`${row.total ? row.value/row.total*100 : 0}%`,backgroundColor:row.color}} /></div>
          </section>)}
        </div>
        <TradeRates />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] font-medium text-ink">客户阶段</p>
            <div className="space-y-2.5">
              {SALES_STAGES.map((st) => {
                const c = statusCount(st);
                const pct = s.total ? Math.round((c / s.total) * 100) : 0;
                return (
                  <div key={st} className="flex items-center gap-2">
                    <span className="w-12 flex-none text-[12px] text-muted">{st}</span>
                    <div className="h-2 flex-1 rounded-full bg-paper">
                      <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: ["#7054C8","#6096A2","#C39A6D","#B18AAB","#8D80B5","#5D9581","#BBB0CC"][SALES_STAGES.indexOf(st)] }} />
                    </div>
                    <span className="w-10 flex-none text-right text-[12px] text-ink">{c}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] font-medium text-ink">跟进提醒</p>
            {s.followups.length === 0 ? (
              <p className="text-[12px] text-faint">没有待跟进的任务</p>
            ) : (
              <div className="space-y-2">
                {s.followups.map((f) => (
                  <a key={f.id} href={`/customers/${f.lead_id}`} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 hover:bg-paper">
                    <i className="h-1.5 w-1.5 flex-none rounded-full bg-[#A32D2D]" />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{f.company || "客户"}</span>
                    <span className="flex-none text-[11px] text-faint">{f.next_at}</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] font-medium text-ink">客户地区分布</p>
            {s.byCountry.length === 0 ? <p className="text-[12px] text-faint">暂无数据</p> : (
              <div className="space-y-2.5">
                {s.byCountry.map((x, index) => (
                  <div key={x.country} className="flex items-center justify-between text-[12px]">
                    <span className="flex min-w-0 items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{background:["#7054C8","#6096A2","#C39A6D","#B18AAB"][index%4]}} />{x.country}</span>
                    <span className="text-ink tabular-nums">{x.c}<span className="ml-3 text-[11px] text-muted">{s.total ? Math.round(x.c/s.total*100) : 0}%</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
