import { db, completenessOf } from "./db";

export type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: any[]; tool_call_id?: string };

// ---------- 工具定义（OpenAI function calling 兼容） ----------
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "按条件查客户（获客线索）。可按国家、行业、职位、关键词筛选，返回匹配的客户列表（公司、姓名、邮箱、WhatsApp、状态）。",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string", description: "国家，如 美国、德国" },
          industry: { type: "string", description: "行业，如 五金、家居用品" },
          position: { type: "string", description: "职位，如 采购经理、Owner" },
          keyword: { type: "string", description: "关键词，匹配公司名/姓名/邮箱" },
          limit: { type: "number", description: "返回条数，默认 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_lead",
      description: "新增一条客户线索。company 必填，其余可选。",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "公司名（必填）" },
          country: { type: "string" },
          industry: { type: "string" },
          position: { type: "string" },
          name: { type: "string", description: "联系人姓名" },
          email: { type: "string" },
          whatsapp: { type: "string" },
          phone: { type: "string" },
          source: { type: "string", description: "来源，默认 智能体录入" },
        },
        required: ["company"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "修改某个客户的销售阶段。阶段值：线索、已联系、已报价、谈判中、样品中、成交、流失。",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "客户 id" },
          status: { type: "string", description: "新状态" },
        },
        required: ["id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_quotes",
      description: "查报价单列表，返回编号、金额、币种、状态。",
      parameters: { type: "object", properties: { limit: { type: "number", description: "默认 10" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_quote_draft",
      description: "为某个客户生成报价单草稿。金额需人工确认，这里只创建草稿。",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "number", description: "客户 id" },
          items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, spec: { type: "string" }, qty: { type: "number" }, unit: { type: "number" } } }, description: "行项目数组" },
          currency: { type: "string", description: "币种，默认 USD" },
        },
        required: ["lead_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "platform_stats",
      description: "查平台整体统计：客户总数、待处理回信数、报价单数、各状态客户数。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_followup",
      description: "给某个客户排一条跟进记录（下次跟进时间）。",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "number", description: "客户 id" },
          content: { type: "string", description: "跟进内容" },
          next_at: { type: "string", description: "下次跟进时间，如 2026-11-20" },
        },
        required: ["lead_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inbox_item",
      description: "取某条回信（待处理队列）的完整内容，用于起草回复。拿到内容后你直接在回复里写出英文回复草稿。",
      parameters: {
        type: "object",
        properties: { inbox_id: { type: "number", description: "回信 id" } },
        required: ["inbox_id"],
      },
    },
  },
];

// ---------- 工具执行 ----------
function runTool(name: string, args: any): string {
  switch (name) {
    case "search_leads": {
      const conds: string[] = [];
      const params: any[] = [];
      if (args.country) { conds.push("country = ?"); params.push(args.country); }
      if (args.industry) { conds.push("industry = ?"); params.push(args.industry); }
      if (args.position) { conds.push("position LIKE ?"); params.push(`%${args.position}%`); }
      if (args.keyword) { conds.push("(company LIKE ? OR name LIKE ? OR email LIKE ?)"); params.push(`%${args.keyword}%`, `%${args.keyword}%`, `%${args.keyword}%`); }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const limit = Math.min(Number(args.limit) || 10, 50);
      const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY id DESC LIMIT ${limit}`).all(...params) as any[];
      if (!rows.length) return "没有找到匹配的客户。";
      return rows.map((l) => {
        const n = completenessOf(l);
        return `#${l.id} ${l.company}（${l.country || "未知国"}·${l.industry || "未知行业"}）状态:${l.status} 完整度:${n}/4 | 姓名:${l.name || "未获取"} 邮箱:${l.email || "未获取"} WhatsApp:${l.whatsapp || "未获取"}`;
      }).join("\n");
    }
    case "create_lead": {
      const info = db.prepare(
        `INSERT INTO leads (company, country, industry, position, name, email, whatsapp, phone, source, status, acquired_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '线索', ?)`
      ).run(
        args.company, args.country || "", args.industry || "", args.position || "", args.name || "",
        args.email || "", args.whatsapp || "", args.phone || "", args.source || "智能体录入",
        new Date().toISOString().slice(0, 10)
      );
      return `已新增客户 #${info.lastInsertRowid}：${args.company}`;
    }
    case "update_lead_status": {
      const r = db.prepare("UPDATE leads SET status = ? WHERE id = ?").run(args.status, args.id);
      return r.changes ? `已把客户 #${args.id} 状态改为「${args.status}」` : `未找到客户 #${args.id}`;
    }
    case "list_quotes": {
      const limit = Math.min(Number(args.limit) || 10, 50);
      const rows = db.prepare(`SELECT * FROM quotes ORDER BY id DESC LIMIT ${limit}`).all() as any[];
      if (!rows.length) return "暂无报价单。";
      return rows.map((q) => `#${q.id} ${q.quote_no} 总额:${q.currency} ${q.total} 状态:${q.status}`).join("\n");
    }
    case "create_quote_draft": {
      const lead = db.prepare("SELECT company FROM leads WHERE id = ?").get(args.lead_id) as any;
      if (!lead) return `未找到客户 #${args.lead_id}`;
      const items = Array.isArray(args.items) ? args.items : [];
      let total = 0;
      for (const it of items) { total += (Number(it.qty) || 0) * (Number(it.unit) || 0); }
      const currency = args.currency || "USD";
      const no = `BC-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const info = db.prepare(
        `INSERT INTO quotes (quote_no, lead_id, items, total, currency, status, valid_until, created_at)
         VALUES (?, ?, ?, ?, ?, '草稿', ?, ?)`
      ).run(no, args.lead_id, JSON.stringify(items), total, currency,
        new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), new Date().toISOString().slice(0, 10));
      return `已为客户 ${lead.company} 生成报价单草稿 ${no}，总额 ${currency} ${total.toFixed(2)}（金额请人工确认后再发送）。`;
    }
    case "platform_stats": {
      const leadCount = (db.prepare("SELECT COUNT(*) c FROM leads").get() as any).c;
      const pending = (db.prepare("SELECT COUNT(*) c FROM inbox WHERE state='待批准'").get() as any).c;
      const quoteCount = (db.prepare("SELECT COUNT(*) c FROM quotes").get() as any).c;
      const byStatus = db.prepare("SELECT status, COUNT(*) c FROM leads GROUP BY status").all() as any[];
      return `客户总数:${leadCount}，待处理回信:${pending}，报价单:${quoteCount}。状态分布：${byStatus.map((s) => `${s.status}${s.c}`).join("、") || "无"}`;
    }
    case "schedule_followup": {
      db.prepare("INSERT INTO followups (lead_id, type, content, next_at, created_at) VALUES (?, '跟进', ?, ?, ?)")
        .run(args.lead_id, args.content || "", args.next_at || "", new Date().toISOString().slice(0, 16).replace("T", " "));
      return `已为客户 #${args.lead_id} 排跟进：${args.content}${args.next_at ? `（下次 ${args.next_at}）` : ""}`;
    }
    case "get_inbox_item": {
      const m = db.prepare("SELECT * FROM inbox WHERE id = ?").get(args.inbox_id) as any;
      if (!m) return "未找到该回信";
      return `回信 #${m.id} 渠道:${m.channel} 发件人:${m.sender} 主题:${m.subject}\n内容:${m.body}`;
    }
    default:
      return `未知工具 ${name}`;
  }
}

