import { extractEmails, decodeEntities, mapConcurrent } from "../scraper";
import { COUNTRIES } from "./countries";
import { requestText } from "../http";
import type { LeadCandidate, ProgressFn, SearchParams, SourceAdapter } from "./types";

// Hotfrog：全球企业名录，已验证可用真实浏览器抓到公司名+电话+地址
export const hotfrogSource: SourceAdapter = {
  id: "hotfrog",
  supports: p => !!p.country && !!COUNTRIES[p.country]?.hotfrog,
  name: "Hotfrog 企业名录",

  async search(p: SearchParams, onProgress?: ProgressFn): Promise<LeadCandidate[]> {
    const fetchPageHtml=(url:string,_wait?:number)=>requestText(url,{source:"hotfrog",retries:0,signal:p.signal});
    const sourceName = this.name;
    const cc = COUNTRIES[p.country]?.hotfrog || "us";
    // 生成多个搜索词变体，扩大覆盖面
    const kwBase = p.keyword.trim().replace(/\s+/g, "-").toLowerCase();
    const kwVars = [
      kwBase,
      `${kwBase}-wholesale`,
      `${kwBase}-distributor`,
      `${kwBase}-importer`,
      `${kwBase}-supplier`,
    ];

    const seenCompanies = new Set<string>();
    const results: LeadCandidate[] = [];

    for (const kw of kwVars) {
      if (results.length >= p.maxResults) break;
      const searchUrl = `https://www.hotfrog.com/search/${cc}/${kw}`;
      let listHtml = "";
      try {
        listHtml = await fetchPageHtml(searchUrl, 2500);
      } catch (e) {
        p.signal?.throwIfAborted();p.warn?.(`${this.name}：${e instanceof Error?e.message:"查询失败"}`);break;
      }
      const companies = parseCompanyLinks(listHtml).filter((c) => !seenCompanies.has(c.name.toLowerCase()));
      if(!companies.length&&/captcha|challenge|cloudflare|enable javascript/i.test(listHtml)){p.warn?.("Hotfrog 要求交互验证，未绕过，也未将其当作无客户");break;}
      companies.forEach((c) => seenCompanies.add(c.name.toLowerCase()));
      const room = p.maxResults - results.length;
      const batch = companies.slice(0, room);

      // 并发抓详情页（3 路并发）
      const fetched = await mapConcurrent(batch, 3, async (c) => {
        try {
          const detailHtml = await fetchPageHtml("https://www.hotfrog.com" + c.href, 1800);
          const tel = detailHtml.match(/href="tel:([^"]+)"/)?.[1] || "";
          const emails = extractEmails(detailHtml);
          const address = parseAddress(detailHtml);
          return {
            company: c.name,
            name: "",
            email: emails[0] || "",
            phone: tel,
            whatsapp: "",
            country: p.country,
            industry: p.industry,
            position: "",
            website: "",
            source_url:"https://www.hotfrog.com"+c.href,
            evidence:"公开商家名录；采购意向未核实",
            address,
            source: sourceName,
          } as LeadCandidate;
        } catch {
          return null;
        }
      });
      for (const r of fetched) {
        if (!r) continue;
        if (results.length >= p.maxResults) break;
        results.push(r);
        onProgress?.({company:r.company,source:sourceName,candidate:r});
      }
    }
    return results;
  },
};

function parseCompanyLinks(html: string): { name: string; href: string }[] {
  const re = /<a[^>]*href="(\/company\/[^"]+)"[^>]*>([^<]{2,80})<\/a>/g;
  const seen = new Set<string>();
  const out: { name: string; href: string }[] = [];
  let m;
  while ((m = re.exec(html)) && out.length < 30) {
    const name = decodeEntities(m[2].trim());
    if (!name || name.length < 2) continue;
    if (/claim|review|add|login|account|hotfrog/i.test(name)) continue;
    // 去重：/company/{id} 部分
    const key = m[1].split("/").slice(0, 3).join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, href: m[1] });
  }
  return out;
}

function parseAddress(html: string): string {
  const m = html.match(/<summary[^>]*>([^<]{10,140})<\/summary>/);
  return m ? m[1].trim() : "";
}
