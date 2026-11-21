export function publicAppUrl(fallback: string) {
  return (process.env.NOVA_PUBLIC_URL || new URL(fallback).origin).replace(/\/+$/, "");
}

export function googleOAuthAppUrl(request: Request) {
  const origin = new URL(request.url);
  const host = request.headers.get("host") || "";
  if (["localhost", "127.0.0.1"].includes(origin.hostname) && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    origin.host = host;
  }
  return publicAppUrl(origin.origin);
}

export function evolutionWebhookUrl(fallback: string) {
  return process.env.NOVA_EVOLUTION_WEBHOOK_URL || `${publicAppUrl(fallback)}/api/webhooks/evolution`;
}
