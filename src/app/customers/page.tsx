"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { SALES_STAGES, STAGE_COLOR } from "@/lib/stages";
import type { Lead } from "@/lib/db";

export default function CustomersPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pending, setPending] = useState(0);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ company: "", name: "", email: "", whatsapp: "", country: "", industry: "", position: "" });
  const [editForm, setEditForm] = useState({ company: "", name: "", email: "", whatsapp: "", phone: "", country: "", industry: "", position: "", website: "", address: "" });

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") === "1") setShowAdd(true);
    fetch("/api/inbox").then((r) => r.json()).then((d) => setPending((d.inbox || []).filter((x: any) => x.state === "待批准").length));
    load();
  }, []);

  function load() {
    fetch("/api/leads").then((r) => r.json()).then((d) => setLeads(d.leads || []));
  }

  async function setStatus(id: number, status: string) {
    await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  }

  async function addLead() {
    await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, source: "手动录入" }) });
    setForm({ company: "", name: "", email: "", whatsapp: "", country: "", industry: "", position: "" });
    setShowAdd(false);
    load();
  }

  function openEdit(lead: Lead) {
    setEditing(lead);
    setEditForm({ company: lead.company || "", name: lead.name || "", email: lead.email || "", whatsapp: lead.whatsapp || "", phone: lead.phone || "", country: lead.country || "", industry: lead.industry || "", position: lead.position || "", website: lead.website || "", address: lead.address || "" });
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true); setNotice("");
    try {
      const r = await fetch("/api/leads", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editing.id, ...editForm }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "保存失败");
      setEditing(null); setNotice("客户资料已更新"); load();
    } catch (e: any) { setNotice(e?.message || "保存失败"); }
    finally { setSavingEdit(false); }
  }

  async function deleteLeads(ids: number[]) {
    if (!ids.length) return;
    const message = ids.length === 1
      ? `确定删除「${leads.find((l) => l.id === ids[0])?.company || "此客户"}」？相关消息、报价和跟进记录也会一起删除，无法撤销。`
      : `确定删除选中的 ${ids.length} 位客户？相关消息、报价和跟进记录也会一起删除，无法撤销。`;
    if (!window.confirm(message)) return;
    setDeleting(true); setNotice("");
    try {
      const r = await fetch("/api/leads", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "删除失败");
      setSelected((prev) => prev.filter((id) => !ids.includes(id)));
      setNotice(`已删除 ${d.deleted} 位客户`);
      load();
    } catch (e: any) { setNotice(e?.message || "删除失败"); }
    finally { setDeleting(false); }
  }

  function toggleOne(id: number) {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) m[l.status] = (m[l.status] || 0) + 1;
    return m;
  }, [leads]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthNew = leads.filter((l) => (l.acquired_at || "").startsWith(thisMonth)).length;

  const list = leads.filter((l) =>
    (!q || l.company.includes(q) || l.name.includes(q) || l.email.includes(q)) &&
    (!stage || l.status === stage)
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize));
  const visibleLeads = list.slice((page - 1) * pageSize, page * pageSize);
  const firstVisible = list.length ? (page - 1) * pageSize + 1 : 0;
  const lastVisible = Math.min(page * pageSize, list.length);

  useEffect(() => { setPage((current) => Math.min(current, pageCount)); }, [pageCount]);

  return (
    <AppShell pending={pending}>
      <div className="flex min-h-screen">
        <div className="w-[220px] flex-none border-r border-line bg-paper px-4 py-5">
          <input className="mb-4 w-full" placeholder="搜索客户" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          <button
            className={`mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] ${stage === "" ? "bg-[#16181A] text-white" : "text-muted hover:bg-card"}`}
            onClick={() => { setStage(""); setPage(1); }}
          >
            <span>全部客户</span>
            <span className="text-[11px]">{leads.length}</span>
          </button>
          <p className="mb-1 mt-4 text-[11px] tracking-[0.6px] text-faint">阶段</p>
          {SALES_STAGES.map((s) => (
            <button
              key={s}
              className={`mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] ${stage === s ? "bg-[#16181A] text-white" : "text-muted hover:bg-card"}`}
              onClick={() => { setStage(s); setPage(1); }}
            >
              <span className="flex items-center gap-2">
                <i className="block h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[s] }} />
                {s}
              </span>
              <span className="text-[11px]">{stageCounts[s] || 0}</span>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 px-6 py-5">
          <div className="mb-4 flex items-center gap-3">
            <h1 className="text-[15px] font-medium text-ink">{stage || "全部客户"}</h1>
            <span className="text-[12px] text-faint">{list.length} 个客户 · 本月新增 {monthNew}</span>
            <span className="flex-1" />
            <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "取消" : "新增客户"}
            </button>
          </div>

          {selected.length ? <div className="mb-3 flex items-center gap-3 rounded-xl border border-[#F1D6D6] bg-[#FFF8F8] px-4 py-2.5">
            <span className="text-[12px] text-ink">已选择 <b>{selected.length}</b> 位客户</span>
            <button className="rounded-lg bg-[#A32D2D] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60" disabled={deleting} onClick={() => deleteLeads(selected)}>{deleting ? "删除中…" : `删除所选 (${selected.length})`}</button>
            <button className="text-[12px] text-muted hover:text-ink" onClick={() => setSelected([])}>取消选择</button>
            {notice ? <span className="ml-auto text-[12px] text-muted">{notice}</span> : null}
          </div> : notice ? <p className="mb-2 text-[12px] text-muted">{notice}</p> : null}

          {showAdd ? (
            <div className="mb-4 rounded-lg border border-line bg-card p-4">
              <div className="grid grid-cols-4 gap-3">
                <input placeholder="公司名 *" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                <input placeholder="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input placeholder="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                <input placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                <input placeholder="国家" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                <input placeholder="行业" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
                <input placeholder="职位" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white" onClick={addLead}>保存</button>
              </div>
            </div>
          ) : null}

          {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !savingEdit) setEditing(null); }}>
            <div className="w-full max-w-3xl rounded-xl border border-line bg-card p-5 shadow-xl">
              <div className="mb-4 flex items-center"><h2 className="text-[15px] font-semibold">编辑客户资料</h2><span className="flex-1"/><button className="text-muted" disabled={savingEdit} onClick={() => setEditing(null)}>关闭</button></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {([ ["公司名", "company"], ["联系人", "name"], ["职位", "position"], ["邮箱", "email"], ["WhatsApp", "whatsapp"], ["电话", "phone"], ["国家", "country"], ["行业", "industry"], ["官网", "website"], ["地址", "address"] ] as const).map(([label, key]) => <label key={key} className="text-[11px] text-muted">{label}<input className="mt-1 w-full" value={editForm[key]} onChange={(e) => setEditForm((prev) => ({ ...prev, [key]: e.target.value }))} /></label>)}
              </div>
              <div className="mt-5 flex justify-end gap-2"><button className="rounded-md border border-line px-4 py-2 text-[12px]" disabled={savingEdit} onClick={() => setEditing(null)}>取消</button><button className="rounded-md bg-[#6756D8] px-4 py-2 text-[12px] font-medium text-white disabled:opacity-50" disabled={savingEdit || !editForm.company.trim()} onClick={saveEdit}>{savingEdit ? "保存中…" : "保存修改"}</button></div>
            </div>
          </div> : null}

          <div className="overflow-hidden rounded-lg border border-line bg-card">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-faint">
                  <th className="w-10 px-3 py-2.5 font-normal"><input type="checkbox" aria-label="选择当前页全部客户" checked={visibleLeads.length > 0 && visibleLeads.every((l) => selected.includes(l.id))} onChange={(e) => setSelected(e.target.checked ? Array.from(new Set([...selected, ...visibleLeads.map((l) => l.id)])) : selected.filter((id) => !visibleLeads.some((l) => l.id === id)))} /></th>
                  <th className="px-4 py-2.5 font-normal">公司</th>
                  <th className="px-4 py-2.5 font-normal">国家 / 行业</th>
                  <th className="px-4 py-2.5 font-normal">联系人</th>
                  <th className="px-4 py-2.5 font-normal">邮箱</th>
                  <th className="px-4 py-2.5 font-normal">WhatsApp</th>
                  <th className="px-4 py-2.5 font-normal">阶段</th>
                  <th className="w-28 px-3 py-2.5 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((l) => (
                  <tr key={l.id} className="border-b border-[#F0F0EC] last:border-0">
                    <td className="px-3 py-2.5"><input type="checkbox" aria-label={`选择 ${l.company}`} checked={selected.includes(l.id)} onChange={() => toggleOne(l.id)} /></td>
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <a href={`/customers/${l.id}`} className="hover:underline">{l.company}</a>
                    </td>
                    <td className="px-4 py-2.5 text-muted">{[l.country, l.industry].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{l.name ? `${l.name}${l.position ? " · " + l.position : ""}` : <span className="text-[#B5B8B8]">未获取</span>}</td>
                    <td className="px-4 py-2.5 text-muted">{l.email || <span className="text-[#B5B8B8]">未获取</span>}</td>
                    <td className="px-4 py-2.5 text-muted">{l.whatsapp || <span className="text-[#B5B8B8]">未获取</span>}</td>
                    <td className="px-4 py-2.5">
                      <select value={l.status} onChange={(e) => setStatus(l.id, e.target.value)} className="py-0.5 text-[11px]">
                        {SALES_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5"><button className="rounded-md px-2 py-1 text-[11px] text-[#6756D8] hover:bg-[#F3F1FF]" onClick={() => openEdit(l)}>编辑</button><button className="rounded-md px-2 py-1 text-[11px] text-[#A32D2D] hover:bg-[#FFF0F0]" disabled={deleting} onClick={() => deleteLeads([l.id])}>删除</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {list.length === 0 ? <p className="py-10 text-center text-[12px] text-faint">没有匹配的客户</p> : null}
          {list.length > 0 ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-3 text-[11px] text-muted"><span>显示 {firstVisible}–{lastVisible} 条，共 {list.length} 位客户</span><div className="flex items-center gap-2"><button className="rounded-md border border-line px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>上一页</button><span className="min-w-16 text-center">第 {page} / {pageCount} 页</span><button className="rounded-md border border-line px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>下一页</button></div></div> : null}
        </div>
      </div>
    </AppShell>
  );
}
