"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import TradeRates from "@/components/TradeRates";
import { SALES_STAGES } from "@/lib/stages";
type Stats = {
 total: number; pending: number; quoteTotal: number; quoteAccepted: number; dealCount: number;
 hasEmail: number; hasWa: number; followupToday: number; todayNew: number;
 followups: { id: number; lead_id: number; content: string; next_at: string; company: string; employee?: string }[];
 byStatus: { status: string; c: number }[]; byCountry: { country: string; c: number }[];
};
const number = (n: number) => n.toLocaleString("zh-CN");
const percent = (n: number, total: number) => !total ? "—" : n > 0 && n / total < .001 ? "<0.1%" : Math.round(n / total * 100) + "%";
// Respect NOVA's three themes and existing mark. Current-state metrics have no
// historical deltas; quote acceptance is a share, not a period conversion rate.
export default function HomePage() {
 const [s, setS] = useState<Stats | null>(null), [error, setError] = useState("");
 const [revision, refresh] = useState(0), [loading, setLoading] = useState(true);
 useEffect(() => {
  const controller = new AbortController(); setLoading(true);
  fetch("/api/stats", {signal:controller.signal, cache:"no-store"}).then(async r => {
   if (!r.ok) throw Error("stats");
   const d = await r.json();
   if (typeof d.total !== "number" || !Array.isArray(d.byStatus) || !Array.isArray(d.byCountry) || !Array.isArray(d.followups)) throw Error("stats");
   setS(d); setError("");
  }).catch(() => {if(!controller.signal.aborted) setError("统计数据暂时无法加载");})
  .finally(() => {if(!controller.signal.aborted) setLoading(false);});
  return () => controller.abort();
 }, [revision]);
 const cards = s ? [
  {label:"客户总数",value:s.total,href:"/customers",context:"全部客户"},
  {label:"今日新增客户",value:s.todayNew,href:"/customers",context:"今日 · UTC"},
  {label:"待跟进",value:s.followupToday,href:"/customers",context:"截至今日 · UTC",attention:s.followupToday>0},
  {label:"待处理回信",value:s.pending,href:"/workbench",context:"待批准",attention:s.pending>0},
  {label:"报价单",value:s.quoteTotal,href:"/quotes",context:"全部报价"},
  {label:"成交",value:s.dealCount,href:"/customers",context:"当前成交阶段"},
 ] : [];
 const countries = s ? [...s.byCountry] : [];
 const remaining = s ? Math.max(0,s.total-countries.reduce((sum,r)=>sum+r.c,0)) : 0;
 if(remaining) countries.push({country:"其他 / 未填写",c:remaining});
 return <AppShell pending={s?.pending}><div className="nova-overview">
  <header className="nova-page-heading"><div><h1>业务概览</h1><p>客户 · 跟进 · 报价</p></div><button type="button" className="nova-control" disabled={loading} onClick={()=>refresh(n=>n+1)}>{loading?"加载中…":"刷新数据"}</button></header>
  {error && <div className="nova-load-error" role="alert"><span>{error}{s?"，当前显示上次数据":""}</span><button className="nova-control" disabled={loading} onClick={()=>refresh(n=>n+1)}>重新加载</button></div>}
  {!s ? !error && <div role="status" className="nova-loading">正在加载业务数据…</div> : <div aria-busy={loading}>
   <section className="nova-kpis" aria-label="业务指标">{cards.map(c=><Link key={c.label} href={c.href} className={"nova-kpi"+(c.attention?" nova-kpi-attention":"")}>
    <span className="nova-kpi-label">{c.label}<span aria-hidden="true">↗</span></span><strong data-metric={c.label}>{number(c.value)}</strong><span className="nova-kpi-context">{c.context}{c.attention&&<span className="nova-attention-label">需处理</span>}</span>
   </Link>)}</section>
   <section className="nova-coverage" aria-label="联系与报价覆盖">{[{label:"客户邮箱覆盖",value:s.hasEmail,total:s.total},{label:"WhatsApp 联系覆盖",value:s.hasWa,total:s.total},{label:"报价接受占比",value:s.quoteAccepted,total:s.quoteTotal}].map(r=><div key={r.label} data-coverage={r.label}>
    <span>{r.label}</span><strong>{percent(r.value,r.total)}</strong><small>{number(r.value)} / {number(r.total)}</small><span className="nova-share-track" aria-hidden="true"><span style={{width:(r.total?Math.min(100,r.value/r.total*100):0)+"%"}}/></span>
   </div>)}</section>
   <div className="nova-overview-panels">
    <section className="nova-panel nova-stage-panel" aria-label="客户阶段"><header className="nova-panel-heading"><h2>客户阶段</h2><span>当前分布</span></header>
     {!s.total?<div className="nova-empty"><p>暂无客户数据</p><Link href="/customers">查看客户管理 ↗</Link></div>:<div className="nova-stage-list">{SALES_STAGES.map(st=>{const c=s.byStatus.find(r=>r.status===st)?.c??0;return <div className="nova-stage-row" key={st}><span>{st}</span><span className="nova-stage-track" aria-hidden="true"><span style={{width:c/s.total*100+"%"}}/></span><strong>{number(c)}</strong><small>{percent(c,s.total)}</small></div>;})}</div>}
    </section>
    <section className="nova-panel nova-followup-panel" aria-label="跟进提醒"><header className="nova-panel-heading"><h2>跟进提醒</h2><span>截至今日 · UTC</span></header>
     {!s.followups.length?<div className="nova-empty"><p>暂无到期跟进</p><span>新的到期任务会显示在这里</span></div>:<ul className="nova-followup-list">{s.followups.map((f,i)=><li key={(f.employee||"")+f.id+"-"+i}><Link href={"/customers/"+f.lead_id}><span className="nova-followup-title"><strong>{f.company||"客户"}</strong><span aria-hidden="true">↗</span></span>{f.content&&<span className="nova-followup-content">{f.content}</span>}<span className="nova-followup-meta"><time>{f.next_at}</time>{f.employee&&<span>{f.employee}</span>}</span></Link></li>)}</ul>}
    </section>
    <section className="nova-panel nova-country-panel" aria-label="客户地区分布"><header className="nova-panel-heading"><h2>客户地区分布</h2><span>占全部客户</span></header>
     {!s.total?<div className="nova-empty"><p>暂无地区数据</p></div>:<ol className="nova-country-list">{countries.map((r,i)=><li key={r.country} data-country={r.country}><span className="nova-country-rank">{String(i+1).padStart(2,"0")}</span><span className="nova-country-name">{r.country}</span><strong>{number(r.c)}</strong><small>{percent(r.c,s.total)}</small><span className="nova-share-track" aria-hidden="true"><span style={{width:r.c/s.total*100+"%"}}/></span></li>)}</ol>}
    </section>
   </div><TradeRates/>
  </div>}
 </div></AppShell>;
}
