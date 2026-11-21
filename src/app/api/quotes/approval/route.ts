import { NextResponse, type NextRequest } from "next/server";
import { getRequestUser, withAuth, type AccountUser } from "@/lib/auth";
import { db, runWithTenantDatabase, systemDb } from "@/lib/db";
import { isSelfHosted } from "@/lib/license";

type ReviewerAccount = { id: string; label: string };
function reviewAccounts(actor: AccountUser): ReviewerAccount[] {
  if (actor.role === "user") return [];
  const accounts = [{ id: actor.id, label: actor.display_name }];
  if (actor.role === "customer_admin" || isSelfHosted()) {
    const employees = systemDb.prepare(`
      SELECT id,display_name AS label FROM auth_users WHERE active=1 AND role='user' AND tenant_id=?
    `).all(actor.id) as ReviewerAccount[];
    accounts.push(...employees);
  }
  return accounts;
}

export const GET = withAuth(async function GET(req: NextRequest) {
  const actor = await getRequestUser(req);
  if (!actor) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  const accounts = reviewAccounts(actor);
  const pending = accounts.flatMap((account) => runWithTenantDatabase(account.id, () => {
    const rows = db.prepare(`
      SELECT q.id,q.quote_no,q.items,q.currency,q.total,q.approval_at,l.company FROM quotes q
      LEFT JOIN leads l ON l.id=q.lead_id WHERE q.approval_status='pending' ORDER BY q.approval_at DESC LIMIT 40
    `).all() as { id: number; quote_no: string; company: string; items: string; currency: string; total: number; approval_at: string }[];
    return rows.map((row) => ({ ...row, accountId: account.id, submitter: account.label }));
  })).sort((a, b) => b.approval_at.localeCompare(a.approval_at)).slice(0, 40);
  return NextResponse.json({ canReview: accounts.length > 0, pending });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const actor = await getRequestUser(req);
  if (!actor) return NextResponse.json({ error: "请重新登录。" }, { status: 401 });
  const { action, id, accountId } = await req.json().catch(() => ({})) ?? {};
  if (!Number.isSafeInteger(id) || id < 1) return NextResponse.json({ error: "请选择有效报价单。" }, { status: 400 });
  const now = new Date().toISOString();
  let updated;
  if (action === "submit") {
    updated = db.prepare(`
      UPDATE quotes SET approval_status='pending',approval_by='',approval_at=?
      WHERE id=? AND status='草稿' AND approval_status IN ('','rejected')
    `).run(now, id);
  } else if (action === "approve" || action === "reject") {
    const target = reviewAccounts(actor).find((account) => account.id === accountId);
    if (!target) return NextResponse.json({ error: "没有该报价的审批权限。" }, { status: 403 });
    updated = runWithTenantDatabase(target.id, () => db.prepare(`
      UPDATE quotes SET approval_status=?,approval_by=?,approval_at=? WHERE id=? AND approval_status='pending'
    `).run(action === "approve" ? "approved" : "rejected", actor.id, now, id));
  } else {
    return NextResponse.json({ error: "请选择审批操作。" }, { status: 400 });
  }
  if (!updated.changes) return NextResponse.json({ error: "报价单状态已变更，请刷新后重试。" }, { status: 409 });
  return NextResponse.json({ ok: true });
});
