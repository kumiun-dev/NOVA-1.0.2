"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";

function dateText(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function ProfilePage() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [role, setRole] = useState("user");
  const [selfHosted, setSelfHosted] = useState(false);
  const [licenseExpires, setLicenseExpires] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/profile").then(async (response) => {
      if (!response.ok) throw new Error("登录已过期，请重新登录");
      const data = await response.json();
      setDisplayName(data.displayName || "");
      setEmail(data.email || "");
      setRole(data.role || "user");
      setSelfHosted(Boolean(data.selfHosted));
      setAuthorized(Boolean(data.authorized));
      setLicenseExpires(data.license?.expiresAt || "");
    }).catch((error) => setStatus(error instanceof Error ? error.message : "无法读取个人资料")).finally(() => setLoading(false));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, email, currentPassword, newPassword }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setDisplayName(data.displayName || displayName); setEmail(data.email || email); setNewPassword(""); setCurrentPassword("");
      window.dispatchEvent(new CustomEvent("nova-account-name", { detail: data.displayName }));
      setStatus("个人资料已保存");
    } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setSaving(false); }
  }

  return <AppShell><div className="mx-auto max-w-3xl px-5 py-8 lg:px-8">
    <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-[#6B5BD3]">ACCOUNT</p>
    <h1 className="text-[24px] font-semibold text-[#20202A]">个人资料</h1>
    <p className="mt-1 text-[13px] text-[#89909F]">管理登录邮箱、账户称呼和密码。</p>

    <section className="mt-6 rounded-2xl border border-[#E8E5F2] bg-white p-5 shadow-[0_5px_18px_rgba(50,43,92,0.05)] sm:p-6">
      <h2 className="text-[15px] font-semibold text-[#252333]">账户信息</h2>
      {loading ? <p className="mt-4 text-[12px] text-[#89909F]">正在读取…</p> : <form onSubmit={saveProfile} className="mt-4 space-y-4">
        <div><label htmlFor="profile-name" className="mb-1.5 block text-[11px] font-medium text-[#5F5B73]">账户称呼</label><input id="profile-name" required maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="例如：森哥" className="w-full rounded-lg border border-[#E4E1ED] px-3 py-2.5 text-[13px] outline-none focus:border-[#7868E4] focus:ring-2 focus:ring-[#7868E4]/10"/><p className="mt-1 text-[10px] text-[#9692A4]">右上角和首页问候会使用这个称呼。</p></div>
        <div><label htmlFor="profile-email" className="mb-1.5 block text-[11px] font-medium text-[#5F5B73]">登录邮箱</label><input id="profile-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="w-full rounded-lg border border-[#E4E1ED] px-3 py-2.5 text-[13px] outline-none focus:border-[#7868E4] focus:ring-2 focus:ring-[#7868E4]/10"/><p className="mt-1 text-[10px] text-[#9692A4]">注册后无需邮箱验证，使用邮箱和密码登录。</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="profile-current-password" className="mb-1.5 block text-[11px] font-medium text-[#5F5B73]">当前密码</label><input id="profile-current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" placeholder="修改邮箱或密码时必填" className="w-full rounded-lg border border-[#E4E1ED] px-3 py-2.5 text-[13px] outline-none focus:border-[#7868E4]"/></div><div><label htmlFor="profile-new-password" className="mb-1.5 block text-[11px] font-medium text-[#5F5B73]">新密码（可选）</label><input id="profile-new-password" type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" placeholder="至少 8 位；留空不修改" className="w-full rounded-lg border border-[#E4E1ED] px-3 py-2.5 text-[13px] outline-none focus:border-[#7868E4]"/></div></div>
        <div className="flex flex-wrap items-center gap-3"><button disabled={saving} className="rounded-lg bg-[#5B4BC4] px-4 py-2.5 text-[12px] font-semibold text-white hover:bg-[#4D3DAF] disabled:opacity-60">{saving ? "保存中…" : "保存资料"}</button>{status ? <span role="status" className="text-[11px] text-[#675BA0]">{status}</span> : null}</div>
      </form>}
    </section>

    {role === "admin" && selfHosted ? <section className="mt-5 rounded-2xl border border-[#E8E5F2] bg-white p-5 shadow-[0_5px_18px_rgba(50,43,92,0.05)] sm:p-6"><h2 className="text-[15px] font-semibold text-[#252333]">客户服务器授权</h2><p className="mt-1 text-[11px] text-[#89909F]">本实例由 NOVA 管理员授权。授权状态与续期由服务提供方管理。</p><p className="mt-3 text-[12px] text-[#5548C8]">{licenseExpires ? `有效期至 ${dateText(licenseExpires)}` : "授权有效"}</p><a href="/team" className="mt-4 inline-flex rounded-lg bg-[#5B4BC4] px-4 py-2.5 text-[12px] font-semibold text-white">管理员工与模块权限</a></section> : null}
  </div></AppShell>;
}
