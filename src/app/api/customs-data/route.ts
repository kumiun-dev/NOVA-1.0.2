import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

export const dynamic = "force-dynamic";

type RefRow = { id: number; text: string; reporterCode?: number; reporterDesc?: string; reporterCodeIsoAlpha2?: string; reporterCodeIsoAlpha3?: string; isGroup?: boolean };
type Commodity = { id: string; text: string; isLeaf?: string };
type TradeRow = {
  period: string; reporterCode: number; partnerCode: number; cmdCode: string;
  primaryValue: number | null; netWgt: number | null; qty: number | null;
};

function flagEmoji(code?: string) {
  if (!code || code.length !== 2) return "🌐";
  return [...code.toUpperCase()].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

const BASE = "https://comtradeapi.un.org";
let reportersCache: { rows: RefRow[]; at: number } | null = null;
let commoditiesCache: { rows: Commodity[]; at: number } | null = null;

async function reference<T>(name: string): Promise<T[]> {
  const cache = name === "Reporters.json" ? reportersCache : commoditiesCache;
  if (cache && Date.now() - cache.at < 24 * 60 * 60 * 1000) return cache.rows as T[];
  // Ship the small, stable reference tables with NOVA so search does not depend
  // on downloading the 1.7 MB HS catalog during a user's request.
  let data: { results?: T[] };
  try {
    const localPath = join(process.cwd(), "public", "customs-reference", `${name}.gz`);
    data = JSON.parse(gunzipSync(readFileSync(localPath)).toString("utf8"));
  } catch {
    const response = await fetch(`${BASE}/files/v1/app/reference/${name}`, { cache: "no-store", signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error("公开海关参考数据暂时无法访问，请稍后重试。");
    data = await response.json();
  }
  const rows = (data.results || []) as T[];
  if (name === "Reporters.json") reportersCache = { rows: rows as RefRow[], at: Date.now() };
  else commoditiesCache = { rows: rows as Commodity[], at: Date.now() };
  return rows;
}

export const GET = withAuth(async function GET() {
  try {
    const rows = await reference<RefRow>("Reporters.json");
    return NextResponse.json({ countries: rows.filter((r) => !r.isGroup).map((r) => ({ code: r.reporterCode ?? r.id, name: r.reporterDesc || r.text, iso2: r.reporterCodeIsoAlpha2 || "", iso3: r.reporterCodeIsoAlpha3 || "" })).sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "国家列表加载失败" }, { status: 502 });
  }
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const company = String(body.company || "").trim();
  const product = String(body.product || "").trim();
  const country = String(body.country || "").trim();
  const flow = body.flow === "X" ? "X" : "M";
  if (!company && !product) return NextResponse.json({ error: "请输入公司名称或产品关键词后再筛选；只选择国家不能搜索。" }, { status: 400 });
  if (company && !product) {
    return NextResponse.json({
      rows: [],
      notice: "免费公开海关统计不包含进口商/出口商公司名称，因此无法返回可核实的公司级报关记录。可改用产品关键词或 HS 编码浏览国家汇总数据。",
    });
  }

  try {
    const [reporters, commodities] = await Promise.all([
      reference<RefRow>("Reporters.json"), reference<Commodity>("H6.json"),
    ]);
    const codeInput = product.match(/^\d{2,6}$/)?.[0];
    const localTerms: Record<string, string> = { "家具": "furniture", "家居用品": "household", "五金": "hardware", "五金工具": "hand tools", "电子元器件": "electronic components", "电子产品": "electronics", "木制家具": "wooden furniture", "塑料制品": "plastics", "服装": "apparel", "玩具": "toys", "不锈钢": "stainless steel", "汽车配件": "motor vehicle parts", "汽配": "motor vehicle parts", "厨具": "kitchenware", "船舶配件": "ship parts" };
    const searchText = localTerms[product] || product;
    const commonCodes: Record<string, string> = { "furniture": "9403", "wooden furniture": "940360", "electronic components": "8542", "toys": "9503", "motor vehicle parts": "8708" };
    let selected: Commodity | undefined;
    if (codeInput) selected = commodities.find((r) => r.id === codeInput);
    else if (commonCodes[searchText.toLocaleLowerCase()]) selected = commodities.find((r) => r.id === commonCodes[searchText.toLocaleLowerCase()]);
    else {
      const needle = searchText.toLocaleLowerCase();
      const description = (r: Commodity) => r.text.toLocaleLowerCase().replace(/^\d+\s*-\s*/, "");
      const matches = commodities.filter((r) => r.id !== "TOTAL" && description(r).includes(needle));
      const leadingMatches = matches.filter((r) => description(r).startsWith(`${needle};`) || description(r).startsWith(`${needle} and`));
      selected = matches.find((r) => description(r) === needle)
        || leadingMatches.find((r) => r.id.length === 4)
        || leadingMatches[0]
        || matches.filter((r) => r.isLeaf === "1").sort((a, b) => a.id.length - b.id.length)[0]
        || matches[0];
    }
    if (!selected || selected.id === "TOTAL") {
      return NextResponse.json({ rows: [], error: "没有匹配到 HS 产品编码。请使用英文产品名称或直接输入 2–6 位 HS 编码（例如：furniture 或 940360）。" }, { status: 422 });
    }

    const firstYear = new Date().getFullYear() - 1;
    const collected: TradeRow[] = [];
    let capped = false;
    let lastStatus = 0;
    let foundPeriods = 0;
    const periodsNeeded = country ? 1 : 3;
    // Query recent annual releases one year at a time (the public preview accepts
    // only one period per call). For all reporters, combine recent years and keep
    // only each reporter's newest available record.
    for (let year = firstYear; year >= Math.max(firstYear - 5, 2015); year--) {
      const params = new URLSearchParams({ cmdCode: selected.id, partnerCode: "0", flowCode: flow, period: String(year) });
      if (country) params.set("reporterCode", country);
      const endpoint = `${BASE}/public/v1/preview/C/A/HS?${params}`;
      let response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      }
      lastStatus = response.status;
      if (!response.ok) {
        throw new Error(`UN Comtrade 查询失败（HTTP ${response.status}）。请稍后重试。`);
      }
      const candidate = await response.json();
      if (Array.isArray(candidate.data) && candidate.data.length) {
        collected.push(...candidate.data as TradeRow[]);
        capped ||= Number(candidate.count || candidate.data.length) >= 500;
        foundPeriods++;
        if (foundPeriods >= periodsNeeded || collected.length >= 500) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    if (!collected.length) {
      if (lastStatus && lastStatus !== 200) throw new Error(`UN Comtrade 查询失败（HTTP ${lastStatus}）。请稍后重试。`);
      return NextResponse.json({ rows: [], product: selected.text, query: product, hsCode: selected.id, notice: `最近几年没有找到该商品的${flow === "M" ? "进口" : "出口"}统计记录。可尝试更宽泛的产品词或 HS 编码。` });
    }
    const newestByReporter = new Map<number, TradeRow>();
    for (const row of collected) {
      const previous = newestByReporter.get(row.reporterCode);
      if (!previous || Number(row.period) > Number(previous.period)) newestByReporter.set(row.reporterCode, row);
    }
    const records = [...newestByReporter.values()];
    const countryNames = new Map(reporters.map((r) => [r.reporterCode ?? r.id, { name: r.reporterDesc || r.text, iso2: r.reporterCodeIsoAlpha2 }]));
    const rows = records.map((r) => ({
      year: r.period, country: countryNames.get(r.reporterCode)?.name || `国家代码 ${r.reporterCode}`,
      countryIso2: countryNames.get(r.reporterCode)?.iso2 || "",
      flag: flagEmoji(countryNames.get(r.reporterCode)?.iso2),
      partner: r.partnerCode === 0 ? "全球伙伴合计" : `伙伴代码 ${r.partnerCode}`,
      product: selected!.text, hsCode: r.cmdCode, flow: flow === "M" ? "进口" : "出口",
      tradeValue: r.primaryValue, netWeight: r.netWgt, quantity: r.qty,
    })).sort((a, b) => Number(b.year) - Number(a.year) || Number(b.tradeValue || 0) - Number(a.tradeValue || 0));
    return NextResponse.json({
      rows, product: selected.text, query: product, hsCode: selected.id, capped,
      ...(company ? {
        notice: "以下是该产品的国家汇总统计，未按公司名筛选，不能视为该公司的报关记录。",
      } : {}),
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "公开海关统计服务响应超时，请稍后重试。" : error instanceof Error ? error.message : "海关数据查询失败，请稍后重试。" }, { status: 502 });
  }
});
