import { NextResponse, type NextRequest } from "next/server";
import { classifyAndDraft } from "@/lib/deepseek";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async function POST(req: NextRequest) {
  const { body, channel } = await req.json();
  try {
    const raw = await classifyAndDraft(body || "", channel || "邮件");
    const parsed = JSON.parse(raw);
    return NextResponse.json({ ok: true, ...parsed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "AI 调用失败" }, { status: 500 });
  }
});
