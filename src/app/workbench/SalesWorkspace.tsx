"use client";

import { useEffect, useState, type ReactNode } from "react";
import { NavIcon } from "@/components/AppShell";
import { formatSalesAmount, SalesMetric } from "@/components/SalesMetrics";
import { SALES_STAGES } from "@/lib/stages";
import { localDay, SALES_PERIODS, type SalesLead, type SalesPeriod, type SalesSnapshot } from "@/lib/sales-overview";

const PHASES = [
  { label: "新线索", funnel: "全部线索", statuses: ["线索"], color: "#6267CA", tint: "#EEEDFF" },
  { label: "沟通中", funnel: "已沟通", statuses: ["已联系", "谈判中"], color: "#2778AB", tint: "#E8F5FC" },
  { label: "已报价", funnel: "已报价", statuses: ["已报价"], color: "#7652C8", tint: "#F3EAFC" },
  { label: "样品中", funnel: "样品中及之后", statuses: ["样品中"], color: "#A26325", tint: "#FFF1E0" },
  { label: "成交", funnel: "成交", statuses: ["成交"], color: "#237357", tint: "#E8F6EF" },
];
const FILTERS = { all: "全部", intent: "高意向", late: "超期" } as const;
const CARDS_PER_COLUMN = 3;
const FUNNEL_COLORS = ["#8458E1", "#754BCC", "#673CB8", "#5A329F", "#4A2886"];
type Filter = keyof typeof FILTERS;
type TrendMetric = "inquiries" | "leads";
const panel = "min-w-0 rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5";
const group = "inline-flex flex-wrap gap-1 rounded-xl bg-[#F3F1F8] p-1";
const pill = (selected: boolean) => `rounded-lg px-3 py-1.5 text-xs font-medium ${selected ? "bg-white text-[#5945BF] shadow-sm" : "text-muted hover:text-ink"}`;

function overdue(lead: SalesLead, date: string) {
  return Boolean(lead.next_at && lead.next_at.slice(0, 10) < date && !["成交", "流失"].includes(lead.status));
}

function ChartPanel({ title, icon, action, children, className = "" }: { title: string; icon: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`${panel} ${className}`} aria-label={title}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="text-[#6853C8]"><NavIcon name={icon} /></span>{title}</h3>
      {action}
    </div>
    {children}
  </section>;
}

function Trend({ snapshot, metric }: { snapshot: SalesSnapshot; metric: TrendMetric }) {
  const records = snapshot.trend;
  const total = records.reduce((sum, day) => sum + day[metric], 0);
  const peak = Math.max(1, ...records.map((day) => day[metric]));
  if (total === 0) return <p className="rounded-xl bg-[#F8F7FC] py-8 text-center text-xs text-muted">所选日期暂无记录</p>;
  const points = records.map((day, index) => ({
    ...day, x: records.length === 1 ? 150 : 6 + index / (records.length - 1) * 288, y: 103 - day[metric] / peak * 90,
  }));
  const coords = points.map(({ x, y }) => `${x},${y}`).join(" ");
  return <>
    <p className="mb-1 text-xs text-muted">合计 <strong className="text-lg text-ink">{total}</strong> 条</p>
    <svg viewBox="0 0 300 112" role="img" aria-label={`${metric === "inquiries" ? "新来信" : "新增线索"}趋势，合计 ${total} 条`} className="h-[122px] w-full">
      <path d="M0 13h300M0 43h300M0 73h300M0 103h300" stroke="#ECE8F5" fill="none" />
      {points.length > 1 ? <>
        <polygon points={`${points[0].x},103 ${coords} ${points.at(-1)!.x},103`} fill="#EFE9FB" />
        <polyline points={coords} fill="none" stroke="#7356D6" strokeWidth="2.4" strokeLinejoin="round" />
      </> : null}
      {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r={records.length > 14 ? 2 : 3.5} fill="#7356D6"><title>{point.date} · {point[metric]} 条</title></circle>)}
    </svg>
    <div className="flex justify-between text-[11px] tabular-nums text-muted"><span>{snapshot.from}</span>{snapshot.from !== snapshot.to ? <span>{snapshot.to}</span> : null}</div>
  </>;
}

