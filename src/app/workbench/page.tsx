"use client";

import { useEffect, useRef, useState } from "react";
import AppShell, { NavIcon } from "@/components/AppShell";
import SalesWorkspace from "./SalesWorkspace";

type Item = {
  id: number;
  channel: string;
  sender: string;
  subject: string;
  body: string;
  classification: string;
  draft: string;
  state: string;
  created_at: string;
  company: string;
  lead_name: string;
  translated_body?: string;
  language?: string;
};

const CLASS_COLOR: Record<string, string> = {
  有意向: "#2E7D5B",
  要报价单: "#925B1B",
  暂缓: "#A32D2D",
  休假: "#6B6F76",
  待分类: "#6B6F76",
};
const actionButton = "rounded-lg border border-line px-3 py-2 text-xs text-muted hover:bg-paper disabled:opacity-50";

function senderName(item: Item) {
  return item.sender || item.lead_name || item.company || "未知发件人";
}

async function post<T>(path: string, body: object, fallback: string): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.error || fallback);
  return data;
}

export default function WorkbenchPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [queueError, setQueueError] = useState("");
  const [revision, reloadQueue] = useState(0);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"send" | "assist" | null>(null);
  const [actionError, setActionError] = useState("");
  const [sendMessage, setSendMessage] = useState("");
  const [translation, setTranslation] = useState<Record<number, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const queueHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/inbox", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "队列加载失败");
        if (!controller.signal.aborted) {
          setItems(data.inbox || []);
          setQueueError("");
        }
      })
      .catch(() => { if (!controller.signal.aborted) setQueueError("队列加载失败，请刷新页面重试。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    if (activeId !== null && !dialog.current?.open) dialog.current?.showModal();
  }, [activeId]);

  function updateItem(id: number, fields: Partial<Item>) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...fields } : item));
  }

  function editDraft(id: number, draft: string) {
    updateItem(id, { draft });
    setTranslation((current) => ({ ...current, [id]: "" }));
  }

  async function runAction(kind: "send" | "assist", action: () => Promise<void>) {
    setBusy(kind);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "操作失败，请重试。");
    } finally {
      setBusy(null);
    }
  }

  function approve(item: Item) {
    return runAction("send", async () => {
      const data = await post<{ message?: string }>("/api/inbox/send", {
        id: item.id, text: item.draft, translatedText: translation[item.id] || "",
      }, "发送失败");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSendMessage(data.message || "回复已发送");
      window.dispatchEvent(new Event("nova-inbox-updated"));
      dialog.current?.close();
      queueHeading.current?.focus();
      reloadQueue((value) => value + 1);
    });
  }

  function translateIncoming(item: Item) {
    return runAction("assist", async () => {
      const data = await post<{ translated: string }>("/api/translate", {
        text: item.body, target: "zh", inboxId: item.id,
      }, "翻译失败");
      updateItem(item.id, { translated_body: data.translated, language: item.language || "en" });
    });
  }

  function translateReply(item: Item) {
    return runAction("assist", async () => {
      const data = await post<{ translated: string }>("/api/translate", {
        text: item.draft, target: item.language || "en",
      }, "翻译失败");
      setTranslation((current) => ({ ...current, [item.id]: data.translated }));
    });
  }

  function aiClassify(item: Item) {
    return runAction("assist", async () => {
      const data = await post<{ classification: string; draft: string }>("/api/ai", {
        body: item.body, channel: item.channel,
      }, "AI 调用失败");
      editDraft(item.id, data.draft);
      updateItem(item.id, { classification: data.classification });
    });
  }

  const pending = items.filter((item) => item.state === "待批准");
  const active = pending.find((item) => item.id === activeId);
  const classification = active?.classification || "待分类";
  const classificationColor = CLASS_COLOR[classification] || CLASS_COLOR.待分类;
  const activeTranslation = active ? translation[active.id] || "" : "";

  return (
    <AppShell pending={pending.length}>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <SalesWorkspace pendingQueue={
          <section aria-labelledby="queue-heading" className="relative h-[200px] min-w-0 overflow-hidden rounded-2xl border border-line bg-white shadow-sm md:h-auto">
            <div className="absolute inset-0 flex flex-col px-3 pb-2 pt-3 sm:px-4">
              <header className="mb-1.5 flex shrink-0 items-center gap-2 px-1">
                <span className="text-[#6853C8]"><NavIcon name="chat" /></span>
                <h3 id="queue-heading" ref={queueHeading} tabIndex={-1} className="shrink-0 text-sm font-semibold text-ink">待处理队列</h3>
                {!loading && !queueError ? <span className="rounded-full bg-[#F0EDFC] px-2 py-0.5 text-xs font-medium tabular-nums text-[#5945BF]">{pending.length}</span> : null}
                <span role="status" className="ml-auto truncate text-xs text-[#2E7D5B]" title={sendMessage}>{sendMessage}</span>
              </header>
              {pending.length ? (
                <ul aria-label="待处理消息" className="min-h-0 flex-1 divide-y divide-[#EEEBF3] overflow-y-auto overscroll-contain px-1 [scrollbar-gutter:stable]">
                  {pending.map((item) => {
                    const preview = item.body || item.subject || "查看消息";
                    const timestamp = item.created_at?.slice(0, 16).replace("T", " ");
                    return (
                      <li key={item.id}>
                        <button type="button" aria-haspopup="dialog"
                          className="group grid min-h-[30px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1 text-left text-xs hover:bg-[#F5F2FE] focus-visible:bg-[#F5F2FE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8672D4]"
                          onClick={(event) => {
                            trigger.current = event.currentTarget;
                            setActiveId(item.id);
                            setActionError("");
                            setSendMessage("");
                          }}>
                          <span aria-hidden="true" className="grid h-4 w-4 place-items-center rounded border border-[#D9D1EF] bg-[#F5F2FE] font-semibold leading-none text-[#6853C8] group-hover:border-[#A392D7]">›</span>
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="max-w-[55%] shrink-0 truncate font-semibold text-ink">{senderName(item)}</span>
                            <span className="min-w-0 truncate text-muted">{preview}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2.5 text-muted">
                            <span className="hidden rounded bg-[#F3F1F8] px-1.5 py-0.5 lg:inline">{item.channel}</span>
                            {timestamp ? <time dateTime={item.created_at} title={timestamp} className="text-[11px] tabular-nums">{timestamp.slice(5)}</time> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p role={queueError ? "alert" : undefined} className="grid flex-1 place-items-center px-2 text-center text-sm text-muted">
                  {queueError || (loading ? "正在加载消息…" : "暂无待处理消息")}
                </p>
              )}
            </div>
          </section>
        } />
        <dialog ref={dialog} aria-labelledby="queue-message-heading"
          className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-[#19132F]/40"
          onCancel={(event) => { if (busy) event.preventDefault(); }}
          onClose={() => {
            setActiveId(null);
            if (trigger.current?.isConnected) trigger.current.focus();
          }}>
          {active ? <div className="space-y-4 p-5 sm:p-6">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="queue-message-heading" className="break-words text-lg font-semibold">{senderName(active)}</h2>
                <p className="mt-1 break-words text-xs text-muted">{[active.channel, active.company !== senderName(active) && active.company].filter(Boolean).join(" · ")}</p>
              </div>
              <button type="button" autoFocus className={actionButton} disabled={busy !== null} onClick={() => dialog.current?.close()}>关闭</button>
            </header>
            <div className="rounded-xl bg-[#F8F7FB] px-3.5 py-3">
              <span className="rounded px-1.5 py-0.5 text-xs font-medium" style={{ backgroundColor: classificationColor + "16", color: classificationColor }}>AI 分类 · {classification}</span>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{active.body || active.subject}</p>
              {active.translated_body ? <div className="mt-3 rounded-lg bg-[#F0EDFC] px-3 py-2.5">
                <p className="mb-1 text-xs font-medium text-[#5945BF]">中文翻译</p>
                <p className="whitespace-pre-wrap break-words text-sm">{active.translated_body}</p>
              </div> : <button type="button" className="mt-2 text-xs text-[#5548C8] hover:underline disabled:opacity-50" disabled={busy !== null || !active.body} onClick={() => translateIncoming(active)}>翻译成中文</button>}
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium" htmlFor="queue-reply">回复内容</label>
              <textarea id="queue-reply" className="w-full text-sm" rows={3} value={active.draft || ""} placeholder="输入回复…" disabled={busy !== null}
                onChange={(event) => editDraft(active.id, event.target.value)} />
              {active.draft?.trim() ? <button type="button" className="mt-1 text-xs text-[#5548C8] hover:underline disabled:opacity-50" disabled={busy !== null} onClick={() => translateReply(active)}>翻译为客户语言</button> : null}
              {activeTranslation ? <textarea className="mt-2 w-full border-[#DCD8FF] bg-[#F8F7FF] text-sm" rows={2} value={activeTranslation} disabled={busy !== null}
                onChange={(event) => setTranslation((current) => ({ ...current, [active.id]: event.target.value }))} aria-label="客户语言译文" /> : null}
            </div>
            {actionError ? <p role="alert" className="break-words rounded-lg bg-[#FFF1EE] px-3 py-2 text-xs text-[#9B3127]">{actionError}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={actionButton} disabled={busy !== null} onClick={() => aiClassify(active)}>让 AI 重新分类/起草</button>
              {classification === "要报价单" ? <a href="/quotes" className={actionButton}>生成报价单</a> : null}
              <button type="button" className="ml-auto rounded-lg bg-[#5947C9] px-3 py-2 text-xs font-semibold text-white hover:bg-[#4937B6] disabled:opacity-50"
                disabled={busy !== null || !(activeTranslation.trim() || active.draft?.trim())} onClick={() => approve(active)}>
                {busy === "send" ? "发送中…" : "发送回复"}
              </button>
            </div>
          </div> : null}
        </dialog>
      </div>
    </AppShell>
  );
}
