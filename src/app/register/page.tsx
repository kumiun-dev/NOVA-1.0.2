"use client";

import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selfHosted, setSelfHosted] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [modeLoaded, setModeLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch("/api/license/status").then((r) => r.json()).then((d) => { setSelfHosted(Boolean(d.selfHosted)); setSetupRequired(Boolean(d.setupRequired)); }).catch(() => {}).finally(() => setModeLoaded(true)); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, displayName }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "注册失败");
      router.push("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "注册失败，请重试"); }
    finally { setBusy(false); }
  }

  return <div className="flex min-h-screen items-center justify-center bg-paper px-4"><div className="w-full max-w-[360px] rounded-xl border border-line bg-card p-7 shadow-sm">
    <div className="mb-6 flex flex-col items-center gap-3"><BrandLogo size={48}/><div className="text-center"><p className="text-[15px] font-semibold tracking-[3px] text-ink">NOVA</p><p className="mt-1 text-[12px] text-faint">{selfHosted ? "客户服务器管理员注册" : "客户账户由管理员创建"}</p></div></div>
    {modeLoaded && (!selfHosted || setupRequired) ? <form onSubmit={submit}>
      {selfHosted ? <><label htmlFor="register-name" className="mb-1 block text-[12px] text-muted">管理员称呼（可选）</label><input id="register-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mb-3 w-full" placeholder="你的称呼" autoComplete="name"/></> : null}
      <label htmlFor="register-email" className="mb-1 block text-[12px] text-muted">邮箱</label><input id="register-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3 w-full" placeholder="you@example.com" autoComplete="email"/>
      <label htmlFor="register-password" className="mb-1 block text-[12px] text-muted">密码</label><input id="register-password" required minLength={8} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mb-3 w-full" placeholder="至少 8 位" autoComplete="new-password"/>
      {error ? <p role="alert" className="mt-3 text-[12px] text-[#A32D2D]">{error}</p> : null}
      {success ? <p role="status" className="mt-3 rounded-lg border border-[#CBE8D5] bg-[#EFF9F2] p-3 text-[12px] text-[#276A43]">{success}</p> : null}
      <button disabled={busy} className="mt-5 w-full rounded-md bg-[#5548C8] py-2.5 text-[13px] font-medium text-white disabled:opacity-60">{busy ? "创建中…" : "创建账户"}</button>
    </form> : modeLoaded && selfHosted ? <p className="rounded-lg border border-[#E8D1A6] bg-[#FFF8E8] p-3 text-[12px] text-[#72531B]">此服务器已完成管理员注册。如需使用，请返回登录；员工账号由客户管理员创建。</p> : modeLoaded ? <div className="rounded-lg border border-[#DCD6FA] bg-[#F8F6FF] p-3 text-[12px] leading-6 text-[#5E5878]">托管客户账户由 NOVA 管理员在客户管理页创建。请联系管理员获取登录邮箱和密码，然后直接登录。</div> : null}
    <p className="mt-2 text-center text-[11px] text-muted">已有账户？ <Link href="/login" className="font-medium text-[#5548C8] hover:underline">返回登录</Link></p>
  </div></div>;
}
