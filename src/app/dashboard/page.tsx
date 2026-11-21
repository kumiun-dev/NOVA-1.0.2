"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { COUNTRY_OPTIONS, INDUSTRY_OPTIONS } from "@/lib/sources/countries";
import type { Lead } from "@/lib/db";

function Dots({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <i
          key={i}
          className="block h-[5px] w-[5px] rounded-full"
          style={{ background: i < n ? "#6756D8" : "transparent", border: i < n ? "none" : "0.5px solid #C9C9C2" }}
        />
      ))}
    </span>
  );
}

function Mini({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg bg-white/75 px-2.5 py-2 ring-1 ring-[#EAE7F8]">
      <div className="mb-0.5 text-[9px] font-medium tracking-wide text-[#8179AA]">{label}</div>
      <div className={`truncate text-[11px] ${missing ? "text-[#B5B8B8]" : "text-ink"}`} title={missing ? undefined : value}>{missing ? "未获取" : value}</div>
    </div>
  );
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    function onAbort() { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}


export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pending, setPending] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [range, setRange] = useState("100");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [elapsed, setElapsed] = useState(0);
  const [f, setF] = useState({ country: "", industry: "", position: "", keyword: "" });
  const [showImport, setShowImport] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    fetch("/api/inbox").then((r) => r.json()).then((d) => {
      setPending((d.inbox || []).filter((x: any) => x.state === "待批准").length);
    });
  }, []);


  useEffect(() => { if(abortRef.current){stoppedRef.current=true;abortRef.current.abort();}setLeads([]);setSelected(new Set());setMsg(""); }, [f]);
  useEffect(() => { if(!busy)return;setElapsed(0);const t=setInterval(()=>setElapsed(v=>v+1),1000);return()=>clearInterval(t); },[busy]);

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(leads.length / pageSize));
  const visibleLeads = leads.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);

  const countries = useMemo(() => Array.from(new Set(leads.map((l) => l.country).filter(Boolean))), [leads]);

  const allSel = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggle(id: number) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  function toggleAll() {
    setSelected(allSel ? new Set() : new Set(leads.map((l) => l.id)));
  }

  async function addCandidates(ids: number[]) {
    const candidates = leads.filter((lead) => ids.includes(lead.id) && lead.id < 0 && !(lead as any).inCustomers);
    if (!candidates.length) { setMsg("请选择尚未加入客户库的企业"); return; }
    setBusy(true); setMsg("");
    let added = 0, skipped = 0;
    for (const lead of candidates) {
      const r = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...lead, source: lead.source || "获客筛选" }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) { added++; setLeads((prev) => prev.map((item) => item.id === lead.id ? { ...item, id: d.id, inCustomers: true } as any : item)); }
      else skipped++;
    }
    setBusy(false); setSelected(new Set()); setMsg(`已添加 ${added} 家客户${skipped ? `，${skipped} 家未能添加` : ""}`);
  }

  function downloadSelected(format: string) {
    if (!selected.size) return;
    window.location.href = `/api/leads/export?format=${format}&ids=${Array.from(selected).join(",")}`;
  }

  function download(format:string){const page=leads.slice(0,Math.min(500,Number(range)||100));if(!page.length){setMsg("本次没有可导出的企业");return;}window.location.href=`/api/leads/export?format=${format}&ids=${page.map(l=>l.id).join(",")}&limit=${range}`; }

  async function runImport() {
    if (!importCsv.trim()) { setMsg("请先粘贴 CSV 内容或上传文件"); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/leads/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv: importCsv }) });
      const d = await r.json();
      setMsg(`导入完成：新增 ${d.added ?? 0} 条 · 跳过重复 ${d.skipped ?? 0} 条`);
      setImportCsv("");
      setMsg(`导入完成：新增 ${d.added ?? 0} 条，已保存到客户库`);
    } catch {
      setMsg("导入失败，请检查 CSV 格式");
    } finally {
      setBusy(false);
    }
  }

  async function runCollect() {
    if (!f.keyword.trim()) { setMsg("请先输入关键词（公司 / 产品）"); return; }
    setLeads([]);setSelected(new Set());setPage(1);
    setBusy(true); setMsg("搜索中…");
    stoppedRef.current = false;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch("/api/collect/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: f.keyword, country: f.country, industry: f.industry, limit }),
        signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        setMsg(d.message || d.error || "搜索失败，请重试");
        return;
      }
      // 收集完成后分批展示，避免结果卡片瞬间全部出现。
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      const received = new Map<number, Lead>();
      let finalLeads: Lead[] | null = null;
      let skipped = 0;
      let streamError = "";
      function handleLine(line: string) {
        if (!line.trim()) return;
        let d: any;
        try { d = JSON.parse(line); } catch { return; }
        if (d.type === "start") setMsg("正在查找符合条件的企业…");
        else if (d.type === "lead" && d.lead) received.set(d.lead.id, d.lead);
        else if (d.type === "warning") setMsg(d.message || "正在搜索…");
        else if (d.type === "done") { finalLeads = Array.isArray(d.leads) ? d.leads : null; skipped = Number(d.skipped) || 0; }
        else if (d.type === "error") streamError = d.message || "搜索出错";
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) handleLine(line);
      }
      handleLine(buf);
      if (streamError) { setMsg(streamError); return; }
      const results = (finalLeads || Array.from(received.values())).sort((a, b) => {
        const infoScore = (lead: Lead) => [lead.company, lead.name, lead.email, lead.phone, lead.whatsapp, lead.website, lead.address, lead.industry].filter(Boolean).length;
        return infoScore(b) - infoScore(a) || Number((b as any).rank || 0) - Number((a as any).rank || 0) || b.completeness - a.completeness || a.company.localeCompare(b.company);
      });
      if (!results.length) { setMsg(`搜索完成：符合条件 0 家企业${skipped ? ` · 已在客户库 ${skipped} 家` : ""}`); return; }
      await wait(1500, ctrl.signal);
      let shown: Lead[] = [];
      while (shown.length < results.length && !stoppedRef.current) {
        const batchSize = 2 + Math.floor(Math.random() * 4);
        shown = [...shown, ...results.slice(shown.length, shown.length + batchSize)];
        setLeads(shown);
        if (shown.length < results.length) await wait(1000 + Math.floor(Math.random() * 501), ctrl.signal);
      }
      if (stoppedRef.current) { setMsg(`已停止显示，已显示 ${shown.length} / ${results.length} 家企业`); return; }
      const parts = [`符合条件 ${results.length} 家企业`];
      if (skipped) parts.push(`已在客户库 ${skipped} 家`);
      setMsg(`搜索完成：${parts.join(" · ")}`);

    } catch {
      setMsg(stoppedRef.current ? "已停止搜索" : "搜索失败，请检查网络后重试");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stopCollect() {
    stoppedRef.current = true;
    if (abortRef.current) abortRef.current.abort();
  }

  return (
    <AppShell pending={pending}>
      <div className="min-h-screen min-w-0 px-5 py-5 lg:px-7">
          <div className="mx-auto mb-5 w-full max-w-[1380px] rounded-xl border border-[#E8E5F1] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(49,42,93,0.04)] sm:px-5">
            <p className="mb-3 text-center text-[12px] font-medium text-[#687181]">获客筛选条件</p>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1.5fr_150px_auto]">
              <label className="block text-[11px] text-muted">国家<select className="mt-1 w-full" value={f.country} onChange={(e) => { setF({ ...f, country: e.target.value }); setPage(1); }}>
                <option value="">全部国家（可选）</option>
                {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                {countries.filter((c) => !COUNTRY_OPTIONS.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
              </select></label>
              <label className="block text-[11px] text-muted">目标客户行业<input list="industry-options" className="mt-1 w-full" placeholder="选择或输入，如 家具" value={f.industry} onChange={(e) => { setF({ ...f, industry: e.target.value }); setPage(1); }} />
                <datalist id="industry-options">{INDUSTRY_OPTIONS.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
              <label className="block text-[11px] text-muted">产品关键词<input className="mt-1 w-full" placeholder="产品或类别，如 铰链 / 宠物用品" value={f.keyword} onChange={(e) => { setF({ ...f, keyword: e.target.value }); setPage(1); }} /></label>
              <label className="block text-[11px] text-muted">最多搜索条数<select className="mt-1 w-full" value={limit} onChange={e => setLimit(Number(e.target.value))}>{[10, 50, 100].map(n => <option key={n} value={n}>{n} 条</option>)}</select></label>
              <div className="flex gap-2 xl:pb-0">
                <button className="min-w-[110px] flex-1 rounded-md bg-[#16181A] px-4 py-2.5 text-[12px] text-white disabled:opacity-50" disabled={busy} onClick={runCollect}>{busy ? "搜索中…" : "自动获客"}</button>
                {busy ? <button className="rounded-md border border-[#A32D2D] px-3 py-2 text-[12px] text-[#A32D2D] hover:bg-[#FBF0F0]" onClick={stopCollect}>停止</button> : <button className="rounded-md border border-line px-3 py-2 text-[12px] text-ink hover:bg-paper" onClick={() => { setF({ country: "", industry: "", position: "", keyword: "" }); setMsg(""); setPage(1); }}>清空</button>}
              </div>
            </div>
          </div>

          <div className="mb-2 flex items-center gap-3">
            <span className="text-[15px] font-medium text-ink">本次结果 {leads.length} 家企业</span>
            <span className="text-[12px] text-faint">按完整度排序</span>
            <span className="flex-1" />
            <button className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-ink hover:bg-paper" onClick={() => setShowImport((v) => !v)}>
              导入到我的客户库
            </button>
          </div>
          {(msg||busy)&&<div role="status" aria-live="polite" className="mb-4 rounded border bg-[#FFF9E8] p-3 text-sm">{busy?`查询中 · ${elapsed} 秒 · `:""}{msg}</div>}
          <p className="mb-4 text-[11px] text-faint">选中并添加后进入你的客户库。</p>

          {showImport ? (
            <div className="mb-4 rounded-lg border border-line bg-card p-4">
              <p className="mb-2 text-[12px] text-ink">粘贴 CSV 内容（首行表头：公司,姓名,职位,邮箱,WhatsApp,国家,行业,HS编码,来源）</p>
              <textarea
                className="mb-2 h-28 w-full font-mono text-[12px]"
                placeholder={"公司,姓名,职位,邮箱,WhatsApp,国家,行业\nAcme Trading,John Smith,采购经理,john@acme.com,+1 212 555 0100,美国,五金"}
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={busy} onClick={runImport}>
                  {busy ? "导入中…" : "批量导入"}
                </button>
                <span className="text-[11px] text-faint">{msg}</span>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleLeads.map((l) => {
              const n = l.completeness;
              const isSel = selected.has(l.id);
              const contact = l.name ? `${l.name}${l.position ? " · " + l.position : ""}` : l.position;
              return (
              <div key={l.id} className={`group relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border bg-card transition-all duration-200 ${isSel ? "border-[#7565E8] shadow-[0_10px_28px_rgba(103,86,216,0.18)] ring-2 ring-[#7565E8]/15" : "border-[#E8E5F1] shadow-[0_3px_10px_rgba(49,42,93,0.05)] hover:-translate-y-1 hover:border-[#C9C1F3] hover:shadow-[0_14px_30px_rgba(49,42,93,0.12)]"}`}>
                  <div className="h-1.5 bg-gradient-to-r from-[#5445C0] via-[#7969E7] to-[#B1A6FF]" />
                  <div className="px-3 pb-3 pt-3">
                    <div className="flex items-start gap-2.5">
                      <input type="checkbox" aria-label={`选择${l.company}`} className="mt-1 flex-none accent-[#6756D8]" checked={isSel} onChange={() => toggle(l.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          {l.country ? <span className="rounded-full bg-[#F1EFFF] px-2 py-0.5 text-[9px] font-medium text-[#5D4EC5]">{l.country}</span> : null}
                          {(l as any).inCustomers ? <span className="rounded-full bg-[#EAF6F0] px-2 py-0.5 text-[9px] font-medium text-[#28744E]">客户库已有</span> : <span className="rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[9px] font-medium text-[#7565C9]">待确认</span>}
                        </div>
                        <h3 className="line-clamp-2 text-[14px] font-semibold leading-snug text-ink" title={l.company}>{l.company}</h3>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-1 rounded-xl bg-[#F6F4FF] px-2.5 py-1.5">
                        <span className="text-[8px] font-medium text-[#8179AA]">资料完整度</span>
                        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#5748C3]"><Dots n={n} />{n}/3</span>
                      </div>
                    </div>
                    <div className="mt-2.5 flex min-h-7 flex-wrap items-center gap-1.5 border-b border-[#EFEDF6] pb-2.5">
                      {l.industry ? <span className="rounded-md bg-[#F5F6F8] px-2 py-1 text-[10px] text-[#687181]">{l.industry}</span> : null}
                      {l.hs_code ? <span className="rounded-md bg-[#F5F6F8] px-2 py-1 text-[10px] text-[#687181]">HS {l.hs_code}</span> : null}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                      {l.name ? <div className="col-span-2"><Mini label="联系人" value={contact} /></div> : null}
                      <Mini label="邮箱" value={l.email} missing={!l.email} />
                      <Mini label="电话" value={l.phone} missing={!l.phone} />
                      {l.whatsapp ? <Mini label="WhatsApp" value={l.whatsapp} /> : null}
                      {l.website ? <div className="col-span-2"><Mini label="官方网站" value={l.website} /></div> : null}
                      {l.address ? <div className="col-span-2"><Mini label="地址" value={l.address} /></div> : null}
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-2 border-t border-[#EFEDF6] bg-[#FBFAFF] px-3 py-2.5">
                    <span className="flex-1 text-[9px] text-faint">{(l as any).inCustomers ? "已保存到客户管理" : "确认后加入客户管理"}</span>
                    <button disabled={busy || Boolean((l as any).inCustomers)} onClick={() => addCandidates([l.id])} className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition-colors ${((l as any).inCustomers) ? "cursor-default border border-[#DCECE3] bg-[#EAF6F0] text-[#28744E]" : "bg-[#6756D8] text-white hover:bg-[#5545C4] disabled:opacity-60"}`}>{(l as any).inCustomers ? "已添加" : "＋ 添加客户"}</button>
                  </div>
                </div>
              );
            })}
          </div>
          {leads.length === 0 ? <p className="py-10 text-center text-[12px] text-faint">暂未找到匹配资料。可更换公司或产品关键词后再次搜索。</p> : null}

          {leads.length > 0 ? <div className="mt-4 flex flex-wrap items-center justify-center gap-2 rounded-lg border border-line bg-card px-4 py-3 text-[11px] text-muted">
            <span className="mr-2">每页 20 条 · 显示 {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, leads.length)} / {leads.length}</span>
            <button className="rounded-md border border-line px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button>
            <span className="min-w-20 text-center">第 {page} / {pageCount} 页</span>
            <button className="rounded-md border border-line px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页</button>
          </div> : null}

          <div className="mt-4 rounded-lg border border-line bg-card px-4 py-2.5">
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={allSel} onChange={toggleAll} />
              <span className="text-[12px] text-muted">已选 {selected.size} 条</span>
              <button className="rounded-md bg-[#16181A] px-3 py-1.5 text-[12px] text-white disabled:opacity-40" disabled={busy || selected.size === 0} onClick={() => addCandidates(Array.from(selected))}>添加所选客户</button>
              <button
                className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink hover:bg-paper disabled:opacity-40"
                disabled={selected.size === 0}
                onClick={() => downloadSelected("csv")}
              >
                下载已选 CSV
              </button>
              <button
                className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink hover:bg-paper disabled:opacity-40"
                disabled={selected.size === 0}
                onClick={() => downloadSelected("xlsx")}
              >
                下载已选 Excel
              </button>
              <span className="flex-1" />
              <span className="text-[11px] text-faint">批量（数量）</span>
              <select value={range} onChange={(e) => setRange(e.target.value)}>
                <option value="20">前 20 条</option>
                <option value="50">前 50 条</option>
                <option value="100">前 100 条</option>
                <option value="500">前 500 条</option>
              </select>
              <button className="rounded-md border border-line px-3 py-1.5 text-[12px] text-ink hover:bg-paper" onClick={() => download("csv")}>
                CSV
              </button>
              <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white" onClick={() => download("xlsx")}>
                Excel
              </button>
            </div>
          </div>
      </div>
    </AppShell>
  );
}
