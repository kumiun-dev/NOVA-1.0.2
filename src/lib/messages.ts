import { getSetting } from "./db";

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const key = getSetting("ai_key") || process.env.DEEPSEEK_API_KEY || "";
  if (!key) throw new Error("请先在设置中配置 AI API Key，才能使用自动翻译");
  const base = (getSetting("ai_base_url") || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const model = getSetting("ai_model") || process.env.DEEPSEEK_MODEL || "deepseek-flash";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.1, messages: [
      { role: "system", content: `Translate the user message into ${targetLanguage}. Preserve names, numbers, product codes, tone and intent. Return only the translation, with no explanation.` },
      { role: "user", content: text },
    ] }),
  });
  if (!res.ok) throw new Error(`翻译服务返回错误（${res.status}）`);
  const data = await res.json();
  const result = String(data?.choices?.[0]?.message?.content || "").trim();
  if (!result) throw new Error("翻译服务未返回译文");
  return result;
}

export function languageName(code: string): string {
  const names: Record<string, string> = { en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", sv: "Swedish", da: "Danish", no: "Norwegian", fi: "Finnish", pl: "Polish", tr: "Turkish", ar: "Arabic", ja: "Japanese", ko: "Korean", zh: "Chinese" };
  return names[code.toLowerCase().slice(0, 2)] || "English";
}
