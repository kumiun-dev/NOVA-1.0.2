import { NextResponse } from "next/server";
import { secureSessionCookies } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("nova_session", "", { path: "/", httpOnly: true, sameSite: "lax", secure: secureSessionCookies(), maxAge: 0 });
  return res;
}
