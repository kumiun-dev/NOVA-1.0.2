"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell, { NavIcon } from "@/components/AppShell";
import type { SentReply } from "@/lib/inbox-replies";
import styles from "./messages.module.css";

type Item = {
  id: number;
  lead_id: number | null;
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
  recipient_id?: string;
  connection_ref?: string;
  connection_group?: string;
  connection_label?: string;
  reply_available?: boolean;
  direction?: "incoming" | "outgoing";
  media_type?: string;
  attachment_types?: string[];
  channel_source?: string;
  read_at?: string;
  replies: SentReply[];
};
type Conversation = { key: string; channel: string; items: Item[]; latest: Item; preview: { body: string; date: string; outgoing: boolean } };
type ChannelTab = { label: string; value: string };

const CHANNELS: ChannelTab[] = [
  { label: "全部消息", value: "全部" },
  { label: "WhatsApp", value: "WhatsApp" },
  { label: "Facebook", value: "Facebook" },
  { label: "Instagram", value: "Instagram" },
  { label: "邮件", value: "邮件" },
];

const MESSAGE_ACTION = "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-[#E5E0EF] bg-white px-3 py-1.5 text-[12px] font-medium text-[#534C65] transition hover:border-[#CABDF0] hover:bg-[#F8F6FD] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7663D0] disabled:cursor-not-allowed disabled:opacity-50";
const MESSAGE_BUBBLE = "w-fit max-w-full whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-[1.65] [overflow-wrap:anywhere]";

function messageDate(value: string) {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(value) ? value.replace(" ", "T") + "Z" : value);
}

