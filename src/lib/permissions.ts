export const MODULES = [
  ["overview", "概览"], ["agent", "智能体"], ["customers", "客户管理"], ["acquisition", "AI获客"],
  ["customs", "海关数据"], ["channels", "社媒渠道"], ["messages", "消息工作台"], ["mail", "邮件"],
  ["sales", "销售工作台"], ["quotes", "报价单"], ["quoteLibrary", "报价资料库"], ["calculator", "报价与利润"],
  ["knowledge", "知识库"], ["trade", "贸易数据"], ["settings", "设置"],
] as const;
export type ModuleId = typeof MODULES[number][0];
export const DEFAULT_MODULES: ModuleId[] = MODULES.map(([id]) => id);

export function normalizePermissions(raw: unknown): ModuleId[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(MODULES.map(([id]) => id));
  return [...new Set(raw.filter((item): item is ModuleId => typeof item === "string" && valid.has(item)))];
}

const PATH_MODULES: Record<string, ModuleId> = {
  "/": "overview", "/agent": "agent", "/api/ai": "agent", "/api/translate": "agent",
  "/customers": "customers", "/api/leads": "customers", "/dashboard": "acquisition", "/api/acquisition": "acquisition", "/api/collect": "acquisition", "/api/collect/search": "acquisition", "/api/acquisition/verify": "acquisition",
  "/customs-data": "customs", "/api/customs-data": "customs", "/channels": "channels", "/api/channels": "channels",
  "/messages": "messages", "/api/inbox": "messages", "/api/agent/mode": "messages", "/api/agent/chat": "agent",
  "/mail": "mail", "/api/mail": "mail", "/workbench": "sales", "/api/workbench": "sales",
  "/quotes": "quotes", "/api/quotes": "quotes", "/api/products": "quoteLibrary", "/quotes/library": "quoteLibrary",
  "/quotes/calculator": "calculator", "/knowledge": "knowledge", "/api/knowledge": "knowledge",
  "/trade-data": "trade", "/api/trade-data": "trade", "/settings": "settings", "/api/stats": "overview",
};

export function moduleForPath(path: string): ModuleId | null {
  const pathname = path.startsWith("/api/") ? path : path;
  const match = Object.entries(PATH_MODULES).sort(([a], [b]) => b.length - a.length).find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match?.[1] || null;
}
