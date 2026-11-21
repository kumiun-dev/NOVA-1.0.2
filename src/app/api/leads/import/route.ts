import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur); cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_MAP: Record<string, string> = {
  "公司": "company", "公司名": "company", "company": "company",
  "姓名": "name", "名字": "name", "联系人": "name", "name": "name",
  "职位": "position", "position": "position", "title": "position",
  "邮箱": "email", "邮件": "email", "email": "email",
  "whatsapp": "whatsapp", "WhatsApp": "whatsapp", "手机号": "whatsapp", "电话": "whatsapp", "phone": "whatsapp",
  "国家": "country", "country": "country",
  "行业": "industry", "industry": "industry",
  "hs编码": "hs_code", "hs": "hs_code", "hs_code": "hs_code",
  "来源": "source", "source": "source",
};

export const POST = withAuth(async function POST(req: NextRequest) {
  const { csv } = await req.json().catch(() => ({ csv: "" }));
  if (!csv || !csv.trim()) return NextResponse.json({ error: "内容为空" }, { status: 400 });

  const rows = parseCsv(csv.replace(/^\ufeff/, ""));
  if (rows.length < 2) return NextResponse.json({ error: "缺少表头或数据行" }, { status: 400 });

  const header = rows[0].map((h) => h.trim());
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = HEADER_MAP[h.toLowerCase()] || HEADER_MAP[h];
    if (key && idx[key] === undefined) idx[key] = i;
  });

  const today = new Date().toISOString().slice(0, 10);
  const hasEmail = db.prepare("SELECT id FROM leads WHERE email = ?");
  const hasCompany = db.prepare("SELECT id FROM leads WHERE company = ?");
  const insert = db.prepare(
    `INSERT INTO leads (company, country, industry, hs_code, position, name, email, whatsapp, phone, source, status, acquired_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '线索', ?)`
  );

  let added = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const get = (k: string) => (idx[k] !== undefined ? (cells[idx[k]] || "").trim() : "");
      const company = get("company");
      const email = get("email").toLowerCase();
      if (!company && !email) continue;
      if (email && hasEmail.get(email)) { skipped++; continue; }
      if (!email && company && hasCompany.get(company)) { skipped++; continue; }
      const whatsapp = get("whatsapp");
      insert.run(
        company, get("country"), get("industry"), get("hs_code"), get("position"),
        get("name"), email, whatsapp, whatsapp, get("source") || "CSV导入", today
      );
      added++;
    }
  });
  tx();

  return NextResponse.json({ added, skipped });
});
