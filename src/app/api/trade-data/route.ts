import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withAuth } from "@/lib/auth";

export const GET = withAuth(async function GET() {
  const customers = (db.prepare("SELECT COUNT(*) AS count FROM leads").get() as any).count;
  const quotes = (db.prepare("SELECT COUNT(*) AS count FROM quotes").get() as any).count;
  const accepted = (db.prepare("SELECT COUNT(*) AS count FROM quotes WHERE status IN ('已接受','成交')").get() as any).count;
  const quoteValues = db.prepare("SELECT currency AS name,currency,COUNT(*) AS count,SUM(total) AS total FROM quotes GROUP BY currency ORDER BY total DESC").all();
  const byCountry = db.prepare("SELECT COALESCE(NULLIF(country,''),'未填写') AS name,COUNT(*) AS count FROM leads GROUP BY country ORDER BY count DESC LIMIT 12").all();
  const byIndustry = db.prepare("SELECT COALESCE(NULLIF(industry,''),'未填写') AS name,COUNT(*) AS count FROM leads GROUP BY industry ORDER BY count DESC LIMIT 12").all();
  const byStage = db.prepare("SELECT status AS name,COUNT(*) AS count FROM leads GROUP BY status ORDER BY count DESC").all();
  const bySource = db.prepare("SELECT COALESCE(NULLIF(source,''),'未填写') AS name,COUNT(*) AS count FROM leads GROUP BY source ORDER BY count DESC LIMIT 8").all();
  const months = db.prepare("SELECT substr(created_at,1,7) AS month,COUNT(*) AS count FROM quotes WHERE created_at<>'' GROUP BY month ORDER BY month DESC LIMIT 6").all();
  return NextResponse.json({ customers, quotes, accepted, acceptanceRate: quotes ? Math.round(accepted / quotes * 100) : 0, quoteValues, byCountry, byIndustry, byStage, bySource, months, sourceLabel: "本平台客户与报价记录" });
});
