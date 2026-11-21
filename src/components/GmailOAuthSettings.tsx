"use client";

import { useEffect, useState } from "react";

export default function GmailOAuthSettings() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [callback, setCallback] = useState("");
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法加载 Gmail 设置");
        setClientId(data.gmailOAuth.clientId);
        setConfigured(data.gmailOAuth.secretConfigured);
        setCallback(data.gmailOAuth.callback);
      })
      .catch(() => { if (!controller.signal.aborted) setMessage("无法加载 Gmail 设置"); });
    return () => controller.abort();
  }, []);

  return <form className="grid gap-3 pt-3 text-xs" onSubmit={async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gmail_oauth_save", clientId, clientSecret }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setConfigured(true);
      setClientSecret("");
      setMessage("已保存，可以添加 Gmail。更换 OAuth 客户端后，请重新授权已有邮箱。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }}>
    <p className="text-muted">启用 Gmail API，将下方地址登记到你自己的 Google 网页 OAuth 客户端。</p>
    <label>授权回调网址<input className="mt-1 w-full" readOnly value={callback} onFocus={(event) => event.target.select()} /></label>
    <label>Client ID<input className="mt-1 w-full" required value={clientId} onChange={(event) => setClientId(event.target.value)} /></label>
    <label>Client Secret<input className="mt-1 w-full" type="password" autoComplete="new-password" required={!configured}
      placeholder={configured ? "已保存，留空保留" : ""} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} /></label>
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={busy || !callback} className="rounded-lg bg-[#5548C8] px-3 py-2 text-white disabled:opacity-50">保存 Gmail 配置</button>
      {configured ? <a className="text-[#5548C8] hover:underline" href="/api/channels/google/auth">连接 Gmail</a> : null}
    </div>
    {message ? <p role="status">{message}</p> : null}
  </form>;
}
