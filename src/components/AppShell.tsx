"use client";
import { ThemeMenu } from "./Appearance";

import BrandLogo from "./BrandLogo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { moduleForPath, type ModuleId } from "@/lib/permissions";

const GROUPS = [
  { title: "总览", items: [{ href: "/", label: "概览", icon: "home" }, { href: "/agent", label: "智能体", icon: "spark" }] },
  { title: "客户与获客", items: [
    { href: "/customers", label: "客户管理", icon: "users" },
    { href: "/dashboard", label: "AI获客", icon: "search" },
    { href: "/customs-data", label: "海关数据", icon: "ship" },
  ] },
  { title: "沟通", items: [
    { href: "/channels", label: "社媒渠道", icon: "network" },
    { href: "/messages", label: "消息工作台", icon: "chat", badge: true },
    { href: "/mail", label: "邮件", icon: "mail" },
  ] },
  { title: "销售", items: [
    { href: "/workbench", label: "销售工作台", icon: "workflow" },
    { href: "/quotes", label: "报价单", icon: "file" },
    { href: "/quotes/library", label: "报价资料库", icon: "catalog" },
    { href: "/quotes/calculator", label: "报价与利润", icon: "calculator" },
  ] },
  { title: "工具与设置", items: [
    { href: "/knowledge", label: "知识库", icon: "book" },
    { href: "/trade-data", label: "贸易数据", icon: "chart" },
    { href: "/settings", label: "设置", icon: "settings" },
  ] },
  { title: "团队管理", items: [{ href: "/team", label: "员工与权限", icon: "users", teamOnly: true }] },
];

type ShellProfile = { avatar?: string; theme?: string; displayName: string; role: string; id: string; permissions: ModuleId[]; selfHosted: boolean; authorized?: boolean; ready: boolean };
type SidebarState = { collapsed: Record<string, boolean>; setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>; profile: ShellProfile; setProfile: React.Dispatch<React.SetStateAction<ShellProfile>>; messageCount: { accountId: string; count: number } | null };
const SidebarContext = createContext<SidebarState | null>(null);
export function SidebarNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((group) => [group.title, group.title !== "总览"])));
  const [sidebarStateLoaded, setSidebarStateLoaded] = useState(false);
  const [profile, setProfile] = useState<ShellProfile>({ displayName: "森哥", role: "user", id: "", permissions: [], selfHosted: false, ready: false });
  const [messageCount, setMessageCount] = useState<SidebarState["messageCount"]>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nova-sidebar-collapsed-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, boolean>;
        setCollapsed(Object.fromEntries(GROUPS.map((group) => [group.title, typeof parsed[group.title] === "boolean" ? parsed[group.title] : group.title !== "总览"])));
      }
    } catch {}
    setSidebarStateLoaded(true);
  }, []);
  useEffect(() => {
    if (!sidebarStateLoaded) return;
    try { localStorage.setItem("nova-sidebar-collapsed-v1", JSON.stringify(collapsed)); } catch {}
  }, [collapsed, sidebarStateLoaded]);
  useEffect(() => {
    if (profile.id) return;
    let active = true;
    fetch("/api/profile").then((r) => r.ok ? r.json() : null).then((d) => {
      if (!active) return;
      if (d?.id) setProfile({ avatar: d.avatar || "", theme: d.theme || "orange", displayName: d.displayName || "森哥", role: d.role || "user", id: d.id, permissions: Array.isArray(d.permissions) ? d.permissions : [], selfHosted: Boolean(d.selfHosted), authorized: d.authorized, ready: true });
      else setProfile((current) => ({ ...current, ready: true }));
    }).catch(() => { if (active) setProfile((current) => ({ ...current, ready: true })); });
    return () => { active = false; };
  }, [pathname, profile.id]);
  const canReadMessages = profile.role === "admin" || profile.permissions.includes("messages");
  useEffect(() => {
    if (!profile.ready || !profile.id || profile.authorized === false || !canReadMessages || pathname === "/login" || pathname === "/register") return;
    let active = true;
    let controller: AbortController | undefined;
    async function refreshCount() {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const response = await fetch("/api/inbox/count", { cache: "no-store", signal: request.signal });
        if (!active || request.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setMessageCount(null); return; }
        if (!response.ok) return;
        const data = await response.json();
        if (active && !request.signal.aborted && Number.isSafeInteger(data.count) && data.count >= 0) setMessageCount({ accountId: profile.id, count: data.count });
      } catch { /* Preserve the last successful count on transient failures. */ }
    }
    void refreshCount();
    const timer = window.setInterval(() => void refreshCount(), 15_000);
    const update = () => void refreshCount();
    window.addEventListener("focus", update);
    window.addEventListener("nova-inbox-updated", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false; controller?.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("nova-inbox-updated", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [profile.id, profile.ready, profile.authorized, canReadMessages, pathname]);
  return <SidebarContext.Provider value={{ collapsed, setCollapsed, profile, setProfile, messageCount }}>{children}</SidebarContext.Provider>;
}

export function NavIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>,
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    workflow: <><circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v5a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4M18 17v-5a4 4 0 0 0-4-4h-4a4 4 0 0 1-4-4"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    catalog: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10h6"/></>,
    calculator: <><rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M8 6.5h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" strokeWidth="2.5"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5v13A2.5 2.5 0 0 1 6.5 16H20M8 7h8M8 10h7"/></>,
    chart: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 6-7"/><path d="M16 6h4v4"/></>,
    ship: <><path d="M3 17h18l-2 4H6z"/><path d="M6 17V9l6-4 6 4v8M9 10h6M12 5V2"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z"/><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z"/></>,
    network: <><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.5 8.5M13.2 7.2l4.5 8.5M7.5 18h9"/></>,
    settings: <><path d="M9.6 2.8h4.8l.6 2.4c.6.16 1.15.39 1.66.69l2.3-.77 2.4 4.16-1.7 1.7c.08.65.08 1.3 0 1.95l1.7 1.7-2.4 4.16-2.3-.77c-.51.3-1.06.53-1.66.69l-.6 2.4H9.6L9 18.73a7.5 7.5 0 0 1-1.66-.69l-2.3.77-2.4-4.16 1.7-1.7a7.8 7.8 0 0 1 0-1.95l-1.7-1.7 2.4-4.16 2.3.77A7.5 7.5 0 0 1 9 5.2l.6-2.4Z"/><circle cx="12" cy="12" r="3.2"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px]" {...common}>{paths[name]}</svg>;
}

