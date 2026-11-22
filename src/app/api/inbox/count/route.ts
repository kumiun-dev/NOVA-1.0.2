import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { db } from "@/lib/db";

// Same pending-reply definition as the message workspace, scoped by withAuth.
// Do not load message bodies, attachments or connection configuration for a badge.
export const GET = withAuth(async function GET() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM inbox WHERE state <> '已发送'").get() as { count: number };
  return NextResponse.json({ count }, { headers: { "Cache-Control": "private, no-store" } });
});
