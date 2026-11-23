"use client";

import BrandLogo from "@/components/BrandLogo";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [selfHosted, setSelfHosted] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState("");
  useEffect(() => { fetch("/api/license/status").then((r) => r.json()).then((d) => { setSelfHosted(Boolean(d.selfHosted)); setSetupRequired(Boolean(d.setupRequired)); setLicenseMessage(d.authorized ? "" : d.message || ""); }).catch(() => {}); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      router.push("/dashboard");
    } else {
      setErr(data.error || "邮箱或密码错误");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <div className="w-[320px] rounded-xl border border-line bg-card p-8">
        <div className="mb-8 flex flex-col items-center gap-3">
          <BrandLogo size={52} />
          <div className="text-center">
            <p className="text-[15px] font-medium tracking-[3px] text-ink">NOVA</p>
            <p className="mt-1 text-[12px] text-faint">外贸获客智能体平台</p>
          </div>
        </div>
        <form onSubmit={submit}>
          {licenseMessage ? <div role="alert" className="mb-4 rounded-lg border border-[#E8D1A6] bg-[#FFF8E8] p-3 text-[12px] text-[#72531B]">{licenseMessage}</div> : null}
          <label className="mb-1 block text-[12px] text-muted">邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mb-3 w-full" placeholder="邮箱地址" />
          <label className="mb-1 block text-[12px] text-muted">登录密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full"
            placeholder="请输入密码"
            autoFocus
          />
          {err ? <p className="mt-2 text-[12px] text-[#A32D2D]">{err}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="mt-4 w-full rounded-md bg-[#16181A] py-2.5 text-[13px] text-white disabled:opacity-60"
          >
            {busy ? "登录中…" : "进入工作台"}
          </button>
        </form>
        {!selfHosted ? <p className="mt-5 text-center text-[11px] text-faint">新客户请联系 NOVA 管理员创建账户；收到邮箱和密码后直接登录。</p> : setupRequired ? <p className="mt-5 text-center text-[11px] text-muted">首次使用？ <Link className="font-medium text-[#5548C8] hover:underline" href="/register">创建管理员</Link></p> : <p className="mt-5 text-center text-[11px] text-faint">员工账号由本公司管理员创建。</p>}
      </div>
    </div>
  );
}