export default function AppShell({ children }: { children: ReactNode; pending?: number }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  useEffect(() => { setCompact(localStorage.getItem("nova-sidebar-compact") === "true"); }, []);
  const router = useRouter();
  const sidebar = useContext(SidebarContext);
  const collapsed = sidebar?.collapsed || Object.fromEntries(GROUPS.map((group) => [group.title, group.title !== "总览"]));
  const setCollapsed = sidebar?.setCollapsed || (() => undefined);
  const profile = sidebar?.profile || { displayName: "森哥", role: "user", id: "", permissions: [], selfHosted: false, ready: false };
  const accountName = profile.displayName;
  const accountRole = profile.role;
  const accountId = profile.id;
  const accountPermissions = profile.permissions;
  const accountSelfHosted = profile.selfHosted;
  const pending = sidebar?.messageCount?.accountId === accountId ? sidebar.messageCount.count : 0;

  useEffect(() => {
    if (profile.ready && profile.authorized === false && !(profile.id === "owner" && !profile.selfHosted)) router.replace("/login?authorization=required");
    const updateName = (event: Event) => sidebar?.setProfile((current) => ({ ...current, displayName: (event as CustomEvent<string>).detail || "森哥" }));
    const updateAppearance = (event: Event) => sidebar?.setProfile(current => ({ ...current, ...(event as CustomEvent).detail }));
    window.addEventListener("nova-appearance", updateAppearance);
    window.addEventListener("nova-account-name", updateName);
    return () => { window.removeEventListener("nova-account-name", updateName); window.removeEventListener("nova-appearance", updateAppearance); };
  }, [profile.ready, profile.authorized, profile.id, profile.selfHosted, router, sidebar?.setProfile]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className={`nova-shell min-h-screen lg:flex ${compact ? "nova-compact" : ""}`}>

      <aside id="nova-sidebar" className="nova-sidebar flex w-full flex-none flex-col border-b border-[#E7E4F1] bg-white px-4 py-4 lg:sticky lg:top-0 lg:h-screen lg:w-[238px] lg:border-b-0 lg:border-r lg:px-3.5 lg:py-5">
        <Link href="/" className="mb-5 flex items-center gap-3 border-b border-[#EFEDF6] px-2 pb-5 lg:mb-5">
          <BrandLogo size={42} />
          <span className="nova-brand-text min-w-0"><span className="block text-[19px] font-bold tracking-[0.14em] text-[#1D2925]">NOVA</span><span className="mt-0.5 block text-[11px] tracking-[0.1em] text-[#87928D]">外贸CRM</span></span>
        </Link>
        <nav className="grid grid-cols-2 gap-x-2 gap-y-3 text-[13px] sm:grid-cols-3 lg:block lg:flex-1 lg:space-y-4 lg:overflow-y-auto lg:min-h-0">
          {GROUPS.map((group) => {
            const items = group.items.filter((n: any) => !n.teamOnly || ((accountSelfHosted && accountRole === "admin") || (!accountSelfHosted && accountRole === "customer_admin"))).filter((n: any) => !n.platformOnly || (!accountSelfHosted && accountRole === "admin" && accountId === "owner")).filter((n: any) => !((accountRole === "user" || accountRole === "customer_admin") && moduleForPath(n.href)) || accountPermissions.includes(moduleForPath(n.href)!));
            if (!items.length) return null;
            return <section key={group.title} className="nova-nav-group min-w-0">
            {group.title === "总览" ? <div className="nova-group-heading mb-1 rounded-md px-3 py-1.5 text-[12px] font-semibold tracking-[0.025em] text-[#53635B]">总览</div> : <button type="button" aria-expanded={!collapsed[group.title]} onClick={() => setCollapsed((current) => ({ ...current, [group.title]: !current[group.title] }))} className="nova-group-heading mb-1 flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-[12px] font-semibold tracking-[0.025em] text-[#53635B] hover:bg-[#F7F6FC]">
              <span>{group.title}</span><svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${collapsed[group.title] ? "-rotate-90" : "rotate-0"}`} viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>}
            {(compact || !collapsed[group.title]) ? <div className="nova-nav-branches space-y-0.5">{items.map((n: any) => {
              const active = n.href === "/" ? pathname === "/" : n.href === "/quotes" ? pathname === "/quotes" : pathname === n.href || pathname.startsWith(`${n.href}/`);
              return <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} aria-current={active ? "page" : undefined} className={`nova-nav-link group flex min-w-0 items-center justify-between rounded-[10px] px-3 py-[9px] transition-colors ${active ? "bg-[#F0EEFF] font-semibold text-[#5548C8]" : "text-[#69746F] hover:bg-[#F7F6FC] hover:text-[#25332D]"}`}>
                <span className="flex min-w-0 items-center gap-2.5"><span className={active ? "text-[#6255D3]" : "text-[#98A19D] group-hover:text-[#64716B]"}><NavIcon name={n.icon}/></span><span className="nova-nav-label truncate">{n.label}</span></span>
                {n.badge && pending > 0 ? <span aria-label={`${pending} 条待回复消息`} className="nova-nav-badge ml-2 rounded-full bg-[#C94C42] px-1.5 py-0.5 text-[10px] leading-none text-white">{pending}</span> : null}
              </Link>;
            })}</div> : null}
          </section>})}
        </nav>
        <Link href="/profile" className="nova-sidebar-profile" aria-label={`打开${accountName}的个人资料`} title={accountName}>
          {profile.avatar ? <img src={profile.avatar} alt="个人头像" className="nova-avatar" /> : <span className="nova-avatar" aria-label="默认头像"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24"><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></svg></span>}
          <span className="nova-profile-label min-w-0"><strong className="block truncate">{accountName}</strong><span className="text-xs text-muted">个人资料与账户</span></span>
        </Link>
      </aside>
      <main className="nova-main min-w-0 flex-1">
        <header className="nova-topbar">
          <button type="button" aria-label={compact ? "展开侧边栏" : "收起侧边栏"} title={compact ? "展开侧边栏" : "收起侧边栏"} aria-controls="nova-sidebar" aria-expanded={!compact} className="nova-sidebar-toggle" onClick={() => { const next = !compact; setCompact(next); localStorage.setItem("nova-sidebar-compact", String(next)); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/><path d={compact ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"}/></svg>
          </button>
          <ThemeMenu accountId={accountId} initial={profile.theme} />
        </header>
        {children}
      </main>
    </div>
  );
}
