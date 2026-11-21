"use client";
import { useEffect, useState } from "react";

export default function CustomerSocialSettings() {
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saved, setSaved] = useState(false);
  const [callback, setCallback] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/customer-social-settings").then(async response => {
      if (!response.ok) return;
      const data = await response.json(); setSaved(data.configured); setCallback(data.callback); setReady(true);
    }).catch(() => {});
  }, []);
  if (!ready) return null;
  return <details className="my-4 rounded-xl border border-line bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold">本公司社媒接入配置</summary>
    <form className="mt-4 space-y-3 text-xs" onSubmit={async event => {
      event.preventDefault(); setMessage("");
      try {
        const response = await fetch("/api/customer-social-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: key, webhookSecret: secret }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        setSaved(true); setKey(""); setSecret(""); setMessage("已保存，管理员和员工可连接各自的社媒账号。");
      } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    }}>
      <label className="block">本公司 社媒服务 API Key {saved ? "（已配置，留空保留）" : ""}<input className="mt-1 w-full" type="password" autoComplete="new-password" value={key} onChange={event => setKey(event.target.value)} /></label>
      <label className="block">Webhook 签名密钥<input className="mt-1 w-full" type="password" autoComplete="new-password" value={secret} onChange={event => setSecret(event.target.value)} /></label>
      <label className="block">本公司回调网址<input readOnly className="mt-1 w-full" value={callback} /></label>
      <p>在你自己的 社媒服务 后台登记回调网址，使用相同签名密钥，订阅 message.received 和 account.disconnected。</p>
      <button className="rounded-lg bg-[#5548C8] px-3 py-2 text-white">保存社媒配置</button>
      <p role="status">{message}</p>
    </form>
  </details>;
}
