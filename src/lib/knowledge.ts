import { db } from "./db";

export type KnowledgeDoc = { id: number; title: string; content: string; category: string };

function termsOf(value: string): string[] {
  const terms = new Set<string>();
  for (const match of value.toLocaleLowerCase().matchAll(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g)) {
    const token = match[0];
    if (/^[\u3400-\u9fff]+$/.test(token)) {
      for (let i = 0; i < token.length - 1; i++) terms.add(token.slice(i, i + 2));
    } else terms.add(token);
  }
  return [...terms];
}

export function relevantKnowledge(query: string, limit = 5): KnowledgeDoc[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const docs = db.prepare("SELECT id,title,content,category FROM knowledge_docs ORDER BY updated_at DESC,id DESC").all() as KnowledgeDoc[];
  return docs.map((doc) => {
    const title = doc.title.toLocaleLowerCase();
    const content = doc.content.toLocaleLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 4;
      if (content.includes(term)) score += Math.min(3, content.split(term).length - 1);
    }
    return { doc, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.doc);
}

export function knowledgePrompt(query: string, limit = 5): string {
  const docs = relevantKnowledge(query, limit);
  if (!docs.length) return "当前没有匹配到已录入的产品资料。不要编造价格、MOQ、交期、认证或库存。";
  return docs.map((doc, index) => `资料${index + 1}【${doc.category}｜${doc.title}】\n${doc.content.slice(0, 5000)}`).join("\n\n");
}
