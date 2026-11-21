"use client";
import { useEffect, useState } from "react";
import { NavIcon } from "./AppShell";

type Rates = { date: string; rates: { pair: string; label: string; value: number }[] };
export default function TradeRates() {
  const [data, setData] = useState<Rates | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/trade-rates", { signal: controller.signal }).then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setData(result); setError("");
    }).catch(() => { if (!controller.signal.aborted) setError("汇率暂时无法更新，请稍后重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    const timer = window.setTimeout(() => refresh(value => value + 1), 30 * 60 * 1000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [revision]);
  return <section className="mt-5 rounded-3xl border border-white/90 bg-[linear-gradient(120deg,#f0e7fb,#e7f2ed_55%,#f8e9df)] p-5 shadow-sm">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><NavIcon name="chart" />外贸汇率参考</h2><p className="mt-1 text-xs text-muted">{data ? `数据日期 ${data.date} · 欧洲央行每日公布` : "欧洲央行每日参考汇率"}</p></div>
      <button type="button" disabled={loading} onClick={() => refresh(value => value + 1)} className="rounded-full border border-white bg-white/60 px-3 py-1.5 text-xs text-[#7054C8] disabled:opacity-50">{loading ? "更新中…" : "刷新"}</button>
    </header>
    {error ? <p role="status" className="mb-3 text-xs text-[#9C513C]">{error}{data ? " 当前保留上次成功获取的数据。" : ""}</p> : null}
    {data ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{data.rates.map((rate, index) => <div key={rate.pair} className="rounded-2xl border border-white bg-white/75 p-4"><p className="text-xs text-muted">{rate.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums" style={{ color: ["#7054C8","#57868A","#B0845F","#A17D99"][index] }}>{rate.value.toFixed(4)}</p><p className="mt-2 text-[11px] text-muted">{rate.pair}</p></div>)}</div> : <p className="py-4 text-xs text-muted">{loading ? "正在获取最新公布数据…" : "暂时没有汇率数据"}</p>}
    <footer className="mt-4 flex flex-wrap justify-between gap-2 text-[11px] text-muted"><span>每 30 分钟检查更新 · 周末及节假日显示最近公布日 · 参考汇率</span><a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noreferrer" className="text-[#7054C8] hover:underline">查看官方来源 ↗</a></footer>
  </section>;
}
