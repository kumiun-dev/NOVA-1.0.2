"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Country = { code: number; name: string; iso2: string; iso3: string; nameZh?: string };
type CustomsRow = { year: string; country: string; countryIso2?: string; flag: string; partner: string; product: string; hsCode: string; flow: string; tradeValue: number | null; netWeight: number | null };
type Result = { rows?: CustomsRow[]; error?: string; notice?: string; product?: string; query?: string; hsCode?: string; capped?: boolean };

const inputClass = "w-full rounded-lg border border-[#E5E1F4] bg-white px-3 py-2.5 text-[13px] text-[#24322B] outline-none focus:border-[#7167C8] focus:ring-2 focus:ring-[#7167C8]/10";
const formatMoney = (value: number | null) => value == null ? "未公布" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
function toChineseCountry(country: Country) {
  if (!country.iso2) return country.name;
  try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(country.iso2) || country.name; }
  catch { return country.name; }
}
function getCountryFlag(row: CustomsRow) {
  const iso2 = row.countryIso2 || (/^[A-Za-z]{2}$/.test(row.flag) ? row.flag : "");
  return /^[A-Za-z]{2}$/.test(iso2) ? iso2.toLowerCase() : "";
}
function toChineseResultCountry(row: CustomsRow) {
  if (!row.countryIso2) return row.country;
  try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(row.countryIso2.toUpperCase()) || row.country; }
  catch { return row.country; }
}

