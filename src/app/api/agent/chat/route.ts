import { NextResponse, type NextRequest } from "next/server";
import { runAgent } from "@/lib/agent";
import { withAuth } from "@/lib/auth";

export const POST = withAuth(async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const history = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
    const model = typeof body.model === "string" ? body.model.trim() : "";
    if (model && !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) return NextResponse.json({error:"模型 ID 格式无效"},{status:400});
    const result = await runAgent(history, model || undefined);
    return NextResponse.json({ reply: result.reply, actions: result.actions });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "调用失败" }, { status: 400 });
  }
});
