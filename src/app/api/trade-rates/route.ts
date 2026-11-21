import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET() {
  try {
    const response = await fetch("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", {
      next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error("upstream");
    const xml = await response.text();
    const date = xml.match(/time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
    const rates = Object.fromEntries([...xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/g)]
      .map(match => [match[1], Number(match[2])]));
    if (!date || !rates.CNY || !rates.USD || !rates.GBP || !rates.JPY) throw new Error("invalid");
    return NextResponse.json({ date, rates: [
      { pair: "USD / CNY", label: "美元兑人民币", value: rates.CNY / rates.USD },
      { pair: "EUR / CNY", label: "欧元兑人民币", value: rates.CNY },
      { pair: "GBP / CNY", label: "英镑兑人民币", value: rates.CNY / rates.GBP },
      { pair: "100 JPY / CNY", label: "100 日元兑人民币", value: rates.CNY / rates.JPY * 100 },
    ] }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "汇率暂时无法更新，请稍后重试。" }, { status: 502 });
  }
});
