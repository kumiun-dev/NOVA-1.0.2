"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { AUTHORIZATION_RESULT, createAuthorizationTab, publishAuthorizationResult } from "@/lib/channel-authorization";
import type { WhatsAppConnectionState } from "@/lib/evolution";
import type { ZernioPlatform } from "@/lib/channel-connections";

function BrandIcon({ d, color, gradient, size = 22 }: { d: string; color?: string; gradient?: { id: string; from: string; to: string }; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {gradient ? (
        <>
          <defs>
            <linearGradient id={gradient.id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={gradient.from} />
              <stop offset="1" stopColor={gradient.to} />
            </linearGradient>
          </defs>
          <path d={d} fill={`url(#${gradient.id})`} />
        </>
      ) : (
        <path d={d} fill={color} />
      )}
    </svg>
  );
}

function GoogleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

const ICONS = {
  whatsapp:
    "M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z",
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0z",
};

type PillState = "connected" | "pending" | "manual" | "action";
type WhatsAppDisplayState = WhatsAppConnectionState | "checking" | "unknown";

const WHATSAPP_STATUS_LABEL: Record<WhatsAppDisplayState, string> = {
  checking: "检查中",
  unknown: "暂时无法查询",
  not_configured: "待配置",
  not_linked: "可扫码登录",
  open: "已连接",
  close: "已断开",
  connecting: "连接中",
};

const CONNECTION_NAME = {
  whatsapp: "WhatsApp", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", gmail: "Gmail", enterprise: "企业邮箱",
} as const;
type ChannelConnection = keyof typeof CONNECTION_NAME;

function StatusPill({ state, text }: { state: PillState; text: string }) {
  const map: Record<PillState, { dot: string; cls: string }> = {
    connected: { dot: "#34A853", cls: "bg-[#E9F7EE] text-[#1E7B45]" },
    pending: { dot: "#F5A623", cls: "bg-[#FDF4E3] text-[#9A6A12]" },
    manual: { dot: "#9AA3AE", cls: "bg-[#F2F4F7] text-[#667085]" },
    action: { dot: "#3B82F6", cls: "bg-[#EAF2FE] text-[#1D5FC2]" },
  };
  const s = map[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {text}
    </span>
  );
}

type Account = { id: string; label: string; provider?: "zernio"; status?: "connected" | "expired" };
type WhatsAppAccount = Account & { state: WhatsAppDisplayState; ownerSuffix?: string };
type Connections = {
  configured: { meta: boolean; gmail: boolean; zernio: boolean };
  facebook: Account[];
  instagram: Account[];
  linkedin: Account[];
  gmail: Account[];
  enterprise: Account[];
};
const EMPTY_CONNECTIONS: Connections = { configured: { meta: false, gmail: false, zernio: false }, facebook: [], instagram: [], linkedin: [], gmail: [], enterprise: [] };
const ADD_LABEL = { whatsapp: "添加 WhatsApp", facebook: "添加 Facebook 主页", instagram: "添加 Instagram 账号", linkedin: "添加 LinkedIn 账号", gmail: "添加 Gmail", enterprise: "添加企业邮箱" };
const CARD = "flex min-h-[245px] min-w-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-sm";
const CHIP = "flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px]";
const ADD_BUTTON = "mt-4 inline-flex w-full justify-center rounded-xl border border-[#D9D5FA] bg-[#F7F6FF] px-3 py-2.5 text-[13px] font-medium text-[#5548C8] hover:bg-[#EFEDFF] disabled:opacity-50";
const ROW_BUTTON = "rounded-md border border-line px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-ink disabled:opacity-50";

function Card({ title, icon, count, anchor, children }: { title: string; icon: React.ReactNode; count?: number; anchor?: string; children: React.ReactNode }) {
  return (
    <section id={anchor} aria-label={title} className={CARD}>
      <header className="mb-3 flex items-center gap-3">
        {icon}
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {count !== undefined ? <span className="ml-auto text-[11px] text-faint">{count} 个账号</span> : null}
      </header>
      {children}
    </section>
  );
}

function AccountList({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <ul aria-label={`${label}账号列表`} tabIndex={count > 2 ? 0 : undefined}
      className="max-h-[11.25rem] space-y-2 overflow-y-auto overscroll-y-contain rounded-xl pr-1 [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#6255D3]">
      {children}
    </ul>
  );
}

function AccountRow({ label, children, status }: { label: string; children: React.ReactNode; status?: WhatsAppDisplayState | "expired" }) {
  return (
    <li className="rounded-xl border border-[#E8E9F0] px-3 py-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold text-ink" title={label}>{label}</p>
        {status ? <span className="shrink-0 whitespace-nowrap">
          <StatusPill state={status === "open" ? "connected" : "pending"} text={status === "expired" ? "需重新授权" : WHATSAPP_STATUS_LABEL[status]} />
        </span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </li>
  );
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok || data.ok === false) throw new Error(data.error || data.message || "操作失败，请重试");
  return data;
}

function jsonPost(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function qrImage(value: string) {
  return value.startsWith("data:") ? value : `data:image/png;base64,${value}`;
}

function oauthLink(channel: "facebook" | "instagram" | "gmail", id?: string) {
  const params = new URLSearchParams();
  if (channel !== "gmail") params.set("channel", channel);
  if (id) params.set("id", id);
  return `/api/channels/${channel === "gmail" ? "google" : "meta"}/auth?${params}`;
}

const OAUTH_ERRORS: Record<string, string> = {
  page_access: "平台没有返回可连接的 Facebook 主页。请检查主页访问权限后重新授权。",
  instagram_access: "平台没有返回可连接的 Instagram 专业账号。请检查它与授权主页的关联。",
  already_connected: "这次授权返回的账号都已连接。添加时请选择其他账号或主页。",
  google_wrong_account: "请选择原来连接的 Gmail 邮箱。添加其他邮箱请使用「添加 Gmail」。",
  meta_webhook_subscription: "平台未完成消息订阅，请检查应用权限后重新授权。",
  google_connection: "Gmail 授权未完成，请重新授权。",
  zernio_expired: "连接请求已过期，请重新添加账号。",
  zernio_wrong_page: "请选择原来连接的账号。",
  zernio_declined: "授权未完成，请重新连接。",
  zernio_permissions: "请重新授权并允许读取和回复私信。",
  linkedin_permissions: "LinkedIn 授权未完成，请重新授权并允许发布内容。",
  zernio_unavailable: "暂时无法确认社媒授权，可刷新页面或重试。",
};

export default function ChannelsPage() {
  const [connections, setConnections] = useState(EMPTY_CONNECTIONS);
  const [wa, setWa] = useState<WhatsAppAccount[]>([]);
  const [waConfigured, setWaConfigured] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [label, setLabel] = useState("");
  const [addingWa, setAddingWa] = useState(false);
  const [qr, setQr] = useState<{ id: string | null; label: string; image: string } | null>(null);
  const [picker, setPicker] = useState<{ key: string; channel: "facebook" | "instagram"; options: Account[] } | null>(null);
  const [authorizationResult, setAuthorizationResult] = useState<"ok" | "error" | null>(null);

  async function loadConnections() {
    setConnections(await jsonRequest("/api/channels/connection"));
  }

  async function loadWhatsApp(signal?: AbortSignal) {
    const data = await jsonRequest("/api/channels/whatsapp", { signal });
    setWa(data.connections);
    setWaConfigured(data.configured);
  }

  useEffect(() => {
    jsonRequest("/api/inbox").then((data) => setPending((data.inbox || []).filter((item: { state: string }) => item.state === "待批准").length)).catch(() => {});
    loadConnections().catch((error) => setNotice(error.message));
    loadWhatsApp().catch((error) => setNotice(error.message));
    const current = new URL(window.location.href);
    const pick = current.searchParams.get("pick");
    if (pick) {
      jsonRequest(`/api/channels/meta/select?pick=${encodeURIComponent(pick)}`)
        .then((data) => setPicker({ key: pick, channel: data.channel, options: data.options }))
        .catch((error) => setNotice(error.message));
    }
    if (current.searchParams.get("status") === "ok") setNotice("账号已连接");
    if (current.searchParams.get("status") === "error") {
      setNotice(OAUTH_ERRORS[current.searchParams.get("reason") || ""] || "授权未完成，请回到对应渠道重试。");
    }
    const result = current.searchParams.get("status");
    if ((result === "ok" || result === "error") && publishAuthorizationResult(result, current.searchParams.get("reason") || "")) setAuthorizationResult(result);
    for (const key of ["status", "provider", "reason", "pick"]) current.searchParams.delete(key);
    window.history.replaceState(null, "", current);
  }, []);

  useEffect(() => {
    const refresh = () => { void loadConnections().catch(() => {}); };
    function onResult(event: StorageEvent) {
      if (event.key !== AUTHORIZATION_RESULT || !event.newValue) return;
      try {
        const data = JSON.parse(event.newValue);
        if (!["ok", "error"].includes(data.status) || Math.abs(Date.now() - data.at) > 60_000) return;
        setNotice(data.status === "ok" ? "账号已连接" : OAUTH_ERRORS[data.reason] || "授权未完成，请重新连接。");
        refresh();
      } catch {}
    }
    window.addEventListener("storage", onResult);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("storage", onResult); window.removeEventListener("focus", refresh); };
  }, []);

  useEffect(() => {
    if (!qr?.id || busy) return;
    const { id, image } = qr;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshCodeAt = Date.now() + (image ? 26_000 : 0);
    async function poll(id: string) {
      try {
        const data = await jsonRequest(`/api/channels/whatsapp?id=${encodeURIComponent(id)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const account: WhatsAppAccount | undefined = data.connections[0];
        if (account) {
          setWa((current) => current.map((item) => item.id === id ? account : item));
          if (account.state === "open") {
            setQr(null);
            setNotice(`${account.label} 已连接`);
            return;
          }
        }
        if (Date.now() >= refreshCodeAt) {
          refreshCodeAt = Date.now() + (image ? 5000 : 2000);
          const next = await jsonRequest("/api/channels/whatsapp", { ...jsonPost({ id }), signal: controller.signal });
          if (controller.signal.aborted) return;
          if (next.state === "open") {
            setQr(null);
            setNotice("WhatsApp 已连接");
            void loadWhatsApp().catch(() => {});
            return;
          }
          const nextImage = next.qr ? qrImage(next.qr) : "";
          if (nextImage && nextImage !== image) {
            setQr((current) => current?.id === id ? { ...current, image: nextImage } : current);
            return;
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      timer = setTimeout(() => void poll(id), 1200);
    }
    timer = setTimeout(() => void poll(id), 700);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [qr, busy]);

  async function run(key: string, operation: () => Promise<void>) {
    setBusy(key);
    setNotice("");
    try { await operation(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setBusy(""); }
  }

  async function scan(account?: Account) {
    await run(account?.id || "whatsapp-add", async () => {
      setAddingWa(false);
      const name = account?.label || label.trim() || `WhatsApp ${wa.length + 1}`;
      setQr({ id: account?.id ?? null, label: name, image: "" });
      try {
        const data = await jsonRequest("/api/channels/whatsapp", jsonPost(account ? { id: account.id } : { label: name }));
        if (data.state === "open") {
          setQr(null);
          setNotice(`${name} 已连接`);
        } else {
          setQr((current) => current && { id: data.id, label: name, image: data.qr ? qrImage(data.qr) : "" });
        }
        if (data.webhookMessage && !data.webhookConfigured) setNotice(`收件配置失败：${data.webhookMessage}`);
      } catch (error) {
        setQr(null);
        throw error;
      } finally {
        void loadWhatsApp().catch(() => {});
      }
    });
  }

  async function disconnect(kind: ChannelConnection, account: Account) {
    if (!window.confirm(`退出「${account.label}」？`)) return;
    await run(account.id, async () => {
      const url = account.provider === "zernio" ? `/api/channels/zernio?platform=${kind}&` :
        kind === "whatsapp" ? "/api/channels/whatsapp?" : `/api/channels/connection?channel=${kind}&`;
      await jsonRequest(`${url}id=${encodeURIComponent(account.id)}`, { method: "DELETE" });
      if (kind === "whatsapp") {
        setWa((accounts) => accounts.filter((item) => item.id !== account.id));
        if (qr?.id === account.id) setQr(null);
      } else {
        setConnections((current) => ({ ...current, [kind]: current[kind].filter((item) => item.id !== account.id) }));
      }
      setNotice(`${account.label} 已退出`);
    });
  }

  async function connectZernio(platform: ZernioPlatform, account?: Account) {
    let tab: Window;
    try { tab = createAuthorizationTab(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "无法打开授权标签页"); return; }
    await run(account?.id || `add-zernio-${platform}`, async () => {
      try {
        const { authUrl } = await jsonRequest("/api/channels/zernio", jsonPost({ id: account?.id, platform }));
        if (tab.closed) throw new Error("授权标签页已关闭，请重新连接。");
        tab.location.replace(authUrl);
        setNotice("请在新标签页完成授权，本页将自动更新连接状态。");
      } catch (error) { tab.close(); throw error; }
    });
  }

  function openOAuth(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try { createAuthorizationTab().location.replace(event.currentTarget.href); }
    catch (error) { setNotice(error instanceof Error ? error.message : "无法打开授权标签页"); }
  }

  async function repair(kind: "whatsapp" | "facebook" | "instagram", account: Account) {
    await run(account.id, async () => {
      const service = kind === "whatsapp" ? "whatsapp/webhook" : "meta/subscribe";
      await jsonRequest(`/api/channels/${service}?channel=${kind}&id=${encodeURIComponent(account.id)}`, { method: "POST" });
      setNotice(`已修复「${account.label}」的消息接收配置`);
    });
  }

  async function chooseMeta(account: Account) {
    if (!picker) return;
    await run(account.id, async () => {
      await jsonRequest("/api/channels/meta/select", jsonPost({ pick: picker.key, id: account.id }));
      setPicker(null);
      await loadConnections();
      setNotice(`${account.label} 已连接`);
      if (publishAuthorizationResult("ok")) setAuthorizationResult("ok");
    });
  }

  function exitButton(kind: ChannelConnection, account: Account) {
    return <button type="button" className={`${ROW_BUTTON} hover:text-red-700`} disabled={!!busy} onClick={() => void disconnect(kind, account)}>退出连接</button>;
  }

  function zernioAccountRow(platform: ZernioPlatform, account: Account) {
    return <AccountRow key={account.id} label={account.label} status={account.status === "expired" ? "expired" : "open"}>
      {connections.configured.zernio ? <button type="button" className={ROW_BUTTON} disabled={!!busy} onClick={() => void connectZernio(platform, account)}>重新授权</button> : null}
      {exitButton(platform, account)}
    </AccountRow>;
  }

  function oauthCard(kind: "facebook" | "instagram" | "gmail", icon: React.ReactNode) {
    const configured = kind === "gmail" ? connections.configured.gmail : connections.configured.meta;
    const viaZernio = kind !== "gmail" && connections.configured.zernio;
    const accounts = connections[kind];
    return (
      <Card title={CONNECTION_NAME[kind]} icon={icon} count={accounts.length} anchor={kind === "gmail" ? "email-connections" : undefined}>
        <AccountList label={CONNECTION_NAME[kind]} count={accounts.length}>
          {accounts.map((account) => kind !== "gmail" && account.provider === "zernio" ? zernioAccountRow(kind, account) : <AccountRow key={account.id} label={account.label}>
            {kind === "gmail" ? <a className={ROW_BUTTON} href={`/mail?account=${encodeURIComponent(account.id)}`}>打开邮箱</a> :
              <button type="button" className={ROW_BUTTON} disabled={!!busy} onClick={() => void repair(kind, account)}>修复消息接收</button>}
            {configured ? <a className={ROW_BUTTON} href={oauthLink(kind, account.id)} target="_blank" rel="noopener noreferrer" onClick={openOAuth}>重新授权</a> : null}
            {exitButton(kind, account)}
          </AccountRow>)}
        </AccountList>
        <div className="mt-auto">
          {viaZernio ? <button type="button" className={ADD_BUTTON} disabled={!!busy} onClick={() => void connectZernio(kind)}>{ADD_LABEL[kind]}</button> :
            (configured || kind === "gmail") ? <a className={ADD_BUTTON} href={oauthLink(kind)} target="_blank" rel="noopener noreferrer" onClick={openOAuth}>{ADD_LABEL[kind]}</a> :
            <button type="button" className={ADD_BUTTON} disabled>{ADD_LABEL[kind]}</button>}
        </div>
      </Card>
    );
  }

  if (authorizationResult) return <main className="flex min-h-screen items-center justify-center bg-[#F7F6FF] p-6"><section className="w-full max-w-md rounded-2xl border border-[#DDD7FA] bg-white p-8 text-center shadow-sm"><h1 className="text-xl font-semibold text-[#33275D]">{authorizationResult === "ok" ? "授权完成" : "授权未完成"}</h1><p className="mt-4 text-sm text-[#6F6880]">{authorizationResult === "ok" ? "原来的 NOVA 标签页已更新连接状态，可以关闭本页。" : notice}</p><button type="button" className={`${ADD_BUTTON} mt-6`} onClick={() => window.close()}>关闭此标签页</button></section></main>;

  return (
    <AppShell pending={pending}>
      <main className="min-h-screen bg-[#F7F8FA] px-6 py-7 lg:px-9">
        <div className="mx-auto max-w-[1440px]">
          <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">社媒与消息渠道</h1>
            <a href="/messages" className="rounded-xl border border-line bg-white px-4 py-2.5 text-[12px] font-medium text-ink hover:text-[#5548C8]">打开消息工作台</a>
          </header>
          {notice ? <p role="status" className="mb-4 rounded-xl border border-[#D9D5FA] bg-[#F4F2FF] px-4 py-3 text-[13px] text-[#5146B8]">{notice}</p> : null}
          {picker ? <section className="mb-5 rounded-2xl border border-[#D9D5FA] bg-white p-4" aria-label="选择连接账号">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[14px] font-semibold text-ink">选择要添加的 {CONNECTION_NAME[picker.channel]} {picker.channel === "facebook" ? "主页" : "账号"}</h2>
              <button type="button" className={ROW_BUTTON} disabled={!!busy} onClick={() => setPicker(null)}>取消</button>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{picker.options.map((account) => <li key={account.id}>
              <button type="button" className={`${ROW_BUTTON} w-full text-left`} disabled={!!busy} onClick={() => void chooseMeta(account)}>{account.label}</button>
            </li>)}</ul>
          </section> : null}
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card title="WhatsApp" count={wa.length} icon={<span className={`${CHIP} bg-[#E7F8EE]`}><BrandIcon d={ICONS.whatsapp} color="#25D366" size={24} /></span>}>
              <AccountList label="WhatsApp" count={wa.length}>{wa.map((account) => <AccountRow key={account.id} label={account.ownerSuffix ? `${account.label} · 尾号 ${account.ownerSuffix}` : account.label} status={account.state}>
                {account.state === "open" ? <>
                  <a className={ROW_BUTTON} href={`/messages?channel=WhatsApp&account=${encodeURIComponent(account.id)}`}>打开会话</a>
                  <button type="button" className={ROW_BUTTON} disabled={!!busy} onClick={() => void repair("whatsapp", account)}>修复消息接收</button>
                </> :
                  <button type="button" className={ROW_BUTTON} disabled={!!busy || !waConfigured} onClick={() => void scan(account)}>重新扫码</button>}
                {exitButton("whatsapp", account)}
              </AccountRow>)}</AccountList>
              <div className="mt-auto">
                <button type="button" className={ADD_BUTTON} disabled={!!busy || !waConfigured} onClick={() => { setLabel(""); setAddingWa(true); }}>{ADD_LABEL.whatsapp}</button>
                {waConfigured === false ? <p className="mt-2 text-center text-[11px] text-faint">扫码服务暂未就绪，请联系管理员</p> : null}
                {waConfigured === null ? <p className="mt-2 text-center text-[11px] text-faint">正在检查连接</p> : null}
              </div>
            </Card>
            {oauthCard("facebook", <span className={`${CHIP} bg-[#EAF1FE]`}><BrandIcon d={ICONS.facebook} color="#1877F2" /></span>)}
            {oauthCard("instagram", <span className={`${CHIP} bg-[#FDEDF4]`}><BrandIcon d={ICONS.instagram} gradient={{ id: "iggrad", from: "#F77737", to: "#C13584" }} /></span>)}
            {oauthCard("gmail", <span className={`${CHIP} bg-[#FDECEC]`}><GoogleIcon /></span>)}
            <Card title="企业邮箱" count={connections.enterprise.length} icon={<span className={`${CHIP} bg-[#F0EEFF] text-[#5548C8]`}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></svg>
            </span>}>
              <AccountList label="企业邮箱" count={connections.enterprise.length}>{connections.enterprise.map((account) => <AccountRow key={account.id} label={account.label}>
                <a href={`/mail?account=${encodeURIComponent(account.id)}`} className={ROW_BUTTON}>打开邮箱</a>
                <a href={`/settings?mailAccount=${encodeURIComponent(account.id)}#mail-settings`} className={ROW_BUTTON}>编辑配置</a>
                {exitButton("enterprise", account)}
              </AccountRow>)}</AccountList>
              <div className="mt-auto"><a href="/settings?mailAccount=new#mail-settings" className={ADD_BUTTON}>{ADD_LABEL.enterprise}</a></div>
            </Card>
            <Card title={CONNECTION_NAME.linkedin} count={connections.linkedin.length} icon={<span className={`${CHIP} bg-[#E8F1FA]`}><BrandIcon d={ICONS.linkedin} color="#0A66C2" /></span>}>
              <AccountList label={CONNECTION_NAME.linkedin} count={connections.linkedin.length}>{connections.linkedin.map((account) => zernioAccountRow("linkedin", account))}</AccountList>
              <div className="mt-auto">
                <button type="button" className={ADD_BUTTON} disabled={!!busy || !connections.configured.zernio} onClick={() => void connectZernio("linkedin")}>{ADD_LABEL.linkedin}</button>
              </div>
            </Card>
          </div>
        </div>
      </main>
      {addingWa ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setAddingWa(false)}>
        <form role="dialog" aria-modal="true" aria-label="添加 WhatsApp" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); if (!busy) void scan(); }}>
          <h2 className="mb-3 text-[15px] font-semibold text-ink">添加 WhatsApp</h2>
          <label className="block text-[12px] text-muted" htmlFor="wa-label">账号名称（选填）</label>
          <input id="wa-label" className="mt-1 w-full" autoFocus maxLength={60} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="例如 外贸销售一组" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className={ROW_BUTTON} onClick={() => setAddingWa(false)}>取消</button>
            <button type="submit" className="rounded-lg bg-[#5548C8] px-4 py-2 text-[12px] text-white disabled:opacity-50" disabled={!!busy}>生成二维码</button>
          </div>
        </form>
      </div> : null}
      {qr ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setQr(null)}>
        <section role="dialog" aria-modal="true" aria-label="WhatsApp 扫码" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 truncate text-[15px] font-semibold text-ink">{qr.label}</h2>
            <button type="button" className={ROW_BUTTON} onClick={() => setQr(null)}>关闭</button>
          </div>
          <p className="my-3 text-[12px] text-faint">在手机 WhatsApp 的「已连接的设备」里点「连接设备」，再扫描二维码。</p>
          {qr.image ? <img src={qr.image} alt="WhatsApp 二维码" className="mx-auto h-56 w-56 rounded-xl border border-line p-2" />
            : <p role="status" className="grid h-56 place-items-center rounded-xl border border-line text-[12px] text-muted">正在等待 WhatsApp 生成二维码…</p>}
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px] text-faint">扫码成功后自动完成连接</p>
            <button type="button" className={ROW_BUTTON} disabled={!!busy || !qr.id} onClick={() => { if (qr.id) void scan({ id: qr.id, label: qr.label }); }}>刷新二维码</button>
          </div>
        </section>
      </div> : null}
    </AppShell>
  );
}
