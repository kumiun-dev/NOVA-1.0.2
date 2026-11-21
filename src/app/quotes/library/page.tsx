"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

type Product = { id: number; sku: string; name: string; specs: string; hs_code: string; unit_cost: number; cost_currency: string; packaging_cost: number; default_margin: number; default_price: number; moq: number; lead_time: string };
const empty: Omit<Product, "id"> = { sku: "", name: "", specs: "", hs_code: "", unit_cost: 0, cost_currency: "CNY", packaging_cost: 0, default_margin: 25, default_price: 0, moq: 1, lead_time: "" };
const fields: { key: keyof Omit<Product, "id">; label: string; type?: string }[] = [
  { key: "sku", label: "SKU / 型号" }, { key: "name", label: "产品名称" }, { key: "hs_code", label: "HS 编码" }, { key: "specs", label: "产品规格" }, { key: "unit_cost", label: "出厂成本 / 件", type: "number" }, { key: "packaging_cost", label: "包装成本 / 件", type: "number" }, { key: "default_margin", label: "目标毛利率 %", type: "number" }, { key: "default_price", label: "参考报价 / 件", type: "number" }, { key: "moq", label: "MOQ", type: "number" }, { key: "lead_time", label: "参考交期" },
];

export default function QuoteLibraryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState<Omit<Product, "id"> & { id?: number }>(empty);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const load = () => fetch("/api/products").then((response) => response.json()).then((data) => setProducts(data.products || []));
  useEffect(() => { void load(); }, []);
  const update = (key: keyof Omit<Product, "id">, value: string) => setForm((current) => ({ ...current, [key]: ["unit_cost", "packaging_cost", "default_margin", "default_price", "moq"].includes(key) ? Number(value) : value }));
  async function save(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    const response = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json();
    if (!response.ok) { setNotice(data.error || "保存失败"); return; }
    setOpen(false); setForm(empty); setNotice("产品资料已保存"); await load();
  }
  async function remove(product: Product) {
    if (!window.confirm(`确定删除「${product.name}」吗？`)) return;
    const response = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" });
    if (response.ok) { setNotice("已删除"); await load(); }
  }
  return <AppShell><div className="min-h-screen bg-[#F8F7FC] px-5 py-7 lg:px-8"><div className="mx-auto max-w-[1180px]">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold tracking-[0.16em] text-[#7167C8]">PRODUCT & PRICE BOOK</p><h1 className="mt-1 text-[22px] font-semibold text-[#24322B]">报价资料库</h1><p className="mt-1.5 text-[12px] text-[#89958F]">沉淀产品规格、成本、MOQ 与参考报价，供销售报价时查用。</p></div><button onClick={() => { setForm(empty); setOpen((value) => !value); }} className="rounded-lg bg-[#5548C8] px-4 py-2.5 text-[11px] font-semibold text-white hover:bg-[#493DAE]">{open ? "取消" : "+ 添加产品"}</button></div>
    {notice ? <p className="mb-4 rounded-lg border border-[#E3DFFF] bg-white px-3 py-2 text-[11px] text-[#7167C8]">{notice}</p> : null}
    {open ? <form onSubmit={save} className="mb-5 rounded-2xl border border-[#E5E1F4] bg-white p-5 shadow-sm"><div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{fields.map((field) => <label key={field.key} className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#5C6962]">{field.label}{field.key === "name" ? " *" : ""}</span>{field.key === "specs" ? <textarea className="w-full rounded-lg border border-[#E5E1F4] p-2.5 text-[11px]" rows={2} value={String(form[field.key] || "")} onChange={(event) => update(field.key, event.target.value)}/> : <input className="w-full rounded-lg border border-[#E5E1F4] px-3 py-2.5 text-[11px]" type={field.type || "text"} min={field.type === "number" ? 0 : undefined} value={String(form[field.key] ?? "")} onChange={(event) => update(field.key, event.target.value)}/>}</label>)}<label className="block"><span className="mb-1.5 block text-[10px] font-medium text-[#5C6962]">成本币种</span><select className="w-full rounded-lg border border-[#E5E1F4] px-3 py-2.5 text-[11px]" value={form.cost_currency} onChange={(event) => update("cost_currency", event.target.value)}><option>CNY</option><option>USD</option><option>EUR</option></select></label></div><div className="flex justify-end"><button className="rounded-lg bg-[#5548C8] px-5 py-2.5 text-[11px] font-semibold text-white">保存资料</button></div></form> : null}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{products.map((product) => <article key={product.id} className="rounded-2xl border border-[#E5E1F4] bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-[13px] font-semibold text-[#29362F]">{product.name}</p><p className="mt-1 text-[10px] text-[#909B95]">{product.sku || "未填写型号"}{product.hs_code ? ` · HS ${product.hs_code}` : ""}</p></div><span className="rounded-full bg-[#EDF5F0] px-2 py-1 text-[9px] text-[#7167C8]">MOQ {product.moq}</span></div><p className="mt-3 min-h-10 whitespace-pre-wrap text-[10px] leading-5 text-[#68756E]">{product.specs || "尚未填写规格"}</p><div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#F8F7FC] p-3"><div><p className="text-[9px] text-[#9AA49F]">出厂成本 / 件</p><p className="mt-1 text-[11px] font-medium text-[#38473F]">{Number(product.unit_cost).toFixed(2)} {product.cost_currency}</p></div><div><p className="text-[9px] text-[#9AA49F]">参考报价 / 件</p><p className="mt-1 text-[11px] font-medium text-[#38473F]">{Number(product.default_price).toFixed(2)} {product.cost_currency}</p></div><div><p className="text-[9px] text-[#9AA49F]">目标毛利</p><p className="mt-1 text-[11px] font-medium text-[#38473F]">{product.default_margin}%</p></div><div><p className="text-[9px] text-[#9AA49F]">参考交期</p><p className="mt-1 text-[11px] font-medium text-[#38473F]">{product.lead_time || "—"}</p></div></div><div className="mt-3 flex justify-end gap-3"><button onClick={() => { setForm(product); setOpen(true); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-[10px] text-[#6255D3] hover:underline">编辑</button><button onClick={() => void remove(product)} className="text-[10px] text-[#A75A51] hover:underline">删除</button></div></article>)}</div>
    {!products.length ? <div className="rounded-2xl border border-dashed border-[#D9E2DD] bg-white py-16 text-center"><p className="text-[13px] font-medium text-[#52615A]">报价资料库还是空的</p><p className="mt-1 text-[10px] text-[#98A39D]">先录入产品资料，方便之后快速核价与制作报价单。</p></div> : null}
  </div></div></AppShell>;
}