function shortDate(value: string) {
  if (!value) return "";
  const date = messageDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function dateLabel(value: string) {
  if (!value) return "";
  const date = messageDate(value);
  return Number.isNaN(+date) ? "" : date.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function messageTime(value: string) {
  if (!value) return "";
  const date = messageDate(value);
  return Number.isNaN(+date) ? shortDate(value) : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function contactName(item: Item) {
  return item.lead_name || item.sender || item.company || "未知客户";
}

function conversationDetails(item: Item) {
  const name = contactName(item).trim();
  const phone = item.channel === "WhatsApp" && /^\+?\d{6,16}$/.test(item.recipient_id || "") ? item.recipient_id : "";
  return [...new Set([item.company, item.subject, phone, item.connection_label].filter((value) => value && value.trim() !== name))];
}

function avatarKey(item: Item) {
  return `${item.connection_group || item.connection_ref || ""}:${item.recipient_id || ""}`;
}

function ContactAvatar({ item, url, size = "normal", channelBadge = false }: { item: Item; url?: string | null; size?: "normal" | "small"; channelBadge?: boolean }) {
  const [failedUrl, setFailedUrl] = useState("");
  const tone = item.channel === "WhatsApp" ? "bg-[#DCF2E9] text-[#21694F]"
    : item.channel === "Facebook" ? "bg-[#E1ECFC] text-[#2F5EA5]"
    : item.channel === "Instagram" ? "bg-[#F9E7F2] text-[#923868]" : "bg-[#EDE7FA] text-[#654AB0]";
  return (
    <span className={`relative block shrink-0 ${size === "small" ? "h-8 w-8" : "h-11 w-11"}`}>
      <span className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full font-semibold ${tone} ${size === "small" ? "text-[12px]" : "text-[16px]"}`}>
        {url && url !== failedUrl ? <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setFailedUrl(url)} />
          : Array.from(contactName(item).trim())[0]?.toUpperCase() || "客"}
      </span>
      {channelBadge ? <span className="absolute -bottom-0.5 -right-0.5 flex rounded-full ring-2 ring-white"><ChannelLogo channel={item.channel} size="xs" /></span> : null}
    </span>
  );
}

function MessageAttachment({ item, kind, index }: { item: Item; kind: string; index: number }) {
  const [opened, setOpened] = useState(false);
  const [failed, setFailed] = useState(false);
  const url = `/api/inbox/attachment?id=${item.id}&index=${index}`;
  if (kind === "document") return <a href={`${url}&download=1`} referrerPolicy="no-referrer" target={item.channel_source === "zernio" ? "_blank" : undefined} rel="noopener noreferrer" className="mt-1.5 block text-[13px] text-[#5548C8] underline">{item.channel_source === "zernio" ? "打开文件" : "下载文件"}</a>;
  const label = ({ image: "图片", sticker: "贴纸", audio: "语音", video: "视频" })[kind as "image" | "sticker" | "audio" | "video"];
  if (!label) return null;
  return (
    <div className="mt-2 space-y-2">
      {!opened ? <button type="button" onClick={() => setOpened(true)} className="rounded-lg border border-[#DDD4EE] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#5548C8] hover:bg-[#F7F4FF]">查看{label}</button>
        : failed ? <p className="text-[12px] text-[#666075]">附件暂时无法加载</p>
          : kind === "audio" ? <audio aria-label={`${item.channel} 语音`} src={url} controls preload="metadata" className="max-w-full" onError={() => setFailed(true)} />
            : kind === "video" ? <video aria-label={`${item.channel} 视频`} src={url} controls preload="metadata" className="max-h-64 max-w-full rounded-lg" onError={() => setFailed(true)} />
              : <img src={url} alt={`${item.channel} ${label}`} referrerPolicy="no-referrer" className="max-h-64 max-w-full rounded-lg object-contain" onError={() => setFailed(true)} />}
    </div>
  );
}

function MessageAttachments({ item }: { item: Item }) {
  const types = item.attachment_types?.length ? item.attachment_types : item.media_type ? [item.media_type] : [];
  return types.map((kind, index) => <MessageAttachment key={index} item={item} kind={kind} index={index} />);
}

function ChannelLogo({ channel, size = "sm" }: { channel: string; size?: "xs" | "sm" }) {
  const box = size === "xs" ? "h-[17px] w-[17px]" : "h-6 w-6";
  if (channel === "WhatsApp") return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#25D366] ${box}`} aria-label="WhatsApp"><svg viewBox="0 0 24 24" className="h-[70%] w-[70%] fill-white"><path d="M12.04 2a9.86 9.86 0 0 0-8.48 14.88L2.25 22l5.25-1.38A9.98 9.98 0 0 0 12.04 21 9.5 9.5 0 0 0 22 11.5 9.52 9.52 0 0 0 12.04 2Zm0 17.2a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.1.82.83-3.02-.2-.31a8.06 8.06 0 1 1 6.9 3.82Zm4.43-6.04c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.39-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.15 1.51.09.46-.07 1.43-.58 1.63-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/></svg></span>;
  if (channel === "Facebook") return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#0866FF] font-bold text-white ${box} ${size === "xs" ? "text-xs" : "text-base"}`} aria-label="Facebook">f</span>;
  if (channel === "Instagram") return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#FFB02E] via-[#E4405F] to-[#833AB4] ${box}`} aria-label="Instagram"><svg viewBox="0 0 24 24" className="h-[67%] w-[67%] fill-none stroke-white" strokeWidth="2"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.8" cy="6.4" r=".8" fill="white" stroke="none"/></svg></span>;
  if (channel === "邮件") return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-white ${box}`} aria-label="邮件"><svg viewBox="0 0 24 24" className="h-[72%] w-[72%] fill-none" strokeWidth="2.6" strokeLinejoin="round"><path d="M3 19V5l9 7 9-7v14" stroke="#4285F4"/><path d="m3 5 9 7 4-3" stroke="#EA4335"/><path d="M3 19l6-7" stroke="#34A853"/><path d="m21 19-6-7" stroke="#FBBC04"/></svg></span>;
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#E9E2F9] font-semibold text-[#6255D3] ${box}`}>✦</span>;
}

function ChannelLabel({ channel }: { channel: string }) {
  const tone = channel === "WhatsApp" ? "bg-[#E8F6EF] text-[#21694F]" : channel === "Facebook" ? "bg-[#EDF4FF] text-[#2459A8]" : channel === "Instagram" ? "bg-[#FCEEF5] text-[#923868]" : "bg-[#F0EEF4] text-[#56506A]";
  return <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tone}`}>{channel}</span>;
}

export default function MessagesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [channel, setChannel] = useState("全部");
  const [connectionFilter, setConnectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"全部" | "待回复" | "已回复">("全部");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [composingId, setComposingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [aiMsg, setAiMsg] = useState("");
  const [replyError, setReplyError] = useState<{ key: string; message: string } | null>(null);
  const [notice, setNotice] = useState("");
  const [translation, setTranslation] = useState<Record<number, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [autoReply, setAutoReply] = useState(false);
  const [savingAutoReply, setSavingAutoReply] = useState(false);
  const [live, setLive] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const avatarRequests = useRef(new Set<string>());
  const loadVersion = useRef(0);
  const streamPanel = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastConversation = useRef("");

  const load = useCallback(async (showLoading = false) => {
    const version = ++loadVersion.current;
    if (showLoading) setRefreshing(true);
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      if (!response.ok) {
        if (showLoading) setAiMsg("暂时无法刷新消息");
        return;
      }
      const data = await response.json();
      const received: Item[] = data.inbox || [];
      if (version === loadVersion.current) setItems(received);
    } catch {
      if (showLoading) setAiMsg("暂时无法刷新消息");
    } finally {
      if (showLoading) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("channel") === "WhatsApp") {
      setChannel("WhatsApp");
      if (params.get("account")) setConnectionFilter(`WhatsApp:${params.get("account")}`);
    }
    void load();
    let connected = false;
    let queued: ReturnType<typeof setTimeout> | undefined;
    function refresh() {
      clearTimeout(queued);
      queued = setTimeout(() => void load(), 100);
    }
    const events = typeof EventSource === "function" ? new EventSource("/api/inbox/stream") : null;
    events?.addEventListener("ready", () => { connected = true; setLive(true); refresh(); });
    events?.addEventListener("inbox", refresh);
    if (events) events.onerror = () => { connected = false; setLive(false); };
    const fallback = setInterval(() => {
      if (!connected && document.visibilityState === "visible") refresh();
    }, 3500);
    window.addEventListener("focus", refresh);
    return () => {
      events?.close();
      clearInterval(fallback);
      clearTimeout(queued);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  useEffect(() => { fetch("/api/agent/mode").then((response) => response.json()).then((data) => setAutoReply(data.autoReply === true)).catch(() => {}); }, []);

  const conversations = useMemo<Conversation[]>(() => {
    const grouped = new Map<string, Item[]>();
    for (const item of items) {
      const identity = item.channel === "WhatsApp" && item.recipient_id ? `recipient:${item.recipient_id}`
        : item.lead_id ? `lead:${item.lead_id}`
          : item.recipient_id ? `recipient:${item.recipient_id}` : `sender:${(item.sender || item.company || "unknown").toLocaleLowerCase()}`;
      const key = `${item.channel}:${item.connection_group || item.connection_ref || ""}:${identity}`;
      const group = grouped.get(key) || [];
      group.push(item);
      grouped.set(key, group);
    }
    return [...grouped.entries()].map(([key, group]) => {
      const ordered = group.sort((a, b) => b.id - a.id);
      const latest = ordered[0];
      let preview = { body: latest.body, date: latest.created_at, outgoing: latest.direction === "outgoing" };
      for (const item of ordered) {
        if (messageDate(item.created_at) > messageDate(preview.date)) preview = { body: item.body, date: item.created_at, outgoing: item.direction === "outgoing" };
        for (const reply of item.replies) {
          if (messageDate(reply.created_at) >= messageDate(preview.date)) preview = { body: reply.body, date: reply.created_at, outgoing: true };
        }
      }
      return { key, channel: latest.channel, items: ordered, latest, preview };
    }).sort((a, b) => messageDate(b.preview.date).getTime() - messageDate(a.preview.date).getTime() || b.latest.id - a.latest.id);
  }, [items]);

  const platformConversations = useMemo(() => conversations.filter((conversation) => {
    if (channel === "全部") return true;
    return conversation.channel === channel;
  }), [channel, conversations]);

  const connectionOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const { latest } of platformConversations) {
      if (latest.connection_ref && latest.connection_label) options.set(`${latest.channel}:${latest.connection_group || latest.connection_ref}`, channel === "全部" ? `${latest.channel} · ${latest.connection_label}` : latest.connection_label);
    }
    return [...options];
  }, [channel, platformConversations]);

  const visibleConversations = useMemo(() => platformConversations.filter((conversation) => {
    if (connectionFilter && `${conversation.channel}:${conversation.latest.connection_group || conversation.latest.connection_ref}` !== connectionFilter) return false;
    const hasPending = conversation.items.some((item) => item.state !== "已发送");
    if (statusFilter === "待回复" && !hasPending) return false;
    if (statusFilter === "已回复" && hasPending) return false;
    const query = search.trim().toLocaleLowerCase();
    if (!query) return true;
    return [contactName(conversation.latest), conversation.latest.sender, conversation.latest.body, conversation.preview.body, ...conversationDetails(conversation.latest)]
      .some((value) => String(value || "").toLocaleLowerCase().includes(query));
  }), [connectionFilter, platformConversations, search, statusFilter]);

  useEffect(() => {
    if (!visibleConversations.some((conversation) => conversation.key === selectedKey)) {
      setSelectedKey(visibleConversations[0]?.key || "");
    }
  }, [selectedKey, visibleConversations]);

  const selected = visibleConversations.find((conversation) => conversation.key === selectedKey) || visibleConversations[0];
  const activeItem = selected?.items.find((item) => item.id === composingId)
    || selected?.items.find((item) => item.state !== "已发送") || selected?.latest;
  const activeDraft = activeItem ? draftFor(activeItem) : "";
  const canReply = activeItem?.reply_available !== false;
  const unreadId = selected?.items.find((item) => item.channel_source === "zernio" && item.direction === "incoming" && !item.read_at)?.id;
  const selectedKeyForRead = selected?.key;
  useEffect(() => {
    if (!unreadId || !selectedKeyForRead) return;
    fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", id: unreadId }) })
      .then((response) => { if (response.ok) void load(); }).catch(() => {});
  }, [unreadId, selectedKeyForRead, load]);
  const pendingCount = items.filter((item) => item.state !== "已发送").length;
  useEffect(() => { window.dispatchEvent(new Event("nova-inbox-updated")); }, [pendingCount]);
  const timeline = useMemo(() => {
    const events = [...(selected?.items || [])].reverse().flatMap((item) => [
      { id: `message-${item.id}`, item, body: item.body, date: item.created_at, outgoing: item.direction === "outgoing", mode: "同步发送" },
      ...item.replies.map((reply) => ({ id: `reply-${reply.id}`, item, body: reply.body, date: reply.created_at, outgoing: true, mode: reply.mode })),
    ]);
    return events.sort((a, b) => (messageDate(a.date).getTime() || 0) - (messageDate(b.date).getTime() || 0));
  }, [selected]);

  useEffect(() => {
    const panel = streamPanel.current;
    const key = selected?.key || "";
    if (panel && (nearBottom.current || key !== lastConversation.current)) panel.scrollTop = panel.scrollHeight;
    lastConversation.current = key;
  }, [selected?.key, timeline]);

  useEffect(() => {
    const candidates = [activeItem, ...visibleConversations.slice(0, 20).map(({ latest }) => latest)];
    const missing = new Map<string, number>();
    for (const item of candidates) {
      if (item?.channel !== "WhatsApp" || !item.connection_ref || !item.recipient_id || item.reply_available === false) continue;
      const key = avatarKey(item);
      if (!avatarRequests.current.has(key)) missing.set(key, item.id);
    }
    if (!missing.size) return;
    for (const key of missing.keys()) avatarRequests.current.add(key);
    fetch("/api/inbox/avatars", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...missing.values()] }) })
      .then(async (response) => {
        if (!response.ok) throw new Error("头像加载失败");
        const data = await response.json();
        setAvatars((current) => ({ ...current, ...Object.fromEntries([...missing].map(([key, id]) => [key, data.avatars[id] || null])) }));
      }).catch(() => { for (const key of missing.keys()) avatarRequests.current.delete(key); });
  }, [activeItem, visibleConversations]);

  async function toggleWhatsAppAutoReply() {
    setSavingAutoReply(true);
    try {
      const response = await fetch("/api/agent/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoReply: !autoReply }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "自动回复设置保存失败");
      setAutoReply(data.autoReply === true);
      setNotice(data.autoReply ? "WhatsApp AI 自动回复已开启" : "已关闭 · WhatsApp 新消息将进入人工待回复");
    } catch (error: any) { setAiMsg(error?.message || "自动回复设置保存失败"); }
    finally { setSavingAutoReply(false); }
  }

  async function translateIncoming(it: Item) {
    setBusy(it.id); setAiMsg("");
    try {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: it.body, target: "zh", inboxId: it.id }) });
      const data = await response.json();
      if (data.ok) setItems((previous) => previous.map((item) => item.id === it.id ? { ...item, translated_body: data.translated, language: item.language || "en" } : item));
      else setAiMsg(data.error || "翻译失败");
    } catch { setAiMsg("翻译服务暂时不可用，请稍后重试"); }
    finally { setBusy(null); }
  }

  async function translateReply(it: Item) {
    const text = draftFor(it);
    if (!text.trim()) { setAiMsg("请先在下方输入中文回复内容"); return; }
    setBusy(it.id); setAiMsg("");
    try {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, target: it.language || "en" }) });
      const data = await response.json();
      if (data.ok) setTranslation((previous) => ({ ...previous, [it.id]: data.translated }));
      else setAiMsg(data.error || "翻译失败");
    } catch { setAiMsg("翻译服务暂时不可用，请稍后重试"); }
    finally { setBusy(null); }
  }

  async function aiClassify(it: Item) {
    setBusy(it.id); setAiMsg("");
    try {
      const response = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: it.body, channel: it.channel }) });
      const data = await response.json();
      if (data.ok) {
        setItems((previous) => previous.map((item) => item.id === it.id ? { ...item, classification: data.classification } : item));
        editDraft(it.id, data.draft || "");
      } else setAiMsg(data.error || "AI 调用失败");
    } catch { setAiMsg("AI 服务暂时不可用，请稍后重试"); }
    finally { setBusy(null); }
  }

  function draftFor(item: Item) {
    return drafts[item.id] ?? (item.state === "已发送" ? "" : item.draft || "");
  }

  function editDraft(id: number, draft: string) {
    setComposingId(draft ? id : null);
    setDrafts((previous) => ({ ...previous, [id]: draft }));
    setTranslation((previous) => ({ ...previous, [id]: "" }));
    setNotice("");
    setReplyError(null);
  }

  async function sendReply(it: Item, image?: File) {
    const text = draftFor(it);
    if ((!image && !text.trim()) || busy !== null || it.reply_available === false) return;
    const key = selected?.key || "";
    setBusy(it.id); setNotice(""); setAiMsg(""); setReplyError(null);
    try {
      const requestId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : undefined;
      const form = image ? new FormData() : null;
      if (form && image) {
        form.set("id", String(it.id));
        form.set("image", image);
        if (requestId) form.set("requestId", requestId);
      }
      const response = await fetch("/api/inbox/send", { method: "POST",
        headers: form ? undefined : { "Content-Type": "application/json" },
        body: form || JSON.stringify({ id: it.id, text, translatedText: translation[it.id] || "", requestId }),
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        ++loadVersion.current;
        setItems((previous) => previous.filter((item) => !data.echoedIds?.includes(item.id)).map((item) => item.id === it.id ? { ...item, state: "已发送", draft: "", replies: data.replies } : item));
        if (!image) {
          setDrafts((previous) => ({ ...previous, [it.id]: "" }));
          setTranslation((previous) => ({ ...previous, [it.id]: "" }));
          setComposingId((current) => current === it.id ? null : current);
        }
        setNotice(data.message || "消息已发送");
      } else setReplyError({ key, message: data.error || "发送失败" });
    } catch { setReplyError({ key, message: "发送失败，请检查渠道连接后重试" }); }
    finally { setBusy(null); }
  }

  const filteredCount = (value: string) => conversations.filter((conversation) => value === "全部" || conversation.channel === value).length;

  return (
    <AppShell pending={pendingCount}>
      <div className={`${styles.workspace} flex min-h-0 flex-col bg-[#F4F2F8] lg:h-[calc(100dvh-4rem)] lg:min-h-[36rem]`}>
        <header className="shrink-0 px-4 pb-3 pt-5 sm:px-6 lg:px-7">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight text-[#28243A]">消息工作台</h1>
            <div className="flex flex-wrap items-center gap-2.5">
              <span role="status" className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#666075]">
                <i aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[#318269]" : "bg-[#A28455]"}`} />
                {live ? "实时同步" : "正在连接同步"}
              </span>
              <span className="rounded-lg bg-[#EAE3FB] px-2.5 py-1.5 text-[12px] font-medium tabular-nums text-[#5945A6]">待回复 {pendingCount}</span>
              {channel === "WhatsApp" ? (
                <button type="button" role="switch" aria-checked={autoReply} onClick={() => void toggleWhatsAppAutoReply()} disabled={savingAutoReply}
                  className={`${MESSAGE_ACTION} ${autoReply ? "!bg-[#EFE9FB] !text-[#51409A]" : ""}`}>
                  <span>WhatsApp AI 自动回复</span>
                  <span aria-hidden="true" className={`relative h-4 w-7 rounded-full ${autoReply ? "bg-[#6954C2]" : "bg-[#C5BFCE]"}`}>
                    <i className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${autoReply ? "left-[14px]" : "left-0.5"}`} />
                  </span>
                  {savingAutoReply ? "保存中" : autoReply ? "开启" : "关闭"}
                </button>
              ) : null}
              <a href="/channels" className={MESSAGE_ACTION}>管理渠道</a>
            </div>
          </div>
          <div className={`${styles.scrollPanel} flex gap-1.5 overflow-x-auto pb-0.5`} role="tablist" aria-label="消息渠道">
            {CHANNELS.map((tab) => {
              const active = channel === tab.value;
              return (
                <button key={tab.value} type="button" role="tab" aria-selected={active}
                  onClick={() => { setChannel(tab.value); setStatusFilter("全部"); setConnectionFilter(""); }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7663D0] ${active ? "border-[#D9CFEE] bg-white text-[#503D99] shadow-sm" : "border-transparent text-[#60596F] hover:bg-[#ECE6F8] hover:text-[#352F49]"}`}>
                  <span aria-hidden="true" className="flex"><ChannelLogo channel={tab.value} /></span>
                  {tab.label}
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${active ? "bg-[#EFE9FB] text-[#5945A6]" : "bg-[#E9E5F0] text-[#635C72]"}`}>{filteredCount(tab.value)}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 px-4 pb-4 sm:px-6 md:grid-cols-[minmax(250px,34%)_minmax(0,1fr)] md:grid-rows-[min(46rem,80dvh)] lg:grid-rows-[minmax(0,1fr)] lg:gap-0 lg:px-7 xl:grid-cols-[minmax(300px,29%)_minmax(0,1fr)]">
          <section aria-label="客户会话" className="flex h-[25rem] min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E5E0ED] bg-white shadow-sm md:h-auto lg:rounded-r-none lg:border-r-0">
            <div className="shrink-0 border-b border-[#EEEAF4] px-4 pb-3 pt-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[16px] font-semibold text-[#302B44]">客户会话</h2>
                  <p className="mt-0.5 text-[12px] text-[#6E667E]">{visibleConversations.length} 个会话</p>
                </div>
                <button type="button" onClick={() => void load(true)} disabled={refreshing}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-[#5D4AA9] hover:bg-[#F1ECFA] disabled:opacity-50">
                  {refreshing ? "刷新中…" : "刷新"}
                </button>
              </div>
              <div className="relative">
                <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#716881]"><NavIcon name="search" /></span>
                <input type="search" aria-label="搜索会话" className="w-full rounded-xl border border-[#E9E4F1] bg-[#F7F5FA] py-2.5 pl-9 pr-3 text-[13px] placeholder:text-[#716881] focus:border-[#A493D9] focus:bg-white"
                  value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索客户、号码或消息" />
              </div>
              {connectionOptions.length ? (
                <select aria-label="筛选渠道账号" className="mt-2 w-full rounded-lg border border-[#E9E4F1] bg-white px-2.5 py-1.5 text-[12px] text-[#524960] focus:border-[#A493D9]"
                  value={connectionFilter} onChange={(event) => setConnectionFilter(event.target.value)}>
                  <option value="">全部账号</option>
                  {connectionOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </select>
              ) : null}
              <div className="mt-2.5 flex gap-1.5" role="group" aria-label="会话状态">
                {(["全部", "待回复", "已回复"] as const).map((filter) => (
                  <button key={filter} type="button" aria-pressed={statusFilter === filter} onClick={() => setStatusFilter(filter)}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors ${statusFilter === filter ? "bg-[#EEE7FB] text-[#52409E]" : "bg-[#F6F4F9] text-[#635A73] hover:bg-[#EFEAF6]"}`}>
                    {filter}
                  </button>
                ))}
              </div>
            </div>
            <div aria-label="会话列表" className={`${styles.scrollPanel} min-h-0 flex-1 space-y-1 overflow-y-auto p-2.5`}>
              {visibleConversations.map((conversation) => {
                const latest = conversation.latest;
                const active = selected?.key === conversation.key;
                const waiting = conversation.items.some((item) => item.state !== "已发送");
                const unread = conversation.items.some((item) => item.channel_source === "zernio" && item.direction === "incoming" && !item.read_at);
                const detail = conversationDetails(latest).join(" · ");
                const time = shortDate(conversation.preview.date);
                return (
                  <button key={conversation.key} type="button" aria-pressed={active}
                    onClick={() => { setSelectedKey(conversation.key); setReplyError(null); setAiMsg(""); setNotice(""); }}
                    className={`flex w-full min-w-0 gap-3 rounded-xl border px-2.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#7663D0] ${active ? "border-[#DFD3F4] bg-[#F2ECFB]" : "border-transparent hover:bg-[#F7F5FA]"}`}>
                    <ContactAvatar item={latest} url={avatars[avatarKey(latest)]} channelBadge />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[15px] font-semibold text-[#282339]" title={contactName(latest)}>{contactName(latest)}</span>
                        {time ? <span className="shrink-0 text-[11px] tabular-nums text-[#6A6279]" title={`${dateLabel(conversation.preview.date)} ${messageTime(conversation.preview.date)}`}>{time}</span> : null}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        {unread || waiting ? (
                          <span aria-label={unread ? "未读" : "待回复"} title={unread ? "未读" : "待回复"}
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${unread ? "bg-[#6548C2]" : "bg-[#398269]"}`} />
                        ) : null}
                        <span className="truncate text-[13px] leading-5 text-[#514A63]">{conversation.preview.outgoing ? "你： " : ""}{conversation.preview.body || "暂无消息内容"}</span>
                      </span>
                      {detail ? <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#726981]" title={detail}>{detail}</span> : null}
                    </span>
                  </button>
                );
              })}
              {!visibleConversations.length ? (
                <div className="px-4 py-10 text-center">
                  <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-[#F1EBF9] text-[#6B53BA]"><NavIcon name="chat" /></span>
                  <p className="text-[13px] font-medium text-[#554B69]">{search.trim() || statusFilter !== "全部" ? "没有匹配的会话" : "暂无会话"}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section aria-label="聊天详情" className="flex h-[min(44rem,82dvh)] min-h-[28rem] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E5E0ED] bg-white shadow-sm md:h-auto lg:min-h-0 lg:rounded-l-none">
            {selected && activeItem ? (
              <>
                <header className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-b border-[#EEEAF4] px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <ContactAvatar item={activeItem} url={avatars[avatarKey(activeItem)]} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <h2 className="truncate text-[17px] font-semibold leading-6 text-[#282339]" title={contactName(activeItem)}>{contactName(activeItem)}</h2>
                        <ChannelLabel channel={selected.channel} />
                      </div>
                      {activeItem.connection_label || activeItem.classification ? (
                        <p className="mt-0.5 truncate text-[12px] text-[#6F657F]">{[activeItem.connection_label, activeItem.classification].filter(Boolean).join(" · ")}</p>
                      ) : null}
                    </div>
                  </div>
                  {activeItem.lead_id ? <a href={`/customers/${activeItem.lead_id}`} className={MESSAGE_ACTION}>客户资料</a> : null}
                </header>
                <div ref={streamPanel} role="log" aria-label="会话消息"
                  onScroll={(event) => {
                    const panel = event.currentTarget;
                    nearBottom.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
                  }}
                  className={`${styles.scrollPanel} flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto bg-[#F7F5FA] px-3.5 py-4 sm:px-5 lg:px-6`}>
                  {timeline.map(({ id, item, body, date, outgoing, mode }, index) => {
                    const day = dateLabel(date);
                    const startsDay = day && (index === 0 || day !== dateLabel(timeline[index - 1].date));
                    return (
                      <Fragment key={id}>
                        {startsDay ? <p className="mx-auto shrink-0 rounded-full bg-[#ECE7F3] px-3 py-1 text-[11px] font-medium tabular-nums text-[#645A76]">{day}</p> : null}
                        {outgoing ? (
                          <div className="ml-auto flex max-w-[88%] shrink-0 flex-col items-end sm:max-w-[min(80%,44rem)]">
                            <div className={`${MESSAGE_BUBBLE} rounded-br-md border border-[#E5DAFA] bg-[#EEE5FC] text-[#34264D]`}>
                              {body}{id.startsWith("message-") ? <MessageAttachments item={item} /> : null}
                            </div>
                            <p className="mt-1 pr-1 text-[11px] tabular-nums text-[#6D647B]">
                              {mode === "AI自动回复" ? "AI 自动回复" : mode === "同步发送" ? "已同步" : "已发送"} · {messageTime(date)}
                            </p>
                          </div>
                        ) : (
                          <div className="flex max-w-[93%] shrink-0 items-start gap-2.5 sm:max-w-[min(86%,46rem)]">
                            <ContactAvatar item={item} url={avatars[avatarKey(item)]} size="small" />
                            <div className="min-w-0">
                              <div className={`${MESSAGE_BUBBLE} rounded-tl-md border border-[#E9E4F0] bg-white text-[#302A42]`}>
                                {body || "（无文字内容）"}<MessageAttachments item={item} />
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-1 text-[11px]">
                                <span className="tabular-nums text-[#6D647B]">{messageTime(date)}</span>
                                {!item.translated_body ? (
                                  <button type="button" onClick={() => void translateIncoming(item)} disabled={busy !== null}
                                    className="font-medium text-[#5D47AB] hover:underline disabled:opacity-60">{busy === item.id ? "处理中…" : "翻译成中文"}</button>
                                ) : null}
                              </div>
                              {item.translated_body ? (
                                <div className="mt-2 rounded-xl border border-[#E6DCF4] bg-[#F0E9FB] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#423653] [overflow-wrap:anywhere]">
                                  <span className="mb-0.5 block text-[11px] font-semibold text-[#65508E]">中文翻译</span>
                                  <span className="whitespace-pre-wrap">{item.translated_body}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>

                <div aria-label="回复区" className="shrink-0 border-t border-[#EEEAF4] bg-white px-3.5 py-3 sm:px-5">
                  {aiMsg ? <p role="alert" className="mb-2 rounded-lg bg-[#FFF2EF] px-3 py-2 text-[12px] text-[#963E35]">{aiMsg}</p> : null}
                  {replyError?.key === selected.key ? <p role="alert" className="mb-2 rounded-lg bg-[#FFF2EF] px-3 py-2 text-[12px] text-[#963E35]">{replyError.message}</p> : null}
                  {notice ? <p role="status" className="mb-2 rounded-lg bg-[#EAF6F0] px-3 py-2 text-[12px] text-[#27684F]">{notice}</p> : null}
                  {!canReply ? (
                    <p className="mb-2 text-[12px] text-[#6D647B]">
                      {activeItem.channel_source === "zernio" ? `重新授权这段会话关联的 ${activeItem.channel} 账号后可回复。` : activeItem.connection_ref ? "重新连接这段会话原先使用的 WhatsApp 账号后可回复。" : "这条历史消息未关联 WhatsApp 账号。"}
                    </p>
                  ) : null}
                  <div className="rounded-xl border border-[#E5DEEF] bg-[#FCFBFE] focus-within:border-[#A493D9]">
                    <textarea aria-label="回复内容" className="block min-h-[74px] max-h-[22vh] w-full resize-y rounded-t-xl border-0 bg-transparent px-3.5 py-2.5 text-[14px] leading-6 text-[#302A42] placeholder:text-[#756A84]"
                      placeholder="输入回复…" value={activeDraft} disabled={!canReply || busy === activeItem.id} onChange={(event) => editDraft(activeItem.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
                        event.preventDefault();
                        if (!event.repeat) void sendReply(activeItem);
                      }} />
                    {translation[activeItem.id] ? (
                      <label className="mx-3 mb-2 block rounded-lg border border-[#E6DCF4] bg-[#F2EDFA] px-3 py-2 text-[11px] font-semibold text-[#5D497F]">
                        客户语言译文（发送时使用）
                        <textarea className="mt-1 block max-h-[14vh] w-full resize-y border-0 bg-transparent p-0 text-[13px] font-normal leading-5 text-[#423653]"
                          rows={2} value={translation[activeItem.id]} onChange={(event) => setTranslation((previous) => ({ ...previous, [activeItem.id]: event.target.value }))} />
                      </label>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EEEAF4] px-2.5 py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {canReply && activeItem.channel_source === "zernio" ? (
                          <label className={`${MESSAGE_ACTION} cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-[#7663D0]`}>
                            发送图片
                            <input type="file" aria-label="发送图片" accept="image/jpeg,image/png,image/gif" className="sr-only" disabled={busy !== null}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                if (file) void sendReply(activeItem, file);
                              }} />
                          </label>
                        ) : null}
                        <button type="button" onClick={() => void translateReply(activeItem)} disabled={busy !== null} className={MESSAGE_ACTION}>翻译客户语言</button>
                        <button type="button" onClick={() => void aiClassify(activeItem)} disabled={busy !== null} className={MESSAGE_ACTION}>
                          <span aria-hidden="true" className="text-[#6F52BF]">✦</span> AI 起草
                        </button>
                      </div>
                      <div className="ml-auto flex items-center gap-2.5">
                        {canReply ? <span className="hidden text-[11px] text-[#716781] xl:inline">Enter 发送 · Shift + Enter 换行</span> : null}
                        <button type="button" onClick={() => void sendReply(activeItem)} disabled={!canReply || busy !== null || !activeDraft.trim()}
                          className="min-h-9 rounded-lg bg-[#6048B5] px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#523A9F] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7663D0] disabled:cursor-not-allowed disabled:bg-[#DCD3EC] disabled:text-[#5D5273]">
                          {busy === activeItem.id ? "处理中…" : "发送回复"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center bg-[#FAF8FD] p-6 text-center">
                <span className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-[#F0E9FA] text-[#6B53BA]"><NavIcon name="chat" /></span>
                <h2 className="text-[15px] font-semibold text-[#524666]">选择一个客户会话</h2>
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
