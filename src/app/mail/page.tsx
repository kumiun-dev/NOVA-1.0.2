"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import type { MailProvider } from "@/lib/channel-connections";

type InboxMail = { id: string; from: string; subject: string; date: string; preview: string; body: string };
type MailAccount = { id: string; type: MailProvider; label: string };
const PROVIDER_NAME = { gmail: "Gmail", enterprise: "企业邮箱" };

export default function MailPage() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mails, setMails] = useState<InboxMail[]>([]);
  const [cfg, setCfg] = useState<{ smtp: boolean; imap: boolean } | null>(null);
  const [diag, setDiag] = useState<string>("");
  const [diagBusy, setDiagBusy] = useState(false);
  const [openedMail, setOpenedMail] = useState<InboxMail | null>(null);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const inboxRequest = useRef<AbortController | null>(null);

  const activeAccount = accounts.find((account) => account.id === active);

  async function loadInbox(account?: string) {
    inboxRequest.current?.abort();
    const controller = new AbortController();
    inboxRequest.current = controller;
    setCfg(null);
    setOpenedMail(null);
    setMails([]);
    setInboxError("");
    try {
      const response = await fetch(account ? `/api/mail/inbox?account=${encodeURIComponent(account)}` : "/api/mail/inbox", { signal: controller.signal, cache: "no-store" });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "暂时无法读取邮箱");
      setAccounts(data.accounts);
      setActive(data.account);
      setMails(data.mails);
      setCfg({ smtp: Boolean(data.smtp), imap: Boolean(data.imap) });
      if (data.error) setInboxError(data.error);
    } catch (error) {
      if (!controller.signal.aborted) setInboxError(error instanceof Error ? error.message : "暂时无法读取邮箱");
    }
  }

  useEffect(() => {
    const account = new URLSearchParams(window.location.search).get("account");
    void loadInbox(account || undefined);
    return () => inboxRequest.current?.abort();
  }, []);

  function changeAccount(account: string) {
    setActive(account);
    setDiag("");
    setMsg("");
    window.history.replaceState(null, "", `/mail?account=${encodeURIComponent(account)}`);
    void loadInbox(account);
  }

  async function disconnectMail() {
    if (!activeAccount || !window.confirm(`退出 ${activeAccount.label}？`)) return;
    setDisconnecting(true);
    setDiag("");
    try {
      const response = await fetch(`/api/mail/account?account=${encodeURIComponent(activeAccount.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "退出邮箱失败");
      window.history.replaceState(null, "", "/mail");
      await loadInbox();
      setDiag(data.message);
    } catch (error) {
      setDiag(error instanceof Error ? error.message : "退出邮箱失败");
    } finally {
      setDisconnecting(false);
    }
  }

  async function checkChannel() {
    setDiagBusy(true);
    setDiag("检测中…（首次会先握手，约 5–15 秒）");
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mail_test", account: active }),
      });
      const d = await r.json();
      const via = (v: string) => (v === "proxy" ? "经代理" : v === "direct" ? "直连" : v);
      setDiag(
        `发信 ${d.smtp?.ok ? "✅" : "❌"} ${d.smtp?.message || ""}${d.smtp?.via && d.smtp.via !== "-" ? `（${via(d.smtp.via)}）` : ""}\n` +
          `收信 ${d.imap?.ok ? "✅" : "❌"} ${d.imap?.message || ""}${d.imap?.via && d.imap.via !== "-" ? `（${via(d.imap.via)}）` : ""}`
      );
    } catch {
      setDiag("检测请求失败，请确认本地服务在运行");
    } finally {
      setDiagBusy(false);
    }
  }

  async function send() {
    if (!to.trim() || !subject.trim() || !text.trim()) { setMsg("收件人、主题、正文都不能为空"); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/mail/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, text, account: active }) });
      const d = await r.json();
      setMsg(d.message || d.error || "已发送");
      if (r.ok) { setTo(""); setSubject(""); setText(""); }
    } catch {
      setMsg("发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="min-h-screen px-6 py-5">
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[15px] font-medium text-ink">邮件</h1>
            <p className="text-[12px] text-faint">写邮件发客户，收件箱接客户回信</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {accounts.length ? (
              <select aria-label="当前邮箱" className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-ink" value={activeAccount?.id || ""} disabled={busy || diagBusy || disconnecting} onChange={(event) => changeAccount(event.target.value)}>
                {!activeAccount ? <option value="" disabled>选择邮箱</option> : null}
                {accounts.map((account) => <option key={account.id} value={account.id}>{PROVIDER_NAME[account.type]}{account.label ? ` · ${account.label}` : ""}</option>)}
              </select>
            ) : null}
            <a href="/channels#email-connections" className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-[#5548C8]">添加邮箱</a>
            {activeAccount ? <>
              <button className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-muted hover:text-ink disabled:opacity-50" disabled={diagBusy || disconnecting} onClick={checkChannel}>{diagBusy ? "检测中…" : "通道自检"}</button>
              <button className="rounded-md border border-line bg-card px-3 py-1.5 text-[12px] text-muted hover:text-red-700 disabled:opacity-50" disabled={busy || diagBusy || disconnecting} onClick={() => void disconnectMail()}>{disconnecting ? "正在退出…" : "退出邮箱"}</button>
            </> : null}
          </div>
        </header>

        {diag ? (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-line bg-card px-4 py-3 text-[12px] text-muted">
            {diag}
          </div>
        ) : null}

        {cfg && !cfg.smtp ? (
          <div className="mb-4 rounded-lg border border-[#E6D8B8] bg-[#FBF7EC] px-4 py-3 text-[12px] text-[#8A6D1F]">
            当前邮箱无法发信。请添加邮箱，或检查当前邮箱的授权和发信配置。
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-card p-4">
            <p className="mb-3 text-[12px] text-ink">写邮件</p>
            <input className="mb-2 w-full" placeholder="收件人邮箱" value={to} onChange={(e) => setTo(e.target.value)} />
            <input className="mb-2 w-full" placeholder="主题" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <textarea className="mb-3 h-48 w-full" placeholder="正文内容…" value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex items-center gap-3">
              <button className="rounded-md bg-[#16181A] px-5 py-2 text-[12px] text-white disabled:opacity-50" disabled={busy || disconnecting || !cfg?.smtp} onClick={send}>
                {busy ? "发送中…" : "发送"}
              </button>
              <span className="text-[11px] text-faint">{msg}</span>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] text-ink">收件箱</p>
              <button className="text-[11px] text-muted hover:text-ink disabled:opacity-50" disabled={disconnecting} onClick={() => void loadInbox(active ?? undefined)}>刷新</button>
            </div>
            {inboxError ? (
              <p role="status" className="py-8 text-center text-[12px] text-faint">{inboxError}</p>
            ) : cfg && !cfg.imap ? (
              <p className="py-8 text-center text-[12px] text-faint">当前邮箱尚未配置收信。</p>
            ) : !cfg ? (
              <p className="py-8 text-center text-[12px] text-faint">加载中…</p>
            ) : mails.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-faint">暂无邮件</p>
            ) : (
              <div className="space-y-2">
                {mails.map((m) => (
                  <button key={m.id} type="button" onClick={() => setOpenedMail(m)} className="block w-full rounded-lg border border-line p-3 text-left transition hover:border-[#C9C4F5] hover:bg-[#FCFBFF]">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[12px] font-medium text-ink">{m.from || "未知"}</span>
                      <span className="flex-none text-[10px] text-faint">{m.date}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">{m.subject}</div>
                    {m.preview ? <div className="mt-1 line-clamp-2 text-[11px] text-faint">{m.preview}</div> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {openedMail ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpenedMail(null)}><div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}><div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5"><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-wider text-[#7167C8]">邮件详情</p><h2 className="mt-1 break-words text-[18px] font-semibold text-ink">{openedMail.subject || "(无主题)"}</h2><p className="mt-2 break-all text-[12px] text-muted">发件人：{openedMail.from}</p><p className="mt-1 text-[11px] text-faint">{openedMail.date}</p></div><button onClick={() => setOpenedMail(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[20px] text-faint hover:bg-paper" aria-label="关闭">×</button></div><div className="overflow-y-auto px-6 py-5"><pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-7 text-ink">{openedMail.body || openedMail.preview || "（邮件正文为空）"}</pre></div></div></div> : null}
    </AppShell>
  );
}
