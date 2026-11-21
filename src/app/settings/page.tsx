"use client";
import CustomerSocialSettings from "@/components/CustomerSocialSettings";

import GmailOAuthSettings from "@/components/GmailOAuthSettings";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 rounded-lg border border-line bg-card px-5 py-4">
      <p className="mb-3 text-[11px] tracking-[0.6px] text-faint">{title}</p>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-[12px] text-ink">{children}</label>;
}

export default function SettingsPage() {
  const [ai, setAi] = useState({ base_url: "https://api.deepseek.com", model: "deepseek-flash", key: "", key_configured: false });
  const [ch, setCh] = useState({ evolution_url: "", evolution_key: "" });
  const [mail, setMail] = useState({ smtp_host: "", smtp_port: "465", smtp_secure: "true", smtp_user: "", smtp_pass: "", smtp_from: "", imap_host: "", imap_port: "993", imap_secure: "true", imap_user: "", imap_pass: "" });
  const [aiMsg, setAiMsg] = useState("");
  const [channelMsg, setChannelMsg] = useState("");
  const [mailMsg, setMailMsg] = useState("");
  const [mailId, setMailId] = useState("new");
  const [mailAccounts, setMailAccounts] = useState<{ id: string; label: string }[]>([]);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [mailPasswords, setMailPasswords] = useState({ smtp: false, imap: false });
  const [mailReady, setMailReady] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingAi, setSavingAi] = useState(false);
  const [savingChannels, setSavingChannels] = useState(false);
  const [savingMail, setSavingMail] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [platformStatus, setPlatformStatus] = useState({ evolutionKey: false });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get("mailAccount") || "";
    setGmailOpen(params.get("configure") === "gmail" || window.location.hash === "#gmail-settings");
    setEnterpriseOpen(Boolean(selected) || window.location.hash === "#mail-settings");
    fetch(`/api/settings?mailAccount=${encodeURIComponent(selected)}`).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "无法读取配置");
      return data;
    }).then((d) => {
      setIsAdmin(Boolean(d.platform));
      setAi({ base_url: d.ai.base_url, model: d.ai.model, key: "", key_configured: d.ai.key_configured });
      if (d.platform) {
        setPlatformStatus({ evolutionKey: Boolean(d.platform.evolution_key_configured) });
      }
      const platform = d.platform || {};
      setCh({
        evolution_url: String(platform.evolution_url || ""),
        evolution_key: "",
      });
      setMail((current) => Object.fromEntries(Object.keys(current).map((key) => [key, d.mail[key] || ""])) as typeof current);
      setMailId(d.mail.id);
      setMailAccounts(d.enterpriseAccounts);
      setMailPasswords({ smtp: d.mail.smtp_pass_configured, imap: d.mail.imap_pass_configured });
      setMailReady(true);
      if (params.has("saved")) setMailMsg("邮箱配置已保存");
    }).catch((error) => setMailMsg(error.message));
  }, []);

  async function saveValues(values: Record<string, string>) {
    const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok !== true) throw new Error(data.error || `保存失败（HTTP ${response.status}）`);
    return data;
  }

  function aiPayload() {
    const values: Record<string, string> = { ai_base_url: ai.base_url, ai_model: ai.model };
    if (ai.key.trim()) values.ai_key = ai.key.trim();
    return values;
  }

  function stringPayload<T extends Record<string, string>>(values: T) {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim() !== "").map(([key, value]) => [key, value.trim()]));
  }

  async function saveAi() {
    setSavingAi(true); setAiMsg("");
    try {
      await saveValues(aiPayload());
      setAiMsg("AI 配置已保存");
    } catch (error) {
      setAiMsg(error instanceof Error ? error.message : "保存失败，请检查网络后重试");
    } finally {
      setSavingAi(false);
    }
  }

  async function saveChannels() {
    setSavingChannels(true); setChannelMsg("");
    try {
      await saveValues(stringPayload(ch));
      if (ch.evolution_key.trim()) setPlatformStatus({ evolutionKey: true });
      setCh((current) => ({ ...current, evolution_key: "" }));
      setChannelMsg("WhatsApp 服务配置已保存");
    }
    catch (error) { setChannelMsg(error instanceof Error ? error.message : "渠道配置保存失败，请检查网络后重试"); }
    finally { setSavingChannels(false); }
  }

  async function saveMail() {
    setSavingMail(true); setMailMsg("");
    try {
      const { id } = await saveValues({ ...mail, action: "mail_save", account: mailId });
      window.location.href = `/settings?mailAccount=${encodeURIComponent(id)}&saved=1#mail-settings`;
    }
    catch (error) { setMailMsg(error instanceof Error ? error.message : "邮箱配置保存失败，请检查网络后重试"); }
    finally { setSavingMail(false); }
  }

  async function test() {
    setTesting(true); setAiMsg("");
    try {
      await saveValues(aiPayload());
      const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test" }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `连接测试失败（HTTP ${r.status}）`);
      setAiMsg(d.ok ? `连接成功 · 模型返回：${d.message}` : `连接失败 · ${d.message}`);
    } catch (error) {
      setAiMsg(error instanceof Error ? error.message : "测试失败，请检查网络后重试");
    } finally {
      setTesting(false);
    }
  }

  const set = (k: keyof typeof ch) => (e: React.ChangeEvent<HTMLInputElement>) => setCh({ ...ch, [k]: e.target.value });
  const setM = (k: keyof typeof mail) => (e: React.ChangeEvent<HTMLInputElement>) => setMail({ ...mail, [k]: e.target.value });

  return (
    <AppShell pending={0}>
      <div className="max-w-2xl px-6 py-5">
        <h1 className="mb-4 text-[15px] font-medium text-ink">设置</h1>

        <Section title="AI 模型（填完即可用）">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>接口地址 base_url</Label>
              <input className="w-full" value={ai.base_url} onChange={(e) => setAi({ ...ai, base_url: e.target.value })} />
            </div>
            <div>
              <Label>默认模型 model</Label>
              <select className="w-full" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })}>
                <option value="deepseek-flash">deepseek-flash（默认 · 便宜快）</option>
                <option value="deepseek-v4-pro">deepseek-v4-pro（复杂长文）</option>
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Label>API Key {ai.key_configured ? <span className="text-[#2E7D5B]">（已配置）</span> : <span className="text-[#A32D2D]">（未配置）</span>}</Label>
            <input className="w-full" type="password" placeholder={ai.key_configured ? "留空表示不修改" : "粘贴 DeepSeek API Key"} value={ai.key} onChange={(e) => setAi({ ...ai, key: e.target.value })} />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={savingAi} onClick={saveAi}>
              {savingAi ? "保存中…" : "保存 AI 配置"}
            </button>
            <button className="rounded-md border border-line px-4 py-1.5 text-[12px] text-ink disabled:opacity-50" disabled={testing || savingAi} onClick={test}>
              {testing ? "测试中…" : "保存并测试连接"}
            </button>
            {aiMsg ? <span className="text-[12px] text-muted">{aiMsg}</span> : null}
          </div>
        </Section>

        <CustomerSocialSettings />

        <details id="gmail-settings" open={gmailOpen} onToggle={(event) => setGmailOpen(event.currentTarget.open)} className="my-4 rounded-xl border border-line bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">我的 Gmail OAuth</summary><GmailOAuthSettings /></details>
        <details id="mail-settings" open={enterpriseOpen} onToggle={(event) => setEnterpriseOpen(event.currentTarget.open)} className="my-4 rounded-xl border border-line bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold">企业邮箱配置（SMTP 发信 / IMAP 收信）</summary>
          <div className="mt-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select aria-label="配置的企业邮箱" className="min-w-40" value={mailId} disabled={!mailReady || savingMail} onChange={(event) => { window.location.href = `/settings?mailAccount=${encodeURIComponent(event.target.value)}#mail-settings`; }}>
              <option value="new">添加企业邮箱</option>
              {mailAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
            </select>
            <Link href="/channels#email-connections" className="text-[12px] text-[#5548C8]">查看邮箱连接</Link>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>SMTP 服务器（发信）</Label>
              <input className="w-full" value={mail.smtp_host} onChange={setM("smtp_host")} placeholder="smtp.exmail.qq.com" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>端口</Label>
                <input className="w-full" value={mail.smtp_port} onChange={setM("smtp_port")} placeholder="465" />
              </div>
              <div>
                <Label>SSL</Label>
                <select className="w-full" value={mail.smtp_secure} onChange={(e) => setMail({ ...mail, smtp_secure: e.target.value })}>
                  <option value="true">是（465）</option>
                  <option value="false">否（587）</option>
                </select>
              </div>
            </div>
            <div>
              <Label>发信账号</Label>
              <input className="w-full" value={mail.smtp_user} onChange={setM("smtp_user")} placeholder="sales@你的域名.com" />
            </div>
            <div>
              <Label>发信密码 / 授权码</Label>
              <input className="w-full" type="password" value={mail.smtp_pass} onChange={setM("smtp_pass")} placeholder={mailPasswords.smtp ? "已保存授权码" : "邮箱授权码"} />
            </div>
            <div className="col-span-2">
              <Label>发件人显示名（可选）</Label>
              <input className="w-full" value={mail.smtp_from} onChange={setM("smtp_from")} placeholder="NOVA Sales &lt;sales@你的域名.com&gt;" />
            </div>
            <div>
              <Label>IMAP 服务器（收信）</Label>
              <input className="w-full" value={mail.imap_host} onChange={setM("imap_host")} placeholder="imap.exmail.qq.com" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>端口</Label>
                <input className="w-full" value={mail.imap_port} onChange={setM("imap_port")} placeholder="993" />
              </div>
              <div>
                <Label>SSL</Label>
                <select className="w-full" value={mail.imap_secure} onChange={(e) => setMail({ ...mail, imap_secure: e.target.value })}>
                  <option value="true">是</option>
                  <option value="false">否</option>
                </select>
              </div>
            </div>
            <div>
              <Label>收信账号</Label>
              <input className="w-full" value={mail.imap_user} onChange={setM("imap_user")} placeholder="sales@你的域名.com" />
            </div>
            <div>
              <Label>收信密码 / 授权码</Label>
              <input className="w-full" type="password" value={mail.imap_pass} onChange={setM("imap_pass")} placeholder={mailPasswords.imap ? "已保存授权码" : "邮箱授权码"} />
            </div>
          </div>
          <div className="mt-4">
            <button className="rounded-md bg-[#16181A] px-4 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={savingMail || !mailReady} onClick={saveMail}>
              {savingMail ? "保存中…" : "保存邮件配置"}
            </button>
            {mailMsg ? <span className="ml-3 text-[12px] text-muted">{mailMsg}</span> : null}
          </div>
          <p className="mt-2 text-[11px] text-faint">推荐用企业邮箱（自己域名）或 QQ 邮箱/163 邮箱，密码填「授权码」不是登录密码。新域名发信先低量预热。</p>
          </div>
        </details>

      </div>
    </AppShell>
  );
}
