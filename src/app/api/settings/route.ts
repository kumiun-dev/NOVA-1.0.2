import { NextResponse, type NextRequest } from "next/server";
import { db, getAllSettings, getGmailOAuth, getPlatformSetting, setPlatformSetting, setSetting } from "@/lib/db";
import { evolutionConfig } from "@/lib/evolution";
import { testAI } from "@/lib/deepseek";
import { verifyMail } from "@/lib/mail";
import { getRequestUser, withAuth } from "@/lib/auth";
import { googleOAuthAppUrl } from "@/lib/public-url";
import { isSelfHosted } from "@/lib/license";
import { ENTERPRISE_MAIL_KEYS, listConnections } from "@/lib/channel-connections";
import { enterpriseFormValues, listMailAccounts, saveEnterpriseAccount } from "@/lib/mail-accounts";

const FIELDS = ["ai_base_url", "ai_model", "ai_key"];


export const GET = withAuth(async function GET(req: NextRequest) {
  const all = getAllSettings();
  const user = await getRequestUser(req);
  const metaAppId = getPlatformSetting("meta_app_id");
  const google = getGmailOAuth();
  const evolution = evolutionConfig();
  const evolutionUrl = evolution.url;
  const facebook = listConnections("facebook")[0];
  const instagram = listConnections("instagram")[0];
  const gmail = listConnections("gmail")[0];
  const whatsapp = listConnections("whatsapp")[0];
  const mail = enterpriseFormValues(req.nextUrl.searchParams.get("mailAccount") || "");
  if (!mail) return NextResponse.json({ error: "该邮箱已退出" }, { status: 404 });
  return NextResponse.json({
    role: user?.role || "user",
    gmailOAuth: { clientId: google.clientId, secretConfigured: Boolean(google.clientSecret), callback: googleOAuthAppUrl(req) + "/api/channels/google/callback" },
    ai: {
      base_url: all.ai_base_url || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      model: all.ai_model || process.env.DEEPSEEK_MODEL || "deepseek-flash",
      key_configured: Boolean(all.ai_key || process.env.DEEPSEEK_API_KEY),
    },
    channels: {
      meta_app_id: metaAppId,
      meta_connected: Boolean(facebook || instagram),
      meta_page_id: facebook?.assetId || "",
      meta_page_name: facebook?.label || "",
      meta_instagram_id: instagram?.assetId || "",
      google_client_id: google.clientId,
      google_connected: Boolean(gmail),
      enterprise_mail_connected: listConnections("enterprise").length > 0,
      evolution_url: evolutionUrl,
      evolution_instance: whatsapp?.instance || "",
      evolution_configured: Boolean(evolutionUrl),
    },
    mail: { ...mail, google_email: gmail?.label || "" },
    enterpriseAccounts: listMailAccounts().filter((account) => account.type === "enterprise"),
    version: "1.0.2",
  });
});

export const POST = withAuth(async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const user = await getRequestUser(req);
  if (body.action === "gmail_oauth_save") {
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    const previous = getGmailOAuth();
    if (!clientId.endsWith(".apps.googleusercontent.com") || clientId.length > 300 || clientSecret.length > 512 || (!clientSecret && (clientId !== previous.clientId || !previous.clientSecret))) {
      return NextResponse.json({ error: "请输入有效的 Google Client ID 和对应的 Client Secret" }, { status: 400 });
    }
    db.transaction(() => {
      setSetting("gmail_oauth_client_id", clientId);
      if (clientSecret) setSetting("gmail_oauth_client_secret", clientSecret);
    })();
    return NextResponse.json({ ok: true });
  }
  if (body.action === "test") {
    const r = await testAI();
    return NextResponse.json(r);
  }
  if (body.action === "mail_test") {
    const r = await verifyMail(typeof body.account === "string" ? body.account : undefined);
    return NextResponse.json(r);
  }
  if (body.action === "mail_save" || ENTERPRISE_MAIL_KEYS.some((key) => typeof body[key] === "string" && body[key].trim())) {
    try {
      const id = saveEnterpriseAccount(body, typeof body.account === "string" ? body.account : "");
      if (body.action === "mail_save") return NextResponse.json({ ok: true, id });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "保存邮箱失败" }, { status: 400 });
    }
  }
  for (const k of FIELDS) {
    if (body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "") {
      setSetting(k, String(body[k]).trim());
    }
  }
  return NextResponse.json({ ok: true });
});
