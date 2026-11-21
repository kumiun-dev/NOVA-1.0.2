"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";

type Doc = { id: number; title: string; category: string; preview: string; characters: number; created_at: string; updated_at: string };
export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [id, setId] = useState<number | undefined>();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("产品资料");
  const [content, setContent] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => fetch("/api/knowledge").then((response) => response.json()).then((data) => setDocs(data.docs || []));
  useEffect(() => { void load(); }, []);
  function reset() { setId(undefined); setTitle(""); setCategory("产品资料"); setContent(""); }
  async function save() {
    setSaving(true); setNotice("");
    try {
      const response = await fetch("/api/knowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, title, category, content }) });
      const data = await response.json();
      if (!response.ok) { setNotice(data.error || "保存失败"); return; }
      setNotice("资料已保存，智能体会在相关问题中检索使用"); reset(); await load();
    } finally { setSaving(false); }
  }
  async function edit(doc: Doc) {
    const response = await fetch(`/api/knowledge?id=${doc.id}`); const data = await response.json();
    if (data.doc) { setId(data.doc.id); setTitle(data.doc.title); setCategory(data.doc.category); setContent(data.doc.content); window.scrollTo({ top: 0, behavior: "smooth" }); }
  }
  async function remove(doc: Doc) {
    if (!window.confirm(`确定删除「${doc.title}」吗？智能体将不再使用这份资料。`)) return;
    const response = await fetch(`/api/knowledge?id=${doc.id}`, { method: "DELETE" });
    if (response.ok) { setNotice("资料已删除"); await load(); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 200_000) { setNotice("文件太大，请使用 200 KB 以内的 TXT、Markdown 或 CSV 文件"); return; }
    const text = await file.text(); setTitle(file.name.replace(/\.[^.]+$/, "")); setContent(text); setCategory(file.name.toLowerCase().endsWith(".csv") ? "产品目录" : "产品资料"); setId(undefined);
  }
  return <AppShell><div className="min-h-screen bg-[#F8F7FC] px-5 py-7 lg:px-8"><div className="mx-auto max-w-[1150px]">
    <div className="mb-6"><p className="text-[10px] font-semibold tracking-[0.16em] text-[#7167C8]">NOVA KNOWLEDGE</p><h1 className="mt-1 text-[22px] font-semibold text-[#24322B]">外贸知识库</h1><p className="mt-1.5 text-[12px] text-[#89958F]">添加产品、报价规则、认证、交期与公司介绍，智能体会先检索相关资料再回答。</p></div>
    {notice ? <div className="mb-4 rounded-lg border border-[#E3DFFF] bg-white px-3 py-2 text-[11px] text-[#7167C8]">{notice}</div> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="text-[14px] font-semibold text-[#34423B]">{id ? "编辑资料" : "添加资料"}</h2><button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border border-[#E1E8E4] px-3 py-2 text-[10px] text-[#7167C8] hover:bg-[#F7F6FC]">从电脑导入 TXT / MD / CSV</button><input ref={fileRef} hidden type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }}/></div>
        <label className="mb-3 block"><span className="mb-1.5 block text-[10px] font-medium text-[#5C6962]">资料名称</span><input className="w-full rounded-lg border border-[#E5E1F4] px-3 py-2.5 text-[11px]" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：不锈钢保温杯产品规格"/></label>
        <label className="mb-3 block"><span className="mb-1.5 block text-[10px] font-medium text-[#5C6962]">资料类别</span><select className="w-full rounded-lg border border-[#E5E1F4] px-3 py-2.5 text-[11px]" value={category} onChange={(event) => setCategory(event.target.value)}><option>产品资料</option><option>报价与贸易条款</option><option>认证与质检</option><option>生产与交期</option><option>公司介绍</option><option>产品目录</option><option>其他</option></select></label>
        <label className="mb-4 block"><span className="mb-1.5 block text-[10px] font-medium text-[#5C6962]">资料正文</span><textarea className="min-h-[260px] w-full rounded-lg border border-[#E5E1F4] px-3 py-3 text-[11px] leading-5" value={content} onChange={(event) => setContent(event.target.value)} placeholder="写入或粘贴产品名称、型号、材料、尺寸、包装、MOQ、出厂成本、参考售价、交期、认证和常见问答。信息越具体，回答越可靠。"/><span className="mt-1 block text-right text-[9px] text-[#9AA49F]">{content.length.toLocaleString()} / 200,000 字</span></label>
        <div className="flex justify-end gap-2">{id ? <button onClick={reset} className="rounded-lg border border-[#E5E1F4] px-4 py-2.5 text-[10px] text-[#69756F]">取消编辑</button> : null}<button onClick={() => void save()} disabled={saving || !title.trim() || !content.trim()} className="rounded-lg bg-[#5548C8] px-5 py-2.5 text-[10px] font-semibold text-white disabled:opacity-50">{saving ? "保存中…" : id ? "保存修改" : "加入知识库"}</button></div>
      </section>
      <aside className="h-fit rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><h2 className="text-[13px] font-semibold text-[#34423B]">让 AI 更准确地学会你的产品</h2><ul className="mt-3 space-y-2.5 text-[10px] leading-5 text-[#718078]"><li>• 优先录入产品规格、MOQ、包装与能确认的价格区间。</li><li>• 补充生产周期、可做的定制、证书和质检流程。</li><li>• 说明哪些信息不能承诺；AI 找不到依据时会提示人工确认。</li><li>• 当前支持粘贴内容，或导入 TXT、MD、CSV 文本文件；PDF/Word 解析暂未开放。</li></ul><div className="mt-4 rounded-xl bg-[#F8F7FC] p-3 text-[10px] leading-5 text-[#6255D3]">这些资料保存在本机 NOVA 数据库中，智能体会按客户问题匹配相关段落，不会把资料公开给客户。</div></aside>
    </div>
    <section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><h2 className="text-[14px] font-semibold text-[#34423B]">已收录资料</h2><p className="mt-1 text-[10px] text-[#929D97]">{docs.length} 份 · 按标题和正文相关度检索</p></div></div><div className="grid gap-3 md:grid-cols-2">{docs.map((doc) => <article key={doc.id} className="rounded-xl border border-[#E5E1F4] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="rounded-full bg-[#F4F2FF] px-2 py-1 text-[9px] text-[#7167C8]">{doc.category}</span><h3 className="mt-2 truncate text-[12px] font-semibold text-[#34423B]">{doc.title}</h3></div><span className="shrink-0 text-[9px] text-[#A0A9A4]">{doc.characters.toLocaleString()} 字</span></div><p className="mt-2 line-clamp-3 whitespace-pre-wrap text-[10px] leading-5 text-[#76817B]">{doc.preview}</p><div className="mt-3 flex justify-end gap-3"><button onClick={() => void edit(doc)} className="text-[10px] text-[#6255D3] hover:underline">编辑</button><button onClick={() => void remove(doc)} className="text-[10px] text-[#A75A51] hover:underline">删除</button></div></article>)}</div>{!docs.length ? <div className="rounded-xl border border-dashed border-[#D9E2DD] bg-white py-10 text-center text-[11px] text-[#98A39D]">还没有产品资料，先添加一份试试。</div> : null}</section>
  </div></div></AppShell>;
}
