import { getSetting } from "./db";

function cfg(name: string, env: string, def: string): string {
  return getSetting(name) || process.env[env] || def;
}

function aiKey(): string {
  return getSetting("ai_key") || process.env.DEEPSEEK_API_KEY || "";
}

export type AIMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chat(messages: AIMessage[], opts?: { json?: boolean; signal?: AbortSignal }): Promise<string> {
  const key = aiKey();
  if (!key) {
    throw new Error("未配置 DeepSeek API Key，请在「设置」页填写。");
  }
  const base = cfg("ai_base_url", "DEEPSEEK_BASE_URL", "https://api.deepseek.com");
  const model = cfg("ai_model", "DEEPSEEK_MODEL", "deepseek-flash");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: opts?.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4,
      ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`DeepSeek 调用失败 ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

export function classifyAndDraft(body: string, channel: string): Promise<string> {
  return chat([
    {
      role: "system",
      content:
        "你是外贸销售助手。根据客户来信，输出 JSON：{\"classification\":\"有意向|要报价单|暂缓|休假\",\"reason\":\"简短理由\",\"draft\":\"英文回复草稿\"}。只输出 JSON，不要多余文字。",
    },
    { role: "user", content: `渠道：${channel}\n客户来信：${body}` },
  ], { json: true });
}

export async function testAI(): Promise<{ ok: boolean; message: string }> {
  const key = aiKey();
  if (!key) return { ok: false, message: "未配置 API Key" };
  try {
    const reply = await chat([{ role: "user", content: "只回复两个字：正常" }]);
    return { ok: true, message: reply.slice(0, 60) };
  } catch (e: any) {
    return { ok: false, message: e?.message || "连接失败" };
  }
}