function Funnel({ leads }: { leads: SalesLead[] }) {
  const counts = PHASES.map((phase) => leads.filter((lead) => phase.statuses.includes(lead.status)).length);
  const total = leads.length;
  return <div>
    <ol aria-label="询盘转化阶段" className="space-y-1">
      {PHASES.map((phase, index) => {
        const value = index === 0 ? total : counts.slice(index).reduce((sum, count) => sum + count, 0);
        const percent = total ? Math.round(value / total * 100) : 0;
        return <li key={phase.label} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2">
          <div className={`relative mx-auto flex min-h-8 max-w-full items-center justify-between gap-1 px-[10%] text-[11px] font-semibold ${value ? "text-white" : "text-[#634D91]"}`}
            style={{
              width: `max(6.25rem, ${100 - index * 10}%)`,
              background: value ? `linear-gradient(120deg,${FUNNEL_COLORS[index]},${FUNNEL_COLORS[Math.min(index + 1, FUNNEL_COLORS.length - 1)]})` : "#F1EBF9",
              clipPath: "polygon(0 0, 100% 0, 95% 100%, 5% 100%)",
            }}>
            <span className="min-w-0 leading-tight">{phase.funnel}</span>
            <strong className="shrink-0 tabular-nums">{value}</strong>
          </div>
          <span className="text-right text-xs font-medium tabular-nums text-muted">{percent}%</span>
        </li>;
      })}
    </ol>
    <p className="mt-3 text-[11px] text-muted">{total ? "按客户当前阶段累计" : "所选日期暂无线索"}</p>
  </div>;
}

