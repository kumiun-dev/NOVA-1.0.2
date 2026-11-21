import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /\+?\d{1,3}[\s\-.]?\(?\d{2,4}\)?[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}/g;
const JUNK_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js|json|woff2?|ico)(\?|$)/i;

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function extractCompany(html: string, url: string): string {
  const og = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i);
  if (og && og[1].trim()) return og[1].trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) {
    let t = title[1].trim();
    t = t.split(/[|｜—–-]/)[0].trim();
    t = t.replace(/(Home|Contact|About|官网|首页|联系我们|登录|Sign in|Welcome)$/i, "").trim();
    if (t && t.length >= 2 && t.length < 60) return t;
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export const POST = withAuth(async function POST(req: NextRequest) {
  const { urls } = await req.json().catch(() => ({ urls: [] }));
  if (!Array.isArray(urls) || !urls.length) {
    return NextResponse.json({ error: "请提供网址列表" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const hasEmail = db.prepare("SELECT id FROM leads WHERE email = ?");
  const insert = db.prepare(
    `INSERT INTO leads (company, country, industry, hs_code, position, name, email, whatsapp, phone, source, status, acquired_at)
     VALUES (?, '', '', '', '', '', ?, ?, ?, '公开网页', '线索', ?)`
  );

  let added = 0, skipped = 0, failed = 0;

  for (const raw of urls) {
    const url = typeof raw === "string" ? raw.trim() : "";
    if (!url) continue;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
        },
        signal: ctrl.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      if (!res.ok) { failed++; continue; }
      const html = await res.text();
      const text = stripTags(html);

      const emails = Array.from(new Set(text.match(EMAIL_RE) || []))
        .map((e) => e.toLowerCase())
        .filter((e) => !JUNK_EMAIL.test(e) && !/example\.(com|org)|sentry|wixpress|@2x|@3x|\.png|\.jpg/.test(e))
        .slice(0, 3);

      const phones = Array.from(new Set(text.match(PHONE_RE) || []))
        .map((p) => p.replace(/[\s\-.]/g, ""))
        .filter((p) => {
          const digits = p.replace(/\D/g, "");
          return digits.length >= 8 && digits.length <= 15;
        })
        .slice(0, 2);

      const company = extractCompany(html, url);
      const email = emails[0] || "";
      const whatsapp = phones[0] ? (phones[0].startsWith("+") ? phones[0] : "+" + phones[0]) : "";

      if (!email && !whatsapp && !company) { failed++; continue; }

      if (email && hasEmail.get(email)) { skipped++; continue; }

      insert.run(company || new URL(url).hostname, email, whatsapp, whatsapp, today);
      added++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ added, skipped, failed });
});
