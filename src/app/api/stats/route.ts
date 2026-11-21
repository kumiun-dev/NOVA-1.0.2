import { NextResponse } from "next/server";
import { db, runWithTenantDatabase, systemDb } from "@/lib/db";
import { getRequestUser, withAuth } from "@/lib/auth";
import { NextRequest } from "next/server";

export const GET = withAuth(async function GET(req: NextRequest) {
  const actor = await getRequestUser(req);
  const tenantAdmin = process.env.NOVA_DEPLOYMENT_MODE !== "selfhost" && actor?.role === "customer_admin";
  if ((process.env.NOVA_DEPLOYMENT_MODE === "selfhost" && actor?.role === "admin") || tenantAdmin) {
    const accounts = tenantAdmin
      ? systemDb.prepare("SELECT id,display_name,role FROM auth_users WHERE active=1 AND tenant_id=? ORDER BY role DESC,display_name").all(actor!.id) as { id: string; display_name: string; role: string }[]
      : systemDb.prepare("SELECT id,display_name,role FROM auth_users WHERE active=1 ORDER BY role DESC,display_name").all() as { id: string; display_name: string; role: string }[];
    const snapshots = accounts.map((account) => runWithTenantDatabase(account.id, () => ({
      id: account.id, role: account.role, account: account.display_name || "管理员",
      total: (db.prepare("SELECT COUNT(*) c FROM leads").get() as any).c,
      byStatus: db.prepare("SELECT status,COUNT(*) c FROM leads GROUP BY status").all() as any[],
      bySource: db.prepare("SELECT source,COUNT(*) c FROM leads GROUP BY source").all() as any[],
      byCountry: db.prepare("SELECT country,COUNT(*) c FROM leads WHERE country!='' GROUP BY country").all() as any[],
      pending: (db.prepare("SELECT COUNT(*) c FROM inbox WHERE state='待批准'").get() as any).c,
      inboxTotal: (db.prepare("SELECT COUNT(*) c FROM inbox").get() as any).c,
      quoteTotal: (db.prepare("SELECT COUNT(*) c FROM quotes").get() as any).c,
      quoteAccepted: (db.prepare("SELECT COUNT(*) c FROM quotes WHERE status='已接受'").get() as any).c,
      dealCount: (db.prepare("SELECT COUNT(*) c FROM leads WHERE status='成交'").get() as any).c,
      hasEmail: (db.prepare("SELECT COUNT(*) c FROM leads WHERE email!=''").get() as any).c,
      hasWa: (db.prepare("SELECT COUNT(*) c FROM leads WHERE whatsapp!=''").get() as any).c,
      todayNew: (db.prepare("SELECT COUNT(*) c FROM leads WHERE acquired_at=?").get(new Date().toISOString().slice(0,10)) as any).c,
      followupToday: (db.prepare("SELECT COUNT(*) c FROM followups WHERE next_at!='' AND next_at<=date('now')").get() as any).c,
      followups: db.prepare(`SELECT f.id,f.lead_id,f.content,f.next_at,f.created_at,l.company FROM followups f LEFT JOIN leads l ON l.id=f.lead_id WHERE f.next_at!='' AND f.next_at<=date('now') ORDER BY f.next_at LIMIT 10`).all() as any[],
    })));
    const merge = (key: "byStatus" | "bySource" | "byCountry") => { const map = new Map<string, number>(); for (const snapshot of snapshots) for (const row of snapshot[key]) map.set(row.status ?? row.source ?? row.country, (map.get(row.status ?? row.source ?? row.country) || 0) + row.c); return [...map].map(([name,c]) => key === "byStatus" ? { status:name,c } : key === "bySource" ? { source:name,c } : { country:name,c }).sort((a,b) => b.c-a.c); };
    return Response.json({ total:snapshots.reduce((a,s)=>a+s.total,0), pending:snapshots.reduce((a,s)=>a+s.pending,0), inboxTotal:snapshots.reduce((a,s)=>a+s.inboxTotal,0), quoteTotal:snapshots.reduce((a,s)=>a+s.quoteTotal,0), quoteAccepted:snapshots.reduce((a,s)=>a+s.quoteAccepted,0), dealCount:snapshots.reduce((a,s)=>a+s.dealCount,0), hasEmail:snapshots.reduce((a,s)=>a+s.hasEmail,0), hasWa:snapshots.reduce((a,s)=>a+s.hasWa,0), todayNew:snapshots.reduce((a,s)=>a+s.todayNew,0), followupToday:snapshots.reduce((a,s)=>a+s.followupToday,0), followups:snapshots.flatMap(s=>s.followups.map((f:any)=>({...f,employee:s.account}))).slice(0,10), byStatus:merge("byStatus"), bySource:merge("bySource"), byCountry:merge("byCountry").slice(0,8), employeeTotals:snapshots.filter(s=>s.role==="user").map(s=>({displayName:s.account,total:s.total,inboxTotal:s.inboxTotal,quoteTotal:s.quoteTotal,dealCount:s.dealCount})) });
  }
  const total = (db.prepare("SELECT COUNT(*) c FROM leads").get() as any).c;
  const byStatus = db.prepare("SELECT status, COUNT(*) c FROM leads GROUP BY status").all() as any[];
  const bySource = db.prepare("SELECT source, COUNT(*) c FROM leads GROUP BY source").all() as any[];
  const byCountry = db.prepare("SELECT country, COUNT(*) c FROM leads WHERE country != '' GROUP BY country ORDER BY c DESC LIMIT 8").all() as any[];
  const pending = (db.prepare("SELECT COUNT(*) c FROM inbox WHERE state='待批准'").get() as any).c;
  const inboxTotal = (db.prepare("SELECT COUNT(*) c FROM inbox").get() as any).c;
  const quoteTotal = (db.prepare("SELECT COUNT(*) c FROM quotes").get() as any).c;
  const quoteAccepted = (db.prepare("SELECT COUNT(*) c FROM quotes WHERE status='已接受'").get() as any).c;
  const dealCount = (db.prepare("SELECT COUNT(*) c FROM leads WHERE status='成交'").get() as any).c;
  const hasEmail = (db.prepare("SELECT COUNT(*) c FROM leads WHERE email != ''").get() as any).c;
  const hasWa = (db.prepare("SELECT COUNT(*) c FROM leads WHERE whatsapp != ''").get() as any).c;
  const followupToday = (db.prepare("SELECT COUNT(*) c FROM followups WHERE next_at != '' AND next_at <= date('now')").get() as any).c;
  const today = new Date().toISOString().slice(0, 10);
  const todayNew = (db.prepare("SELECT COUNT(*) c FROM leads WHERE acquired_at = ?").get(today) as any).c;
  const followups = db.prepare(
    `SELECT f.id, f.lead_id, f.content, f.next_at, f.created_at, l.company
     FROM followups f LEFT JOIN leads l ON l.id = f.lead_id
     WHERE f.next_at != '' AND f.next_at <= ?
     ORDER BY f.next_at ASC LIMIT 10`
  ).all(today) as any[];

  return NextResponse.json({
    total, pending, inboxTotal, quoteTotal, quoteAccepted, dealCount,
    hasEmail, hasWa, followupToday, todayNew, followups,
    byStatus, bySource, byCountry,
  });
});