function Countries({ leads }: { leads: SalesLead[] }) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const country = lead.country?.trim() || "未填写";
    counts.set(country, (counts.get(country) || 0) + 1);
  }
  if (!leads.length) return <p className="text-sm text-muted">所选日期暂无线索</p>;
  const countries = Array.from(counts).sort((a, b) => b[1] - a[1]);
  const top = countries.slice(0, 5);
  const rest = countries.slice(5).reduce((sum, [, count]) => sum + count, 0);
  if (rest) top.push(["其他地区", rest]);
  let offset = 0;
  const slices = top.map(([name, count], index) => {
    const color = ["#7253D0", "#5287D4", "#36A08A", "#D69A49", "#AB6DAA", "#C9C2DB"][index];
    const from = offset / leads.length * 100;
    offset += count;
    return { name, count, color, gradient: `${color} ${from}% ${offset / leads.length * 100}%` };
  });
  return <div className="flex flex-wrap items-center gap-4">
    <div aria-hidden="true" className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${slices.map((slice) => slice.gradient).join(",")})` }}>
      <div className="grid h-[66px] w-[66px] place-content-center rounded-full bg-white text-center"><strong className="text-lg text-ink">{leads.length}</strong><span className="text-[10px] text-muted">线索</span></div>
    </div>
    <ul className="min-w-[128px] flex-1 space-y-1.5 text-xs">
      {slices.map(({ name, count, color }, index) => <li key={index} className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><span className="min-w-0 flex-1 truncate text-muted" title={name}>{name}</span>
        <span className="shrink-0 tabular-nums text-ink">{count} · {Math.round(count / leads.length * 100)}%</span>
      </li>)}
    </ul>
  </div>;
}

export default function SalesWorkspace({ pendingQueue }: { pendingQueue: ReactNode }) {
  const [period, setPeriod] = useState<SalesPeriod>("recent");
  const [filter, setFilter] = useState<Filter>("all");
  const [metric, setMetric] = useState<TrendMetric>("inquiries");
  const [view, setView] = useState<"board" | "list">("board");
  const [data, setData] = useState<SalesSnapshot | null>(null);
  const [listPage, setListPage] = useState(1);
  const [revision, reload] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [columnPages, setColumnPages] = useState<Record<string, number>>({});

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workbench?period=${period}&date=${localDay()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const snapshot = await response.json();
        if (!response.ok) throw new Error(snapshot.error || "加载销售数据失败。");
        if (!controller.signal.aborted) setData(snapshot);
      }).catch((error: Error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [period, revision]);

  async function changeStage(lead: SalesLead, status: string) {
    setBusy(lead.id);
    setError("");
    try {
      const response = await fetch("/api/workbench", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, previous: lead.status, status }) });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "更新阶段失败。");
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "更新阶段失败。");
    } finally {
      setBusy(null);
      reload((value) => value + 1);
    }
  }

  const leads = data?.leads || [];
  const scoped = data ? leads.filter((lead) => lead.acquired_at >= data.from && lead.acquired_at <= data.to) : [];
  const visible = leads.filter((lead) => filter === "all" || (filter === "intent" ? lead.interested && !["成交", "流失"].includes(lead.status) : overdue(lead, data!.to)));
  const pageCount = Math.max(1, Math.ceil(visible.length / 12));
  const page = Math.min(listPage, pageCount);
  const chooseStage = (lead: SalesLead) => (
    <select aria-label={`${lead.company}的销售阶段`} value={lead.status} disabled={busy !== null}
      className="max-w-full rounded-lg border border-[#E5DFF0] text-[11px] text-ink focus:border-[#8770D8]"
      onChange={(event) => void changeStage(lead, event.target.value)}>
      {!SALES_STAGES.some((stage) => stage === lead.status) ? <option value={lead.status}>{lead.status || "未设置"}</option> : null}
      {SALES_STAGES.map((stage) => <option key={stage}>{stage}</option>)}
    </select>
  );

  return <section aria-labelledby="sales-heading" className="mb-8">
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 id="sales-heading" className="text-[24px] font-semibold tracking-tight text-ink">跟进与数据分析</h1>
        {data ? <p className="mt-1 text-xs text-muted">{data.from} 至 {data.to}</p> : null}</div>
      <div className={group} aria-label="数据统计日期">
        {(Object.entries(SALES_PERIODS) as [SalesPeriod, string][]).map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} className={pill(period === key)}
          onClick={() => { if (period !== key) { setError(""); setListPage(1); setColumnPages({}); setPeriod(key); } }}>{label}</button>)}
      </div>
    </header>
    {error ? <p role="alert" className="mb-4 rounded-xl bg-[#FFF1EE] px-4 py-3 text-sm text-[#9B3127]">{error}</p> : null}
    {data ? <>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SalesMetric label="今日待跟进" value={data.followupToday} hint={`另有 ${data.overdue} 位客户超期`} icon="workflow" tone="violet" />
        <SalesMetric label="高意向客户" value={data.interested} hint="最新来信分类为有意向或要报价" icon="users" tone="blue" />
        <SalesMetric label="待回复消息" value={data.pending} hint="当前待处理来信" icon="chat" tone="amber" />
        <SalesMetric label="本月已接受报价额" value={data.acceptedByCurrency.length ? data.acceptedByCurrency.map(({ currency, total }) =>
          <div className="text-base" key={currency}>{formatSalesAmount(total, currency)}</div>) : "—"} hint="按确认日期和币种统计" icon="calculator" tone="green" />
      </div>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_330px]">
        <section className={panel} aria-label="客户跟进看板">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">客户跟进看板</h2>
            <a href="/customers?add=1" className="rounded-lg bg-[#5947C9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4937B6]">新建客户</a>
          </div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className={group} aria-label="客户筛选">
              {(Object.entries(FILTERS) as [Filter, string][]).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} className={pill(filter === key)}
                onClick={() => { setFilter(key); setListPage(1); setColumnPages({}); }}>{label}</button>)}
            </div>
            <div className={group} aria-label="显示方式">
              <button type="button" aria-pressed={view === "board"} className={pill(view === "board")} onClick={() => setView("board")}>看板</button>
              <button type="button" aria-pressed={view === "list"} className={pill(view === "list")} onClick={() => setView("list")}>列表</button>
            </div>
          </div>
          {view === "board" ? <div className="overflow-x-auto pb-1">
            <div className="grid min-w-[680px] grid-cols-5 gap-2">
              {PHASES.map((phase) => {
                const cards = visible.filter((lead) => phase.statuses.includes(lead.status));
                const lastPage = Math.max(1, Math.ceil(cards.length / CARDS_PER_COLUMN));
                const columnPage = Math.min(columnPages[phase.label] ?? 1, lastPage);
                const firstCard = (columnPage - 1) * CARDS_PER_COLUMN;
                const turnPage = (next: number) => setColumnPages((current) => ({ ...current, [phase.label]: next }));
                return <section key={phase.label} aria-label={phase.label} className="flex min-w-0 flex-col rounded-xl border border-[#ECE8F3] bg-[#FAF9FC]">
                  <h3 className="rounded-t-xl px-3 py-2.5 text-xs font-semibold" style={{ color: phase.color, background: phase.tint }}>{phase.label} <span className="ml-1 tabular-nums">{cards.length}</span></h3>
                  <ul className="space-y-2 p-2">
                    {cards.slice(firstCard, firstCard + CARDS_PER_COLUMN).map((lead) => <li key={lead.id} className="rounded-lg border border-[#EAE6F1] bg-white p-2.5">
                      <a href={`/customers/${lead.id}`} className="block truncate text-xs font-semibold text-ink hover:text-[#6049CB]" title={lead.company}>{lead.company}</a>
                      <p className="mb-2 mt-1 truncate text-[11px] text-muted">{[lead.country, lead.industry].filter(Boolean).join(" · ") || "地区待填写"}</p>
                      {chooseStage(lead)}
                      {overdue(lead, data.to) ? <p className="mt-1 text-[10px] text-[#A23B2C]">跟进超期</p> : null}
                    </li>)}
                    {!cards.length ? <li className="p-3 text-center text-[11px] text-muted">暂无客户</li> : null}
                  </ul>
                  {lastPage > 1 ? <nav aria-label={`${phase.label}分页`} className="mt-auto flex items-center justify-between gap-1 border-t border-[#ECE8F3] px-2 py-1.5">
                    <button type="button" className="h-7 w-7 rounded-md text-base leading-none text-[#5945BF] hover:bg-white disabled:text-faint disabled:opacity-50"
                      aria-label={`${phase.label}上一页`} disabled={columnPage === 1} onClick={() => turnPage(columnPage - 1)}>‹</button>
                    <span aria-live="polite" className="text-[11px] tabular-nums text-muted">{columnPage} / {lastPage}</span>
                    <button type="button" className="h-7 w-7 rounded-md text-base leading-none text-[#5945BF] hover:bg-white disabled:text-faint disabled:opacity-50"
                      aria-label={`${phase.label}下一页`} disabled={columnPage === lastPage} onClick={() => turnPage(columnPage + 1)}>›</button>
                  </nav> : null}
                </section>;
              })}
            </div>
            {visible.some((lead) => !PHASES.some((phase) => phase.statuses.includes(lead.status))) ? <button type="button" className="mt-3 text-xs text-[#6049CB] hover:underline" onClick={() => setView("list")}>在列表中查看其它阶段</button> : null}
          </div> : <div className="overflow-x-auto">
            <table className="w-full min-w-[470px] text-left text-xs">
              <thead className="border-b border-line text-muted"><tr><th className="pb-2">客户</th><th className="pb-2">国家与地区</th><th className="pb-2">下次跟进</th><th className="pb-2">阶段</th></tr></thead>
              <tbody>{visible.slice((page - 1) * 12, page * 12).map((lead) => <tr key={lead.id} className="border-b border-line last:border-0">
                <td className="py-2 pr-2"><a href={`/customers/${lead.id}`} className="font-medium text-[#5947C9] hover:underline">{lead.company}</a></td>
                <td className="py-2 pr-2">{lead.country || "—"}</td><td className="py-2 pr-2">{lead.next_at || "—"}</td>
                <td className="py-2">{chooseStage(lead)}</td>
              </tr>)}</tbody>
            </table>
            {visible.length === 0 ? <p className="py-6 text-center text-sm text-muted">没有匹配的客户</p> : null}
            {pageCount > 1 ? <div className="mt-3 flex justify-end gap-3 text-xs text-muted">
              <button disabled={page <= 1} onClick={() => setListPage(page - 1)}>上一页</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setListPage(page + 1)}>下一页</button>
            </div> : null}
          </div>}
        </section>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-1">
          <ChartPanel title="询盘趋势分析" icon="chart" action={<select aria-label="趋势指标" value={metric} onChange={(event) => setMetric(event.target.value as TrendMetric)}><option value="inquiries">新来信</option><option value="leads">新增线索</option></select>}>
            <Trend snapshot={data} metric={metric} />
          </ChartPanel>
          <ChartPanel title="询盘转化漏斗" icon="workflow"><Funnel leads={scoped} /></ChartPanel>
        </div>
      </div>
    </> : error ? null : <p role="status" className={panel}>正在加载销售数据…</p>}
    <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_330px]">
      {pendingQueue}
      <ChartPanel title="客户地区分布" icon="users" className="min-h-[200px]"><Countries leads={scoped} /></ChartPanel>
    </div>
  </section>;
}
