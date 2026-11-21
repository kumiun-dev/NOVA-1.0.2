"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { formatSalesAmount, SalesMetric } from "@/components/SalesMetrics";
import type { Lead } from "@/lib/db";
import { APPROVAL_LABELS, canSendQuote, quoteItems, type Quote, type QuoteCounts, type QuoteProduct } from "@/lib/quote-assistant";
import QuoteAssistant from "./QuoteAssistant";

type ApprovalEntry = {
  id: number; accountId: string; submitter: string; quote_no: string; company: string | null;
  total: number; currency: string; items: string;
};
const blankItem = { name: "", spec: "", qty: "", unit: "", productId: "" };

const STATUS_COLOR: Record<string, string> = {
  草稿: "#9A9E9F",
  已发: "#B07A2A",
  已查看: "#4A6FA5",
  已接受: "#2E7D5B",
};

export default function QuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [counts, setCounts] = useState<QuoteCounts | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [products, setProducts] = useState<QuoteProduct[]>([]);
  const [pending, setPending] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validUntil, setValidUntil] = useState("");
  const [items, setItems] = useState([blankItem]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [approvalEntries, setApprovalEntries] = useState<ApprovalEntry[]>([]);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [tip, setTip] = useState("");
  const [senderChoice, setSenderChoice] = useState<{ quoteId: number; accounts: { id: string; label: string }[] } | null>(null);
  const [senderId, setSenderId] = useState("");
  const [sendingMail, setSendingMail] = useState(false);

  async function load() {
    try {
      const response = await fetch("/api/quotes", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法加载报价单。");
      setQuotes(data.quotes);
      setCounts(data.counts);
    } catch (error) { setTip(error instanceof Error ? error.message : "无法加载报价单。"); }
  }

  async function loadApprovals() {
    try {
      const response = await fetch("/api/quotes/approval", { cache: "no-store" });
      const data = await response.json();
      if (response.ok) setApprovalEntries(data.pending);
    } catch { setTip("暂时无法加载审批队列。"); }
  }
  useEffect(() => {
    void load();
    void loadApprovals();
    fetch("/api/inbox").then((r) => r.json()).then((d) => setPending((d.inbox || []).filter((x: { state: string }) => x.state === "待批准").length)).catch(() => {});
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads || [])).catch(() => {});
    fetch("/api/products").then((r) => r.json()).then((d) => setProducts(d.products || [])).catch(() => {});
  }, []);

  function setItem(i: number, k: keyof typeof blankItem, v: string) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  }

  function selectProduct(index: number, productId: string) {
    const product = products.find((candidate) => candidate.id === Number(productId));
    setItems((previous) => previous.map((item, position) => {
      if (position !== index) return item;
      return product ? { name: product.name, spec: product.specs, qty: String(product.moq), productId,
        unit: product.cost_currency === currency && product.default_price > 0 ? String(product.default_price) : "" } : { ...item, productId: "" };
    }));
  }

  const rows = items
      .filter((it) => it.name.trim())
      .map((it) => {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.unit) || 0;
        return { name: it.name.trim(), spec: it.spec, qty, unit, amount: Math.round(qty * unit * 100) / 100, product_id: Number(it.productId) || undefined };
      });
  const currentQuote = quotes.find((quote) => quote.id === selected);

  function openDraft(quote?: Quote) {
    setShowAdd(true);
    setEditing(quote?.id ?? null);
    setSelected(quote?.id ?? null);
    setLeadId(quote?.lead_id ? String(quote.lead_id) : "");
    setCurrency(quote?.currency || "USD");
    setValidUntil(quote?.valid_until || "");
    const saved = quote ? quoteItems(quote.items) : [];
    setItems(saved.length ? saved.map((item) => ({ name: item.name, spec: item.spec, qty: String(item.qty), unit: String(item.unit), productId: item.product_id ? String(item.product_id) : "" })) : [blankItem]);
    document.getElementById("quotes-heading")?.scrollIntoView({ block: "start" });
  }

  async function saveQuote() {
    if (!rows.length || saving) return;
    setSaving(true);
    setTip("");
    try {
      const response = await fetch("/api/quotes", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing, lead_id: Number(leadId) || null, items: rows, currency, valid_until: validUntil }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存报价失败。");
      await load();
      setSelected(data.id);
      setEditing(null);
      setShowAdd(false);
      setTip("已保存报价草稿。");
    } catch (error) { setTip(error instanceof Error ? error.message : "保存报价失败。"); }
    finally { setSaving(false); }
  }

  async function approval(action: "submit" | "approve" | "reject", id: number, accountId?: string) {
    setApprovalBusy(true);
    setTip("");
    try {
      const response = await fetch("/api/quotes/approval", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, accountId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "审批操作失败。");
      await Promise.all([load(), loadApprovals()]);
      setTip(action === "submit" ? "已提交审批。" : action === "approve" ? "报价已通过审批。" : "报价已退回。");
    } catch (error) { setTip(error instanceof Error ? error.message : "审批操作失败。"); }
    finally { setApprovalBusy(false); }
  }

  async function publish(id: number) {
    setTip("");
    const r = await fetch(`/api/quotes/${id}/publish`, { method: "POST" });
    const d = await r.json();
    if (!d.ok) { setTip(d.error || "生成失败"); return; }
    const copied = await navigator.clipboard.writeText(`${window.location.origin}${d.url}`).then(() => true, () => false);
    setTip(copied ? "只读链接已生成并复制。" : "只读链接已生成，可从报价记录查看。");
    void load();
  }

  async function copyLink(id: number) {
    setTip("");
    const q = quotes.find((x) => x.id === id);
    if (!q?.token) { setTip("请先点「发客户」生成链接"); return; }
    await navigator.clipboard.writeText(`${window.location.origin}/q/${q.token}`);
    setTip(`链接已复制：/q/${q.token}`);
  }

  async function emailQuote(id: number, account?: string) {
    setTip("");
    setSendingMail(true);
    try {
      const r = await fetch(`/api/quotes/${id}/email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account }) });
      const d = await r.json();
      if (r.status === 409 && Array.isArray(d.accounts)) {
        setSenderId("");
        setSenderChoice({ quoteId: id, accounts: d.accounts });
        return;
      }
      if (r.ok) { setSenderChoice(null); load(); }
      setTip(d.message || d.error || "已发送");
    } catch {
      setTip("暂时无法发送报价邮件");
    } finally {
      setSendingMail(false);
    }
  }

  return (
    <AppShell pending={pending}>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><h1 id="quotes-heading" className="text-[24px] font-semibold tracking-tight text-ink">报价单</h1><p className="mt-1 text-xs text-muted">{quotes.length} 张报价</p></div>
          <button type="button" className="rounded-lg bg-[#5947C9] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#4937B6]" disabled={saving} onClick={() => { if (showAdd) setShowAdd(false); else openDraft(); }}>
            {showAdd ? "关闭编辑" : "新建报价单"}
          </button>
        </header>
        <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SalesMetric label="待报价" value={counts?.awaiting ?? "—"} hint="已请求报价的客户" icon="workflow" tone="violet" />
          <SalesMetric label="已报价" value={counts?.quoted ?? "—"} hint="已发出的报价单" icon="file" tone="blue" />
          <SalesMetric label="样品中" value={counts?.samples ?? "—"} hint="处于样品阶段的客户" icon="catalog" tone="amber" />
          <SalesMetric label="已成交" value={counts?.deals ?? "—"} hint="标为成交的客户" icon="users" tone="green" />
        </div>
        {tip ? <p role="status" className="mb-4 rounded-xl bg-[#F2EEFC] px-4 py-3 text-xs text-[#5345A2]">{tip}</p> : null}
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
        {approvalEntries.length ? <details className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-ink">待审批报价（{approvalEntries.length}{approvalEntries.length === 40 ? "+" : ""}）</summary>
          <ul className="mt-3 max-h-80 divide-y divide-line overflow-auto">
            {approvalEntries.map((entry) => <li key={`${entry.accountId}-${entry.id}`} className="space-y-2 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">{entry.quote_no} · {entry.company || "未指定客户"}</span>
                <span className="text-muted">{entry.submitter} · {formatSalesAmount(entry.total, entry.currency)}</span>
              </div>
              <details><summary className="cursor-pointer text-[#5946C1]">查看明细</summary>
                <ul className="space-y-1 py-2 text-muted">{quoteItems(entry.items).map((item, index) =>
                  <li key={index}>{item.name} · {item.qty} 件 · {formatSalesAmount(Number(item.unit), entry.currency)} / 件</li>)}</ul>
              </details>
              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-[#E9F6EF] px-3 py-1.5 text-[#237357] disabled:opacity-50" disabled={approvalBusy} onClick={() => void approval("approve", entry.id, entry.accountId)}>通过审批</button>
                <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-muted disabled:opacity-50" disabled={approvalBusy} onClick={() => void approval("reject", entry.id, entry.accountId)}>退回</button>
              </div>
            </li>)}
          </ul>
        </details> : null}

        {senderChoice ? <form className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card p-3" onSubmit={(event) => { event.preventDefault(); if (senderId && !sendingMail) void emailQuote(senderChoice.quoteId, senderId); }}>
          <label htmlFor="quote-mail-account" className="text-[12px] text-muted">发件邮箱</label>
          <select id="quote-mail-account" value={senderId} onChange={(event) => setSenderId(event.target.value)} disabled={sendingMail}>
            <option value="">选择邮箱</option>
            {senderChoice.accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          </select>
          <button className="rounded bg-[#5548C8] px-3 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={!senderId || sendingMail}>发送报价</button>
          <button type="button" className="text-[12px] text-muted" disabled={sendingMail} onClick={() => setSenderChoice(null)}>取消</button>
        </form> : null}
        {showAdd ? (
          <div className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">{editing ? "编辑报价草稿" : "创建报价单"}</h2>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="quote-customer" className="mb-1 block text-[12px] text-muted">客户</label>
                <select id="quote-customer" className="w-full" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                  <option value="">选择客户…</option>
                  {leads.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="quote-currency" className="mb-1 block text-[12px] text-muted">币种</label>
                <select id="quote-currency" className="w-full" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="USD">USD</option><option value="EUR">EUR</option><option value="CNY">CNY</option>
                  {!["USD", "EUR", "CNY"].includes(currency) ? <option>{currency}</option> : null}
                </select>
              </div>
              <div>
                <label htmlFor="quote-validity" className="mb-1 block text-[12px] text-muted">有效期至</label>
                <input id="quote-validity" type="date" className="w-full" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
            </div>
            {items.map((it, i) => {
              const amt = Math.round((Number(it.qty) || 0) * (Number(it.unit) || 0) * 100) / 100;
              return (
                <div key={i} className="mb-2 space-y-2 rounded-xl border border-[#EEE9F4] bg-[#FBFAFD] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <select aria-label={`第 ${i + 1} 项，从报价资料库选择`} className="min-w-0 flex-1 text-xs" value={it.productId} onChange={(e) => selectProduct(i, e.target.value)}><option value="">从报价资料库选择</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · MOQ {product.moq}</option>)}</select>
                    {items.length > 1 ? <button type="button" className="text-xs text-[#91432F] hover:underline" onClick={() => setItems((current) => current.filter((_, index) => i !== index))}>移除</button> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1.45fr)_minmax(0,.65fr)_minmax(0,.75fr)_auto]">
                    <label className="min-w-0 text-[11px] text-muted">品名<input className="mt-1 w-full" value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} /></label>
                    <label className="min-w-0 text-[11px] text-muted">规格<input className="mt-1 w-full" value={it.spec} onChange={(e) => setItem(i, "spec", e.target.value)} /></label>
                    <label className="min-w-0 text-[11px] text-muted">数量<input className="mt-1 w-full" type="number" min="0" step="any" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} /></label>
                    <label className="min-w-0 text-[11px] text-muted">单价<input className="mt-1 w-full" type="number" min="0" step="any" value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} /></label>
                    <p className="self-end pb-1 text-xs tabular-nums text-muted">{amt.toFixed(2)}</p>
                  </div>
                </div>
              );
            })}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="button" className="rounded-lg border border-line px-3 py-2 text-xs text-muted" disabled={items.length >= 100} onClick={() => setItems((current) => [...current, blankItem])}>+ 添加产品</button>
              <span className="flex-1" />
              <span className="text-[12px] text-muted">
                总计 {formatSalesAmount(rows.reduce((sum, row) => sum + row.amount, 0), currency)}
              </span>
              <button type="button" className="rounded-lg bg-[#5947C9] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50" onClick={() => void saveQuote()} disabled={saving || !rows.length}>保存报价单</button>
            </div>
          </div>
        ) : null}

        <section aria-label="报价记录" className="overflow-x-auto rounded-2xl border border-line bg-white shadow-sm">
          <h2 className="px-4 pt-4 text-sm font-semibold text-ink">报价记录</h2>
          <table className="w-full min-w-[620px] text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-faint">
                <th className="px-4 py-2.5 font-normal">编号</th>
                <th className="px-4 py-2.5 font-normal">客户</th>
                <th className="px-4 py-2.5 font-normal">金额</th>
                <th className="px-4 py-2.5 font-normal">状态</th>
                <th className="px-4 py-2.5 font-normal">日期</th>
                <th className="px-4 py-2.5 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id} className="border-b border-[#F0F0EC] last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{q.quote_no}</td>
                  <td className="px-4 py-2.5 text-muted">{q.company || "—"}</td>
                  <td className="px-4 py-2.5 tabular-nums text-muted">{formatSalesAmount(q.total, q.currency)}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded px-1.5 py-px text-[11px]" style={{ background: (STATUS_COLOR[q.status] || "#9A9E9F") + "1A", color: STATUS_COLOR[q.status] || "#9A9E9F" }}>
                      {q.status}
                    </span>
                    {q.approval_status ? <p className="mt-1 text-[10px] text-muted">{APPROVAL_LABELS[q.approval_status]}</p> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{q.created_at}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button type="button" className="text-xs font-medium text-[#5946C1] hover:underline" onClick={() => { setSelected(q.id); setShowAdd(false); document.getElementById("quotes-heading")?.scrollIntoView({ block: "start" }); }}>报价助手</button>
                      {q.status === "草稿" && (!q.approval_status || q.approval_status === "rejected") ? <button type="button" className="text-xs text-muted hover:underline" onClick={() => openDraft(q)}>编辑</button> : null}
                      <a href={`/quotes/${q.id}`} className="text-[12px] text-muted underline">查看 / 打印</a>
                      <button className="rounded border border-line px-2 py-0.5 text-[12px] text-muted disabled:opacity-50" disabled={sendingMail || !canSendQuote(q.approval_status)} onClick={() => void emailQuote(q.id)}>邮件发送</button>
                      {q.token ? (
                        <button className="rounded border border-line px-2 py-0.5 text-[12px] text-muted" onClick={() => copyLink(q.id)}>复制链接</button>
                      ) : (
                        <button className="rounded border border-line px-2 py-0.5 text-[12px] text-ink disabled:opacity-50" disabled={!canSendQuote(q.approval_status)} onClick={() => void publish(q.id)}>发客户</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-[12px] text-faint">还没有报价单</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>
        </div>
        <QuoteAssistant key={showAdd ? `draft-${editing || "new"}` : selected || "empty"}
          items={showAdd ? rows : currentQuote ? quoteItems(currentQuote.items) : []} products={products} quotes={quotes}
          currency={showAdd ? currency : currentQuote?.currency || "USD"} leadId={showAdd ? Number(leadId) || undefined : currentQuote?.lead_id || undefined}
          quote={showAdd ? undefined : currentQuote} approvalBusy={approvalBusy} onSubmit={(id) => void approval("submit", id)} />
        </div>
      </div>
    </AppShell>
  );
}
