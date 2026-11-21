"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatFab() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "assistant", content: "我是 NOVA 智能体，可以帮你查客户、筛线索、改状态、出报价单。有什么要做的？" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [msgs, busy, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = [...msgs, { role: "user" as const, content: text }];
    setMsgs(history);
    setBusy(true);
    try {
      const r = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const d = await r.json();
      const reply = r.ok ? d.reply : "调用失败：" + (d.error || "未知错误");
      setMsgs((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "assistant", content: "调用失败：" + (e.message || "未知错误") }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open ? (
        <div className="fixed bottom-20 right-4 z-50 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-xl border border-line bg-card shadow-[0_8px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between border-b border-line bg-[#16181A] px-4 py-3">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 76 76"><path d="M31 56 L38 16 L45 56 Z" fill="#FAFAF9" /><path d="M33 40 L43 40 L42 33 L34 33 Z" fill="#16181A" /></svg>
              <span className="text-[13px] font-medium text-white">NOVA 智能体</span>
            </div>
            <button className="text-[13px] text-white/70 hover:text-white" onClick={() => setOpen(false)}>×</button>
          </div>
          <div ref={boxRef} className="flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[12px] leading-relaxed ${m.role === "user" ? "bg-[#16181A] text-white" : "border border-line bg-paper text-ink"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {busy ? <div className="text-[11px] text-faint">思考中…</div> : null}
          </div>
          <div className="flex items-center gap-2 border-t border-line p-2">
            <input
              className="flex-1 text-[12px]"
              placeholder="查客户 / 改状态 / 出报价单…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            />
            <button className="rounded-md bg-[#16181A] px-3 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={busy || !input.trim()} onClick={send}>
              发送
            </button>
          </div>
        </div>
      ) : null}
      <button
        className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#16181A] text-white shadow-[0_6px_24px_rgba(0,0,0,0.25)] hover:scale-105"
        onClick={() => setOpen((v) => !v)}
        title="NOVA 智能体"
      >
        {open ? (
          <span className="text-[20px] leading-none">×</span>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 3 L4 6.5 V12 C4 16.5 7.4 20.6 12 21 C16.6 20.6 20 16.5 20 12 V6.5 Z" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="11" r="2.4" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}
