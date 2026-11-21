import { NextResponse, type NextRequest } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET() {
  return NextResponse.json({ autoReply: getSetting("ai_auto_reply") === "true" });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.autoReply !== "boolean") return NextResponse.json({ error: "请提供自动回复开关状态" }, { status: 400 });
  setSetting("ai_auto_reply", body.autoReply ? "true" : "false");
  return NextResponse.json({ ok: true, autoReply: body.autoReply });
});
