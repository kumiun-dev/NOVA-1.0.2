// 真实浏览器采集引擎：用 Playwright 模拟真人打开页面，破反爬。
// 关键点：脚本 fetch 直连会被 403/空模板拦，真实浏览器能过。
import { chromium, type Browser, type BrowserContext } from "playwright";

// 真实桌面浏览器指纹
const REAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;
  if (!launching) {
    launching = chromium
      .launch({
        headless: true,
        args: [
          "--disable-blink-features=AutomationControlled",
          "--no-sandbox",
          "--disable-dev-shm-usage",
        ],
      })
      .then((b) => {
        browser = b;
        launching = null;
        return b;
      })
      .catch((e) => {
        launching = null;
        throw e;
      });
  }
  return launching;
}

async function newContext(): Promise<BrowserContext> {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: REAL_UA,
    viewport: { width: 1366, height: 768 },
    locale: "en-US",
    timezoneId: "America/New_York",
    extraHTTPHeaders: { "Accept-Language": "en-US,en;q=0.9" },
  });
  // 抹掉自动化痕迹
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  });
  return ctx;
}

// 打开页面，等 JS 渲染完，返回完整 HTML
export async function fetchPageHtml(url: string, waitMs = 2500): Promise<string> {
  const ctx = await newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(waitMs);
    return await page.content();
  } finally {
    await ctx.close();
  }
}

// 打开页面并抓取可见文本（供列表页提取公司名/电话）
export async function fetchPageText(url: string, waitMs = 2500): Promise<string> {
  const ctx = await newContext();
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(waitMs);
    return await page.evaluate(() => document.body.innerText || "");
  } finally {
    await ctx.close();
  }
}

// 提取邮箱
export function extractEmails(html: string): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const junk =
    /\.(png|jpe?g|gif|svg|css|js|webp|woff2?)$|example\.|sentry|wixpress|schema\.org|yourdomain|godaddy|@2x|@3x|\.min\.|placeholder|no-?reply/i;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.match(re) || []) {
    const e = m.toLowerCase();
    if (junk.test(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(m);
  }
  return out.slice(0, 8);
}

// 提取电话（国际号，过滤邮编/长数字串/图表小数）
export function extractPhones(html: string): string[] {
  const re = /\+?\d[\d\s().-]{8,18}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of html.match(re) || []) {
    const t = m.replace(/\s+/g, " ").trim();
    const digits = t.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    // 过滤图表数字：含小数点且没有电话特征（+ / 括号 / 连字符）的纯小数
    if (/\.\d/.test(t) && !/[+()-]/.test(t)) continue;
    // 过滤邮编样式（5位纯数字无+号、或 xxxxx-xxxx）
    if (/^\d{5}(-\d{4})?$/.test(digits)) continue;
    // 过滤"0 0 512 512"这类图表/装饰数字（去掉空格后以 00 开头的假号）
    if (/^00\d/.test(digits)) continue;
    // 过滤全是 0 的号
    if (/^0+$/.test(digits)) continue;
    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push(t);
  }
  return out.slice(0, 10);
}

// 解码 HTML 实体
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// 从域名推断公司名：abc-imports.com -> Abc Imports
export function companyFromDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const base = host.split(".")[0].replace(/[-_]+/g, " ").trim();
    if (!base) return "";
    return base
      .split(" ")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  } catch {
    return "";
  }
}

// 提取域名
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// 并发执行：限制同时进行的任务数（真实浏览器并发太多易触发反爬，3 个较稳）
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch {
        results[idx] = undefined as unknown as R;
      }
    }
  });
  await Promise.all(workers);
  return results;
}