// ---------- 智能体对话主循环 ----------
const SYSTEM = `你是「NOVA」外贸获客平台的 AI 智能体，帮用户管理客户、找客户、处理回信、生成报价单。
规则：
1. 用户问"查/找/有哪些客户"等，先用 search_leads 工具查真实数据再回答，不要凭空编客户。
2. 用户说"新增/记一个客户"等，用 create_lead；"改状态"用 update_lead_status；"报价单"相关用 list_quotes / create_quote_draft。
3. 回答用简体中文，简洁，先给结论。涉及金额时提醒用户人工确认。
4. 工具结果里的「未获取」表示该字段还没采集到，如实转述，不要编造。`;

export async function runAgent(history: ChatMsg[], selectedModel?: string): Promise<{ reply: string; actions: string[] }> {
  const actions: string[] = [];
  const lastQuestion = [...history].reverse().find((message) => message.role === "user")?.content || "";
  const { relevantKnowledge } = await import("./knowledge");
  const docs = relevantKnowledge(lastQuestion, 5);
  const knowledgeContext = docs.length ? `\n\n以下是知识库中与当前问题相关的用户资料，只可依据其中明确的信息回答产品事实；未提及的信息请说明尚需确认：\n${docs.map((doc) => `【${doc.category}｜${doc.title}】\n${doc.content.slice(0, 5000)}`).join("\n\n")}` : "";
  const msgs: any[] = [{ role: "system", content: SYSTEM + knowledgeContext }, ...history];

  // 第一轮：让模型决定是否调用工具
  const r1 = await callWithTools(msgs, selectedModel);
  let msg = r1.message;
  let loops = 0;

  while (msg?.tool_calls?.length && loops < 4) {
    loops++;
    msgs.push(msg); // assistant 带 tool_calls
    for (const tc of msg.tool_calls) {
      let args: any = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch {}
      const label = toolLabel(tc.function.name, args);
      const result = runTool(tc.function.name, args);
      actions.push(`${label} → ${result}`);
      msgs.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    const r = await callWithTools(msgs, selectedModel);
    msg = r.message;
  }

  return { reply: msg?.content || "（无回复）", actions };
}

function toolLabel(name: string, args: any): string {
  switch (name) {
    case "search_leads": return `查客户`;
    case "create_lead": return `新增客户 ${args.company || ""}`;
    case "update_lead_status": return `改状态 #${args.id}→${args.status}`;
    case "list_quotes": return `查报价单`;
    case "create_quote_draft": return `生成报价单草稿`;
    case "platform_stats": return `查统计`;
    case "schedule_followup": return `排跟进 #${args.lead_id}`;
    case "get_inbox_item": return `取回信内容`;
    default: return name;
  }
}

async function callWithTools(msgs: any[], selectedModel?: string): Promise<{ message: any }> {
  const key = (await import("./db")).getSetting("ai_key") || process.env.DEEPSEEK_API_KEY || "";
  if (!key) throw new Error("未配置 DeepSeek API Key，请在「设置」页填写。");
  const base = (await import("./db")).getSetting("ai_base_url") || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  const model = selectedModel || (await import("./db")).getSetting("ai_model") || process.env.DEEPSEEK_MODEL || "deepseek-flash";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: msgs, tools: TOOLS, tool_choice: "auto", temperature: 0.3 }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`模型调用失败 ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return { message: data?.choices?.[0]?.message ?? {} };
}
