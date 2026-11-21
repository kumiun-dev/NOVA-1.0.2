import { extractEmails, extractPhones, mapConcurrent } from "../scraper";
import { requestText } from "../http";
import type { LeadCandidate, ProgressFn, SearchParams, SourceAdapter } from "./types";

// HTML 转纯文本（块级标签处换行，保留行内空格）
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(div|p|tr|li|h[1-6]|section|table|ul|ol)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

// ImportYeti：免费美国海关提单数据。搜产品词 → 拿到"谁从海外进口了这个产品"的美国进口商名单
// 免费版（未登录）：公司名+地址+提单数+供应商可见，邮箱电话部分隐藏（登录免费账号可见完整）
export const importYetiSource: SourceAdapter = {
  id: "importyeti",
  supports: p => p.country === "美国",
  name: "ImportYeti 海关提单",

  async search(p: SearchParams, onProgress?: ProgressFn): Promise<LeadCandidate[]> {
    const fetchPageHtml=(url:string,_wait?:number)=>requestText(url,{source:"importyeti",retries:0,signal:p.signal});
    // ImportYeti 是美国海关数据，仅服务美国市场
    if (p.country && p.country !== "美国") return [];
    const sourceName = this.name;

    const kw = p.keyword.trim();
    const searchUrl = `https://www.importyeti.com/search?q=${encodeURIComponent(kw)}`;
    let listHtml = "";
    try {
      listHtml = await fetchPageHtml(searchUrl, 4000);
    } catch (e) {
      p.signal?.throwIfAborted();p.warn?.(`${this.name}：${e instanceof Error?e.message:"查询失败"}`);
      return [];
    }

    const companies = parseCompanyLinks(listHtml, kw.toLowerCase()).slice(0, p.maxResults);
    if(!companies.length){p.warn?.("ImportYeti 公开页面未提供可读取的进口商记录，可能需要交互页面；未将其视为该行业没有买家");return [];}
    const results: LeadCandidate[] = [];

    // 并发抓详情页（3 路并发），显著提速
    const fetched = await mapConcurrent(companies, 3, async (c) => {
      try {
        const detailHtml = await fetchPageHtml("https://www.importyeti.com" + c.href, 2000);
        const detailText = htmlToText(detailHtml);
        const emails = extractEmails(detailHtml);
        const phones = extractPhones(detailHtml);
        const address = parseAddress(detailText);
        const website = parseWebsite(detailText);
        const candidate = {
          company: c.name,
          name: "",
          email: emails[0] || "",
          phone: phones[0] || "",
          whatsapp: "",
          country: "美国",
          industry: p.industry,
          position: "",
          website,
          address,
          source: sourceName,
          source_url:"https://www.importyeti.com"+c.href,
          evidence:"公开提单页面候选；产品与最近进口日期须核实，未据此认定近两年有采购意向",
        } as LeadCandidate;
        onProgress?.({ company: c.name, source: sourceName,candidate });return candidate;
      } catch {
        return null;
      }
    });
    for (const r of fetched) if (r) results.push(r);
    return results;
  },
};

// 解析搜索页公司链接：优先 /company/（进口商=买家），排除匿名化的 slug
function parseCompanyLinks(html: string, keyword: string): { name: string; href: string }[] {
  const re = /<a[^>]*href="(\/(?:company|supplier)\/[^"]+)"[^>]*>([^<]{2,80})<\/a>/g;
  const seen = new Set<string>();
  const out: { name: string; href: string }[] = [];
  let m;
  while ((m = re.exec(html)) && out.length < 40) {
    const name = m[2].trim();
    const slug = m[1].split("/")[2] || "";
    if (!name || name.length < 2) continue;
    if (/login|sign|about|contact/i.test(name)) continue;
    // 匿名化的条目 slug 等于关键词（如 /company/furniture），无真实公司名，跳过
    if (slug === keyword || slug === keyword.replace(/[^a-z0-9]+/g, "-")) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, href: m[1] });
  }
  return out;
}

function parseAddress(text: string): string {
  const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => /^address$/i.test(l));
  if (idx < 0) return "";
  let addr = "";
  for (let i = idx + 1; i < Math.min(idx + 8, lines.length); i++) {
    const l = lines[i];
    if (/^(tel|fax|att|email|also|view|name|company|www|phone|locked)/i.test(l)) break;
    if (/^https?:/i.test(l)) break;
    addr += (addr ? " " : "") + l;
  }
  return addr.slice(0, 140);
}

function parseWebsite(text: string): string {
  const m = text.match(/(?:www\.)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].slice(0, 60) : "";
}
