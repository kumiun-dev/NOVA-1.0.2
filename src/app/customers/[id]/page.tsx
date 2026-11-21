"use client";

import { use, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { SALES_STAGES } from "@/lib/stages";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-faint">{label}</div>
      <div className="text-[13px] text-ink">{value || <span className="text-[#B5B8B8]">未获取</span>}</div>
    </div>
  );
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<any>(null);
  const [followups, setFollowups] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [inbox, setInbox] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("线索");
  const [fu, setFu] = useState({ type: "跟进", content: "", next_at: "" });
  const [msg, setMsg] = useState("");

  function load() {
    fetch(`/api/leads/${id}`).then((r) => r.json()).then((d) => {
      setLead(d.lead);
      setFollowups(d.followups || []);
      setQuotes(d.quotes || []);
      setInbox(d.inbox || []);
      setNote(d.lead?.note || "");
      setStatus(d.lead?.status || "线索");
    });
  }
  useEffect(() => { load(); }, [id]);

  async function save() {
    await fetch(`/api/leads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", note, status }) });
    setMsg("已保存");
    load();
  }

  async function addFollowup() {
    if (!fu.content.trim()) return;
    await fetch(`/api/leads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "followup", ...fu }) });
    setFu({ type: "跟进", content: "", next_at: "" });
    load();
  }

  if (!lead) return <AppShell><div className="px-6 py-5 text-[12px] text-faint">加载中…</div></AppShell>;

  return (
    <AppShell>
      <div className="px-6 py-5">
        <div className="mb-4 flex items-center gap-3">
          <a href="/customers" className="text-[12px] text-muted hover:text-ink">← 返回客户列表</a>
          <h1 className="text-[16px] font-medium text-ink">{lead.company}</h1>
          <span className="rounded border border-[#D8D8D2] px-2 py-0.5 text-[11px] text-muted">{lead.status}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* 左：客户资料 */}
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] font-medium text-ink">客户资料</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="国家" value={lead.country} />
              <Field label="行业" value={lead.industry} />
              <Field label="联系人" value={lead.name} />
              <Field label="职位" value={lead.position} />
              <Field label="邮箱" value={lead.email} />
              <Field label="WhatsApp" value={lead.whatsapp} />
              <Field label="电话" value={lead.phone} />
              <Field label="HS 编码" value={lead.hs_code} />
              <Field label="来源" value={lead.source} />
              <Field label="获取时间" value={lead.acquired_at} />
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-[12px] text-ink">阶段</label>
              <select className="w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                {SALES_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="mt-3">
              <label className="mb-1 block text-[12px] text-ink">备注</label>
              <textarea className="h-20 w-full" placeholder="客户备注…" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <button className="mt-3 w-full rounded-md bg-[#16181A] py-2 text-[12px] text-white" onClick={save}>保存</button>
            {msg ? <p className="mt-2 text-[11px] text-faint">{msg}</p> : null}
          </div>

          {/* 中：跟进记录 */}
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] font-medium text-ink">跟进记录</p>
            <div className="mb-3 space-y-1.5">
              <select className="w-full" value={fu.type} onChange={(e) => setFu({ ...fu, type: e.target.value })}>
                <option value="跟进">跟进</option>
                <option value="备注">备注</option>
                <option value="电话">电话</option>
                <option value="邮件">邮件</option>
                <option value="会议">会议</option>
              </select>
              <input className="w-full" placeholder="下次跟进时间（如 2026-11-20）" value={fu.next_at} onChange={(e) => setFu({ ...fu, next_at: e.target.value })} />
              <textarea className="h-16 w-full" placeholder="记录内容…" value={fu.content} onChange={(e) => setFu({ ...fu, content: e.target.value })} />
              <button className="w-full rounded-md border border-line py-1.5 text-[12px] text-ink hover:bg-paper" onClick={addFollowup}>添加记录</button>
            </div>
            <div className="space-y-2">
              {followups.length === 0 ? <p className="py-6 text-center text-[12px] text-faint">还没有跟进记录</p> : null}
              {followups.map((f) => (
                <div key={f.id} className="rounded-md border border-line p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-ink">{f.type}{f.next_at ? ` · 下次 ${f.next_at}` : ""}</span>
                    <span className="text-[10px] text-faint">{f.created_at}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-muted">{f.content}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 右：报价单 + 回信 */}
          <div className="space-y-4">
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="mb-3 text-[12px] font-medium text-ink">报价单</p>
              {quotes.length === 0 ? <p className="py-4 text-center text-[12px] text-faint">暂无报价单</p> : (
                <div className="space-y-2">
                  {quotes.map((q) => (
                    <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2 hover:bg-paper">
                      <span className="text-[12px] text-ink">{q.quote_no}</span>
                      <span className="text-[11px] text-muted">{q.currency} {q.total} · {q.status}</span>
                    </a>
                  ))}
                </div>
              )}
              <a href={`/quotes?lead=${id}`} className="mt-3 block rounded-md bg-[#16181A] py-1.5 text-center text-[12px] text-white">新建报价单</a>
            </div>
            <div className="rounded-lg border border-line bg-card p-4">
              <p className="mb-3 text-[12px] font-medium text-ink">往来消息</p>
              {inbox.length === 0 ? <p className="py-4 text-center text-[12px] text-faint">暂无消息</p> : (
                <div className="space-y-2">
                  {inbox.map((m) => (
                    <div key={m.id} className="rounded-md border border-line p-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-ink">{m.sender || "—"}</span>
                        <span className="text-[10px] text-faint">{m.channel}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted">{m.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