export default function CustomsDataPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [product, setProduct] = useState("");
  const [flow, setFlow] = useState("M");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CustomsRow | null>(null);
  const pageSize = 12;

  useEffect(() => {
    fetch("/api/customs-data").then((r) => r.json()).then((d) => setCountries((d.countries || []).map((c: Country) => ({ ...c, nameZh: toChineseCountry(c) })))).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selected]);

  const rows = result?.rows || [];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const selectedCountry = countries.find((item) => String(item.code) === country);
  const filteredCountries = countries.filter((item) => `${item.nameZh} ${item.name} ${item.iso3}`.toLocaleLowerCase().includes(countrySearch.trim().toLocaleLowerCase()));

  async function search(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    setPage(1);
    if (!company.trim() && !product.trim()) {
      setResult({ error: "请至少输入公司名称或产品关键词；只选择国家不能筛选。" });
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/customs-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ country, company, product, flow }) });
      const data = await response.json();
      setResult(response.ok ? data : { ...data, error: data.error || "查询失败" });
    } catch {
      setResult({ error: "暂时无法连接公开数据源，请稍后重试。" });
    } finally { setBusy(false); }
  }

  return <AppShell><div className="min-h-[calc(100vh-48px)] bg-[#F8F7FC] px-5 py-7 lg:px-8"><div className="mx-auto max-w-[1180px]">
    <header className="mb-6"><p className="text-[10px] font-semibold tracking-[0.16em] text-[#7167C8]">TRADE RECORDS</p><h1 className="mt-1 text-[22px] font-semibold text-[#24322B]">海关数据</h1><p className="mt-1.5 text-[12px] text-[#89958F]">优先显示最新已发布的年度统计；不同国家的最新年份可能不同。</p></header>

    <form onSubmit={search} className="mb-5 rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="relative text-[12px] font-medium text-[#53635B]">国家 / 地区（可选）<div className="relative mt-1.5"><input role="combobox" aria-label="搜索国家或地区" aria-expanded={countryOpen} aria-controls="customs-country-options" autoComplete="off" className={`${inputClass} pr-9`} value={countryOpen ? countrySearch : selectedCountry?.nameZh || "全部国家"} placeholder="搜索国家（中文、英文或代码）" onFocus={() => { setCountryOpen(true); setCountrySearch(""); }} onChange={(e) => { setCountrySearch(e.target.value); setCountryOpen(true); }} onBlur={() => setTimeout(() => setCountryOpen(false), 120)} /><span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#7C8881]">⌄</span>{countryOpen ? <div id="customs-country-options" role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-[#E5E1F4] bg-white p-1.5 shadow-xl"><button type="button" role="option" aria-selected={!country} onMouseDown={(e) => e.preventDefault()} onClick={() => { setCountry(""); setCountrySearch(""); setCountryOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-[12px] hover:bg-[#F5F3FF] ${!country ? "bg-[#F0EEFF] font-semibold text-[#5548C8]" : "text-[#53635B]"}`}>全部国家</button>{filteredCountries.map((item) => <button type="button" role="option" aria-selected={country === String(item.code)} key={`${item.code}-${item.iso3}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { setCountry(String(item.code)); setCountrySearch(""); setCountryOpen(false); }} className={`w-full rounded-lg px-3 py-2 text-left text-[12px] hover:bg-[#F5F3FF] ${country === String(item.code) ? "bg-[#F0EEFF] font-semibold text-[#5548C8]" : "text-[#53635B]"}`}>{item.nameZh}{item.iso3 ? ` (${item.iso3})` : ""}</button>)}{filteredCountries.length === 0 ? <p className="px-3 py-4 text-center text-[11px] text-[#9AA49F]">没有匹配的国家/地区</p> : null}</div> : null}</div></div>
        <label className="text-[12px] font-medium text-[#53635B]">贸易方向<select className={`${inputClass} mt-1.5`} value={flow} onChange={(e) => setFlow(e.target.value)}><option value="M">进口</option><option value="X">出口</option></select></label>
        <label className="text-[12px] font-medium text-[#53635B]">公司名称（公司级记录需使用提单查询站点）<input className={`${inputClass} mt-1.5`} value={company} onChange={(e) => setCompany(e.target.value)} placeholder="输入公司名称" /></label>
        <label className="text-[12px] font-medium text-[#53635B]">产品关键词 / HS 编码<input className={`${inputClass} mt-1.5`} value={product} onChange={(e) => setProduct(e.target.value)} placeholder="英文产品名或 HS 编码，例如 furniture / 940360" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-lg bg-[#5548C8] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#473BB7] disabled:opacity-50">{busy ? "正在查询…" : "查询海关数据"}</button><span className="text-[11px] text-[#89958F]">必须填写公司名或产品词；仅选国家不会启动搜索。</span></div>
    </form>


    {result?.error ? <div role="alert" className="mb-4 rounded-xl border border-[#F1D2D0] bg-[#FFF8F7] px-4 py-3 text-[12px] text-[#A32D2D]">{result.error}</div> : null}
    {result?.notice ? <section className="mb-4 flex items-start gap-3 rounded-xl border border-[#E5E1F4] bg-white p-4 text-[12px] leading-5 text-[#758079]"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F0EEFF] text-[#6255D3]">i</span><p>{result.notice}</p></section> : null}
    {rows.length > 0 ? <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><h2 className="text-[16px] font-semibold text-[#34423B]">{result?.query || result?.product?.replace(/^\d+\s*-\s*/, "")}</h2><p className="mt-1 text-[11px] text-[#89958F]">HS 编码 {result?.hsCode} · {rows.length} 条记录</p></div><span className="rounded-full bg-[#F0EEFF] px-3 py-1.5 text-[11px] font-medium text-[#5548C8]">第 {page} / {pageCount} 页</span></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleRows.map((row, index) => <button type="button" key={`${row.year}-${row.country}-${(page - 1) * pageSize + index}`} onClick={() => setSelected(row)} className="group relative overflow-hidden rounded-2xl border border-[#E8E5F2] bg-white text-left shadow-[0_4px_16px_rgba(49,42,93,0.06)] transition duration-200 hover:-translate-y-1 hover:border-[#C8C1F0] hover:shadow-[0_14px_30px_rgba(49,42,93,0.12)] focus:outline-none focus:ring-2 focus:ring-[#7167C8]/30">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#5548C8] via-[#8D83E6] to-[#D6D1FF]" />
        <div className="relative overflow-hidden bg-gradient-to-br from-[#FBFAFF] via-white to-[#F5F3FF] px-4 pb-3 pt-4"><div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border-[16px] border-[#F0EEFF]/80" />
          <div className="relative flex items-center gap-3"><span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white bg-white text-[15px] font-semibold text-[#6255D3] shadow-sm" title={toChineseResultCountry(row)}>{getCountryFlag(row) || "🌐"}{getCountryFlag(row) ? <img src={`/flags/${getCountryFlag(row)}.svg`} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span><div className="min-w-0 flex-1"><p className="truncate text-[15px] font-semibold text-[#27352E]">{toChineseResultCountry(row)}</p><p className="mt-0.5 text-[11px] text-[#89958F]">{row.year} 年 <span className="mx-1 text-[#D1CCEA]">·</span> {row.flow}</p></div><span className="shrink-0 rounded-full bg-[#F0EEFF] px-2.5 py-1 text-[10px] font-semibold text-[#5548C8]">HS {row.hsCode}</span></div>
        </div>
        <div className="px-4 pb-4 pt-3"><div className="rounded-xl bg-[#F8F7FC] px-3.5 py-3"><div className="flex items-center justify-between"><span className="text-[10px] font-medium text-[#89958F]">商品贸易额 <span className="text-[#B0AAA0]">· USD</span></span><svg aria-hidden="true" viewBox="0 0 32 20" className="h-5 w-8 text-[#8B82D6]" fill="none"><path d="M2 16 10 10l5 3 7-8 8 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M24 4h6v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div><p className="mt-1 text-[20px] font-semibold tracking-tight text-[#5548C8]">{formatMoney(row.tradeValue)}</p></div><div className="mt-2 flex items-center justify-between text-[10px] text-[#8A83C9]"><span>{row.flow} · {row.year} 年统计</span><span className="inline-flex items-center gap-1 font-medium group-hover:text-[#5548C8]">查看详情 <span aria-hidden="true">↗</span></span></div></div>
      </button>)}</div>
      {pageCount > 1 ? <nav aria-label="海关数据分页" className="mt-6 flex flex-wrap items-center justify-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage(1)} className="rounded-lg border border-[#E5E1F4] bg-white px-3 py-2 text-[12px] text-[#53635B] disabled:opacity-40">首页</button><button type="button" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-[#E5E1F4] bg-white px-3 py-2 text-[12px] text-[#53635B] disabled:opacity-40">上一页</button><span className="px-2 text-[12px] text-[#758079]">每页 12 条 · {page} / {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} className="rounded-lg border border-[#E5E1F4] bg-white px-3 py-2 text-[12px] text-[#53635B] disabled:opacity-40">下一页</button><button type="button" disabled={page === pageCount} onClick={() => setPage(pageCount)} className="rounded-lg border border-[#E5E1F4] bg-white px-3 py-2 text-[12px] text-[#53635B] disabled:opacity-40">末页</button></nav> : null}
    </section> : null}
    {result && !result.error && !result.notice && rows.length === 0 ? <div className="rounded-2xl border border-dashed border-[#DCD7F1] bg-white px-6 py-12 text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3F1FF] text-2xl">⌕</span><p className="mt-3 text-[14px] font-semibold text-[#34423B]">没有找到对应的记录</p><p className="mt-1 text-[12px] text-[#89958F]">试试更具体的英文产品名或 2–6 位 HS 编码。</p></div> : null}
    {selected ? <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }} className="fixed inset-0 z-[80] flex items-center justify-center bg-[#17211D]/40 p-4 backdrop-blur-[2px]"><section role="dialog" aria-modal="true" aria-labelledby="customs-detail-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#E5E1F4] bg-white shadow-2xl"><div className="relative bg-gradient-to-br from-[#F3F1FF] via-white to-[#F7F6FF] px-5 py-5"><button type="button" onClick={() => setSelected(null)} aria-label="关闭详情" className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-[#E5E1F4] bg-white text-[#657169] hover:text-[#5548C8]">×</button><div className="flex items-center gap-3"><span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white text-[15px] font-semibold text-[#6255D3] shadow-sm">{getCountryFlag(selected) || "🌐"}{getCountryFlag(selected) ? <img src={`/flags/${getCountryFlag(selected)}.svg`} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}</span><div><h2 id="customs-detail-title" className="pr-10 text-[17px] font-semibold text-[#27352E]">{toChineseResultCountry(selected)} · {selected.flow}</h2><p className="mt-1 text-[12px] text-[#89958F]">{selected.year} 年海关统计</p></div></div></div><div className="space-y-4 px-5 py-5"><div><p className="text-[10px] font-medium text-[#9AA49F]">商品</p><p className="mt-1 text-[13px] leading-5 text-[#34423B]">{selected.product}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#F8F7FC] p-3"><p className="text-[10px] text-[#89958F]">HS 海关编码</p><p className="mt-1 text-[15px] font-semibold text-[#5548C8]">{selected.hsCode}</p></div><div className="rounded-xl bg-[#F8F7FC] p-3"><p className="text-[10px] text-[#89958F]">贸易金额</p><p className="mt-1 text-[14px] font-semibold text-[#34423B]">{formatMoney(selected.tradeValue)}</p></div><div className="rounded-xl bg-[#F8F7FC] p-3"><p className="text-[10px] text-[#89958F]">净重</p><p className="mt-1 text-[13px] font-medium text-[#34423B]">{selected.netWeight == null ? "未公布" : `${Number(selected.netWeight).toLocaleString()} kg`}</p></div><div className="rounded-xl bg-[#F8F7FC] p-3"><p className="text-[10px] text-[#89958F]">贸易伙伴</p><p className="mt-1 text-[13px] font-medium text-[#34423B]">{selected.partner}</p></div></div><button type="button" onClick={() => setSelected(null)} className="w-full rounded-lg bg-[#5548C8] py-2.5 text-[12px] font-medium text-white hover:bg-[#473BB7]">返回海关数据</button></div></section></div> : null}
  </div></div></AppShell>;
}
