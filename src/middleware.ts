import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/privacy" ||
    pathname === "/data-deletion" ||
    pathname === "/terms" ||
    pathname === "/api/license/status" ||
    pathname === "/nova-logo.png" ||
    pathname === "/favicon.svg" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/register") ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/api/q/") ||
    pathname.startsWith("/api/webhooks/evolution") ||
    pathname.startsWith("/api/webhooks/meta") ||
    pathname === "/api/webhooks/zernio"
  ) {
    return NextResponse.next();
  }
  const auth = req.cookies.get("nova_session")?.value;
  if (!auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|__removed_platform_routes__).*)"],
};
