import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

function clean(body: any) {
  return {
    sku: String(body.sku || "").trim().slice(0, 100),
    name: String(body.name || "").trim().slice(0, 200),
    specs: String(body.specs || "").trim().slice(0, 2000),
    hs_code: String(body.hs_code || "").trim().slice(0, 40),
    unit_cost: Math.max(0, Number(body.unit_cost) || 0),
    cost_currency: String(body.cost_currency || "CNY").slice(0, 8),
    packaging_cost: Math.max(0, Number(body.packaging_cost) || 0),
    default_margin: Math.min(90, Math.max(0, Number(body.default_margin) || 0)),
    default_price: Math.max(0, Number(body.default_price) || 0),
    moq: Math.max(1, Math.floor(Number(body.moq) || 1)),
    lead_time: String(body.lead_time || "").trim().slice(0, 200),
  };
}

export const GET = withAuth(async function GET() {
  const products = db.prepare("SELECT * FROM products ORDER BY updated_at DESC, id DESC").all();
  return NextResponse.json({ products });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const product = clean(body);
  if (!product.name) return NextResponse.json({ error: "请填写产品名称" }, { status: 400 });
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  if (Number(body.id)) {
    db.prepare(`UPDATE products SET sku=@sku,name=@name,specs=@specs,hs_code=@hs_code,unit_cost=@unit_cost,cost_currency=@cost_currency,packaging_cost=@packaging_cost,default_margin=@default_margin,default_price=@default_price,moq=@moq,lead_time=@lead_time,updated_at=@updated_at WHERE id=@id`).run({ ...product, updated_at: now, id: Number(body.id) });
  } else {
    db.prepare(`INSERT INTO products (sku,name,specs,hs_code,unit_cost,cost_currency,packaging_cost,default_margin,default_price,moq,lead_time,created_at,updated_at) VALUES (@sku,@name,@specs,@hs_code,@unit_cost,@cost_currency,@packaging_cost,@default_margin,@default_price,@moq,@lead_time,@created_at,@updated_at)`).run({ ...product, created_at: now, updated_at: now });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "缺少产品编号" }, { status: 400 });
  db.prepare("DELETE FROM products WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
});
