import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (id) {
    const doc = db.prepare("SELECT id,title,content,category FROM knowledge_docs WHERE id=?").get(id);
    return doc ? NextResponse.json({ doc }) : NextResponse.json({ error: "资料不存在" }, { status: 404 });
  }
  const docs = db.prepare("SELECT id,title,category,substr(content,1,500) AS preview,length(content) AS characters,created_at,updated_at FROM knowledge_docs ORDER BY updated_at DESC,id DESC").all();
  return NextResponse.json({ docs });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title || "").trim().slice(0, 200);
  const content = String(body.content || "").trim();
  const category = String(body.category || "产品资料").trim().slice(0, 50);
  if (!title || !content) return NextResponse.json({ error: "标题和资料内容不能为空" }, { status: 400 });
  if (content.length > 200_000) return NextResponse.json({ error: "单份资料最多 20 万字，请拆分后上传" }, { status: 413 });
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  if (Number(body.id)) {
    db.prepare("UPDATE knowledge_docs SET title=?,content=?,category=?,updated_at=? WHERE id=?").run(title, content, category, now, Number(body.id));
  } else {
    db.prepare("INSERT INTO knowledge_docs (title,content,category,created_at,updated_at) VALUES (?,?,?,?,?)").run(title, content, category, now, now);
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = withAuth(async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "缺少资料编号" }, { status: 400 });
  db.prepare("DELETE FROM knowledge_docs WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
});
