import { NextResponse, type NextRequest } from "next/server";
import { languageName, translateText } from "@/lib/messages";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async function POST(req: NextRequest) {
  const { text, target, inboxId } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "请输入要翻译的内容" }, { status: 400 });
  try {
    const translated = await translateText(text.trim(), languageName(String(target || "en")));
    if (inboxId) db.prepare("UPDATE inbox SET translated_body = ?, language = ? WHERE id = ?").run(translated, String(target || "en"), Number(inboxId));
    return NextResponse.json({ ok: true, translated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "翻译失败" }, { status: 500 });
  }
});
