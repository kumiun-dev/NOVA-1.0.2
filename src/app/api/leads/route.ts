import { NextResponse, type NextRequest } from "next/server";
import { db, completenessOf } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json();
  if (body.id && body.status) {
    db.prepare("UPDATE leads SET status = ?, note = ? WHERE id = ?").run(body.status, body.note ?? "", body.id);
    return NextResponse.json({ ok: true });
  }
  if (!String(body.company || "").trim()) return NextResponse.json({ error: "客户公司名不能为空" }, { status: 400 });
  const duplicate = db.prepare("SELECT id FROM leads WHERE (country=? AND lower(company)=lower(?)) OR (email!='' AND lower(email)=lower(?))").get(body.country || "", String(body.company).trim(), String(body.email || "").trim()) as { id: number } | undefined;
  if (duplicate) return NextResponse.json({ ok: true, id: duplicate.id, duplicate: true });
  const now = new Date().toISOString().slice(0, 10);
  const result = db.prepare(
    `INSERT INTO leads (company, country, industry, hs_code, position, name, email, whatsapp, phone, website, address, source, status, acquired_at, source_url, evidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '线索', ?, ?, ?)`
  ).run(
    body.company || "", body.country || "", body.industry || "", body.hs_code || "", body.position || "",
    body.name || "", body.email || "", body.whatsapp || "", body.phone || "", body.website || "", body.address || "", body.source || "手动录入", now, body.source_url || "", body.evidence || ""
  );
  return NextResponse.json({ ok: true, id: Number(result.lastInsertRowid) });
});

export const PATCH = withAuth(async function PATCH(req: NextRequest) {
  const body = await req.json();
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "客户编号无效" }, { status: 400 });
  if (!String(body.company || "").trim()) return NextResponse.json({ error: "公司名不能为空" }, { status: 400 });
  const result = db.prepare(`UPDATE leads SET company=?, name=?, email=?, whatsapp=?, phone=?, country=?, industry=?, position=?, website=?, address=? WHERE id=?`)
    .run(String(body.company).trim(), body.name || "", body.email || "", body.whatsapp || "", body.phone || "", body.country || "", body.industry || "", body.position || "", body.website || "", body.address || "", id);
  if (!result.changes) return NextResponse.json({ error: "没有找到这位客户" }, { status: 404 });
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [body.id];
  const ids: number[] = Array.from(new Set<number>(rawIds.map((value) => Number(value)).filter((n) => Number.isSafeInteger(n) && n > 0)));
  if (!ids.length) return NextResponse.json({ error: "请选择要删除的客户" }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: "单次最多删除 500 位客户" }, { status: 400 });
  const placeholders = ids.map(() => "?").join(",");
  const remove = db.transaction(() => {
    db.prepare(`DELETE FROM inbox WHERE lead_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM quotes WHERE lead_id IN (${placeholders})`).run(...ids);
    db.prepare(`DELETE FROM followups WHERE lead_id IN (${placeholders})`).run(...ids);
    return db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids).changes;
  });
  const deleted = remove();
  return NextResponse.json({ ok: true, deleted });
});

export const GET = withAuth(async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = sp.get("country") || "";
  const industry = sp.get("industry") || "";
  const position = sp.get("position") || "";
  const keyword = sp.get("keyword") || "";
  const source = sp.get("source") || "";

  const cond: string[] = [];
  const params: any[] = [];
  if (country) { cond.push("country = ?"); params.push(country); }
  if (industry) { cond.push("industry = ?"); params.push(industry); }
  if (position) { cond.push("position = ?"); params.push(position); }
  if (source) { cond.push("source = ?"); params.push(source); }
  if (keyword) { cond.push("(company LIKE ? OR name LIKE ? OR email LIKE ?)"); const k = `%${keyword}%`; params.push(k, k, k); }

  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY id DESC`).all(...params) as any[];

  const leads = rows.map((r) => ({
    ...r,
    completeness: completenessOf(r),
  }));
  leads.sort((a, b) => b.completeness - a.completeness || a.company.localeCompare(b.company));

  return NextResponse.json({ leads, total: leads.length });
});
