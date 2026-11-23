"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";

type Msg = { role: "user" | "assistant"; content: string; actions?: string[] };

export default function AgentPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "你好，我是 NOVA 智能体。你可以让我：查客户、按国家/行业筛客户、新增客户、改状态、查报价单、生成报价单草稿、看平台统计。直接说就行。" },
  ]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [models,setModels] = useState<string[]>([]);
  const [custom,setCustom] = useState("");
  useEffect(()=>{fetch("/api/agent/models").then(r=>r.json()).then(d=>{setModels(d.models||[]);setModel(d.selected||"")}).catch(()=>{})},[]);
  async function chooseModel(value:string){setModel(value);await fetch("/api/agent/models",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:value})})}
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    const history = [...msgs, { role: "user" as const, content: text }];
    setMsgs(history);
    setBusy(true);
    try {
      const r = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "调用失败");
      setMsgs((prev) => [...prev, { role: "assistant", content: d.reply, actions: d.actions }]);
    } catch (e: any) {
      setError(e.message || "调用失败");
      setMsgs((prev) => [...prev, { role: "assistant", content: "调用失败：" + (e.message || "未知错误") }]);
    } finally {
      setBusy(false);
    }
  }

  const suggestions = ["有哪些美国客户", "查五金行业的客户", "新增客户 Acme Trading", "看平台统计", "查报价单"];

  return (
    <AppShell>
      <div className="flex h-screen flex-col">
        <header className="flex-none border-b border-line bg-card px-6 py-4">
          <div><h1 className="text-[18px] font-semibold text-ink">智能体</h1><p className="mt-1 text-[12px] text-faint">用自然语言查客户、筛线索、跟进销售和整理产品知识</p></div>
        </header>
        <div ref={boxRef} className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[78%] rounded-lg px-4 py-2.5 text-[13px] leading-relaxed ${m.role === "user" ? "bg-[#16181A] text-white" : "border border-line bg-card text-ink"}`}>
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.actions?.length ? (
                  <div className="mt-2 space-y-1 border-t border-[#F0F0EC] pt-2 text-[11px] text-muted">
                    {m.actions.map((a, j) => <div key={j} className="truncate">⚙ {a}</div>)}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {busy ? <div className="text-[12px] text-faint">正在思考…</div> : null}
        </div>
        <div className="flex-none border-t border-line bg-card px-6 py-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} className="rounded-full border border-line px-3 py-1 text-[11px] text-muted hover:bg-paper" onClick={() => setInput(s)}>
                {s}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted" htmlFor="agent-model">本次使用模型</label>
            <select id="agent-model" disabled={busy} value={model} onChange={e=>void chooseModel(e.target.value)} className="max-w-full text-xs"><option value="">使用设置中的默认模型</option>{models.map(m=><option key={m} value={m}>{m}</option>)}</select>
            <input aria-label="自定义模型 ID" value={custom} onChange={e=>setCustom(e.target.value)} placeholder="输入 DeepSeek 或兼容服务的模型 ID" className="w-72 max-w-full text-xs"/>
            <button disabled={busy||!custom.trim()} className="rounded border border-line px-3 py-2 text-xs" onClick={async()=>{const value=custom.trim();if(!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)){setError("请输入有效模型 ID");return}await chooseModel(value);setModels(prev=>Array.from(new Set([...prev,value])));setCustom("")}}>添加并使用</button>
            <span className="text-xs text-faint">沿用设置中的接口和 API Key；模型须由该接口支持。</span>
          </div>
          <div className="flex items-end gap-2">
            <textarea
              className="min-h-[44px] flex-1 resize-none"
              placeholder="输入指令，如：帮我查一下德国的客户"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="rounded-md bg-[#16181A] px-5 py-2.5 text-[13px] text-white disabled:opacity-50" disabled={busy || !input.trim()} onClick={send}>
              发送
            </button>
          </div>
          {error ? <p className="mt-1 text-[11px] text-[#A32D2D]">{error}</p> : null}
        </div>
      </div>
    </AppShell>
  );
}
