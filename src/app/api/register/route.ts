import { NextRequest, NextResponse } from "next/server";
import { issueSession, registerSelfHostedAdmin, secureSessionCookies } from "@/lib/auth";
import { isSelfHosted } from "@/lib/license";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    if (isSelfHosted()) {
      const user = registerSelfHostedAdmin({ email: String(body.email || ""), password: String(body.password || ""), displayName: String(body.displayName || "") });
      const session = issueSession(user);
      const response = NextResponse.json({ ok: true, displayName: user.display_name });
      response.cookies.set("nova_session", session.token, { path: "/", httpOnly: true, sameSite: "lax", secure: secureSessionCookies(), maxAge: session.maxAge });
      return response;
    }
    return NextResponse.json({ ok: false, error: "托管客户账户由 NOVA 管理员在客户管理页创建，请联系管理员获取登录邮箱和密码。" }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "注册失败，请稍后重试" }, { status: 400 });
  }
}
