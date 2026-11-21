export type QuoteItem = { name: string; spec: string; qty: number; unit: number; amount: number; product_id?: number };
export type Quote = {
  id: number; lead_id: number | null; quote_no: string; company: string | null; items: string;
  total: number; currency: string; status: string; created_at: string; token: string; approval_status: string; valid_until: string;
};
export type QuoteProduct = {
  id: number; name: string; specs: string; cost_currency: string; unit_cost: number; packaging_cost: number;
  default_price: number; default_margin: number; moq: number; lead_time: string;
};
export type QuoteCounts = { awaiting: number; quoted: number; samples: number; deals: number };
export const APPROVAL_LABELS: Record<string, string> = { pending: "待审批", approved: "已通过", rejected: "已退回" };

export function quoteItems(raw: string): QuoteItem[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.name === "string") : [];
  } catch { return []; }
}

export function canSendQuote(approval: string) {
  return approval !== "pending" && approval !== "rejected";
}

export function sameQuotedProduct(a: QuoteItem, b: QuoteItem) {
  if (a.product_id && b.product_id) return a.product_id === b.product_id;
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

export function reviewQuoteLine(item: QuoteItem, products: QuoteProduct[], currency: string, rates: Record<string, string>) {
  const catalog = item.product_id ? products.find((product) => product.id === item.product_id) : undefined;
  const matching = catalog ? [] : products.filter((product) => product.name.trim() === item.name.trim() && product.specs.trim() === (item.spec || "").trim());
  const product = catalog ?? (matching.length === 1 ? matching[0] : undefined);
  const quantity = Number(item.qty);
  const price = Number(item.unit);
  const rate = product?.cost_currency === currency ? 1 : Number(rates[product?.cost_currency || ""]);
  const cost = product && product.unit_cost > 0 && Number.isFinite(rate) && rate > 0
    ? (product.unit_cost + product.packaging_cost) * rate : null;
  const margin = cost !== null && price > 0 ? (price - cost) / price * 100 : null;
  return { item, product, cost, margin, belowMoq: Boolean(product && quantity < product.moq) };
}
