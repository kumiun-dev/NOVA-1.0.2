"use client";
import { useEffect, useState } from "react";

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
  return <section className="nova-rates" aria-label="外贸汇率参考">
    <header>
      <div className="nova-rates-heading"><h2>外贸汇率参考</h2><span className="nova-rates-date">{data ? `${data.date} · 欧洲央行` : "欧洲央行每日参考汇率"}</span></div>
      <button type="button" disabled={loading} onClick={() => refresh(value => value + 1)} className="nova-control">{loading ? "更新中…" : "刷新汇率"}</button>
    </header>
    {error ? <p role="status" className="nova-rates-error">{error}{data ? " 当前保留上次成功获取的数据。" : ""}</p> : null}
    {data ? <div className="nova-rates-grid">{data.rates.map(rate => <div key={rate.pair} className="nova-rate"><p>{rate.label}</p><strong>{rate.value.toFixed(4)}</strong><small>{rate.pair}</small></div>)}</div> : <p className="nova-empty" role="status">{loading ? "正在获取最新公布数据…" : "暂时没有汇率数据"}</p>}
    <footer><span title="每 30 分钟检查更新；周末及节假日保留最近公布日。仅供参考，不是实时成交汇率。">每日参考价 · 30 分钟检查更新</span><a href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" target="_blank" rel="noreferrer">欧洲央行来源 ↗</a></footer>
  </section>;
}
