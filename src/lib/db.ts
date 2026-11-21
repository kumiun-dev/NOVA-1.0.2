import Database from "better-sqlite3";
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "fs";
import path from "path";

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";
if (!isProductionBuild && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, "beacon.db");

type DB = Database.Database;

function addColumnIfMissing(d: DB, table: string, column: string, definition: string) {
  const columns = d.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((item) => item.name === column)) return;
  try { d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`); }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/duplicate column name/i.test(message)) throw error;
  }
}

function initSchema(d: DB) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      country TEXT DEFAULT '',
      industry TEXT DEFAULT '',
      hs_code TEXT DEFAULT '',
      position TEXT DEFAULT '',
      name TEXT DEFAULT '',
      email TEXT DEFAULT '',
      whatsapp TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      source TEXT DEFAULT '',
      website TEXT DEFAULT '',
      address TEXT DEFAULT '',
      status TEXT DEFAULT '线索',
      note TEXT DEFAULT '',
      acquired_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      channel TEXT DEFAULT '邮件',
      sender TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      body TEXT DEFAULT '',
      classification TEXT DEFAULT '待分类',
      draft TEXT DEFAULT '',
      state TEXT DEFAULT '待批准',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS inbox_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inbox_id INTEGER NOT NULL REFERENCES inbox(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL,
      external_id TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS inbox_replies_by_message ON inbox_replies(inbox_id, id);

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no TEXT DEFAULT '',
      lead_id INTEGER,
      items TEXT DEFAULT '[]',
      total REAL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT '草稿',
      valid_until TEXT DEFAULT '',
      token TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS channel_connections (
      kind TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    );

    CREATE TABLE IF NOT EXISTS channel_oauth (
      state TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      data TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_account_history (
      connection_id TEXT PRIMARY KEY,
      owner_number TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS whatsapp_history_by_owner ON whatsapp_account_history(owner_number);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT DEFAULT '',
      name TEXT NOT NULL,
      specs TEXT DEFAULT '',
      hs_code TEXT DEFAULT '',
      unit_cost REAL DEFAULT 0,
      cost_currency TEXT DEFAULT 'CNY',
      packaging_cost REAL DEFAULT 0,
      default_margin REAL DEFAULT 25,
      default_price REAL DEFAULT 0,
      moq INTEGER DEFAULT 1,
      lead_time TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT '产品资料',
      created_at TEXT DEFAULT '',
      updated_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      type TEXT DEFAULT '备注',
      content TEXT DEFAULT '',
      next_at TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );
  `);
  addColumnIfMissing(d, "inbox_replies", "connection_ref", "TEXT DEFAULT ''");
  d.exec("CREATE INDEX IF NOT EXISTS inbox_replies_by_external_id ON inbox_replies(external_id, connection_ref)");

  // Migration guards also tolerate two Next.js build workers initializing the same SQLite file.
  addColumnIfMissing(d, "quotes", "token", "TEXT DEFAULT ''");
  addColumnIfMissing(d, "quotes", "accepted_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "quotes", "approval_status", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "quotes", "approval_by", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "quotes", "approval_at", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "leads", "website", "TEXT DEFAULT ''");
  addColumnIfMissing(d, "leads", "address", "TEXT DEFAULT ''");
  addColumnIfMissing(d, "leads", "channel_id", "TEXT DEFAULT ''");
  for (const [column, type] of [["external_id", "TEXT DEFAULT ''"], ["recipient_id", "TEXT DEFAULT ''"], ["translated_body", "TEXT DEFAULT ''"], ["language", "TEXT DEFAULT ''"], ["source_message_id", "TEXT DEFAULT ''"], ["reply_mode", "TEXT DEFAULT ''"], ["connection_ref", "TEXT DEFAULT ''"], ["direction", "TEXT DEFAULT 'incoming'"]]) {
    addColumnIfMissing(d, "inbox", column, type);
  }
  addColumnIfMissing(d, "inbox", "media_type", "TEXT DEFAULT ''");
  addColumnIfMissing(d, "inbox", "channel_source", "TEXT NOT NULL DEFAULT 'official'");
  addColumnIfMissing(d, "inbox", "attachment_types", "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(d, "inbox", "contact_ref", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "inbox", "event_id", "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(d, "inbox", "read_at", "TEXT NOT NULL DEFAULT ''");
  d.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS inbox_provider_event ON inbox (channel_source, connection_ref, event_id) WHERE event_id<>'';
    CREATE INDEX IF NOT EXISTS inbox_by_lead ON inbox (lead_id, id);
    CREATE INDEX IF NOT EXISTS followups_by_lead ON followups (lead_id, id);
    CREATE INDEX IF NOT EXISTS quotes_by_lead ON quotes (lead_id);
    CREATE TABLE IF NOT EXISTS zernio_send_attempts (
      id TEXT PRIMARY KEY,
      connection_ref TEXT NOT NULL,
      attempted_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS zernio_attempts_by_connection ON zernio_send_attempts(connection_ref, attempted_at);
  `);
  for(const column of ["source_url","evidence"]) addColumnIfMissing(d, "leads", column, "TEXT DEFAULT ''");
  // 迁移：旧库补 followups 表
  const t = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='followups'").get();
  if (!t) {
    d.exec(`CREATE TABLE IF NOT EXISTS followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      type TEXT DEFAULT '备注',
      content TEXT DEFAULT '',
      next_at TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    )`);
  }
  // 迁移：客户状态统一为销售阶段（线索→已联系→已报价→谈判中→成交→流失）
  const stageMap: Record<string, string> = {
    "待开发": "线索", "已发": "已联系", "已回": "谈判中", "要报价": "已报价", "已成交": "成交", "搁置": "流失",
  };
  for (const [old, next] of Object.entries(stageMap)) {
    d.prepare("UPDATE leads SET status = ? WHERE status = ?").run(next, old);
  }
}

function seedIfEmpty(d: DB) {
  const count = (d.prepare("SELECT COUNT(*) AS c FROM leads").get() as any).c;
  if (count > 0) return;

  const now = "2026-11-16";
  const insert = d.prepare(
    `INSERT INTO leads (company, country, industry, hs_code, position, name, email, whatsapp, phone, source, status, acquired_at)
     VALUES (@company, @country, @industry, @hs_code, @position, @name, @email, @whatsapp, @phone, @source, @status, @acquired_at)`
  );

  const leads = [
    ["Gulf Pacific Trading LLC", "美国", "五金建材", "7326", "采购经理", "Peter Lang", "peter@gulfpacific.com", "+1 305 555 0148", "", "海关提单", "已报价", now],
    ["Nordic Home Decor AB", "瑞典", "家居用品", "4419", "Owner", "Anna Lindqvist", "", "+46 70 555 3312", "", "公开网页", "谈判中", now],
    ["Sunrise Components Ltd", "印度", "电子元器件", "8542", "", "", "", "", "", "工商登记", "线索", now],
    ["Atlas Marine Supply Co", "阿联酋", "船舶配件", "8407", "采购总监", "Omar Haddad", "omar@atlasmarine.ae", "+971 50 555 2201", "", "海关提单", "已联系", now],
    ["Kleine Waaren GmbH", "德国", "厨具", "8215", "Einkaufsleiter", "", "info@kleinewaaren.de", "", "", "公开网页", "已联系", now],
    ["Casa Bella Imports", "墨西哥", "家居用品", "6912", "Gerente", "Lucia Reyes", "", "+52 1 55 555 1109", "", "社媒留言", "线索", now],
    ["Pacific Rim Foods", "澳大利亚", "食品", "1901", "", "", "procurement@prfoods.au", "", "", "海关提单", "线索", now],
    ["Nova Build Supplies", "加拿大", "建材", "7318", "Owner", "", "", "", "", "工商登记", "线索", now],
    ["Emporio Casa SRL", "意大利", "家居用品", "9403", "Buyer", "Giulia Romano", "giulia@emporiocasa.it", "+39 340 555 7788", "", "公开网页", "成交", now],
    ["Vertex Auto Parts", "德国", "汽配", "8708", "", "", "", "+49 151 555 6677", "", "社媒留言", "流失", now],
    ["Delta Agri Imports", "巴西", "农产品", "1006", "Diretor", "Carlos Souza", "carlos@deltaagri.br", "", "", "海关提单", "谈判中", now],
    ["Bluewave Electronics", "韩国", "电子元器件", "8542", "", "Min-Jae Park", "mjp@bluewave.kr", "+82 10 555 9021", "", "公开网页", "线索", now],
  ] as const;

  const tx = d.transaction(() => {
    for (const l of leads) {
      insert.run({
        company: l[0], country: l[1], industry: l[2], hs_code: l[3], position: l[4],
        name: l[5], email: l[6], whatsapp: l[7], phone: l[8], source: l[9], status: l[10], acquired_at: l[11],
      });
    }
  });
  tx();

  const i = d.prepare(
    `INSERT INTO inbox (lead_id, channel, sender, subject, body, classification, draft, state, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  i.run(1, "邮件", "Peter Lang", "Quotation request", "We received your quotation request. Please send FOB Shanghai pricing for 5,000 pcs of forged hooks, urgent.",
    "有意向", "Dear Peter, thanks for reaching out. Attached is our FOB Shanghai quotation for 5,000 pcs, valid 30 days. Happy to arrange samples.", "待批准", "2026-11-16 10:24");
  i.run(2, "WhatsApp", "Anna Lindqvist", "Quote request", "Hi, can you quote for oak cutting boards, MOQ 1000 pcs, to Gothenburg?",
    "要报价单", "Hi Anna, yes we can. Sending our oak cutting board quotation (MOQ 1000) shortly — lead time 25 days.", "待批准", "2026-11-16 09:57");
  i.run(3, "社媒留言", "Ravi Kumar", "Follow up", "Not looking to switch suppliers this quarter, maybe Q2.",
    "暂缓", "", "待批准", "2026-11-15 18:40");

  const q = d.prepare(
    `INSERT INTO quotes (quote_no, lead_id, items, total, currency, status, valid_until, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  q.run("BC-2026-0001", 9, JSON.stringify([
    { name: "Oak Cutting Board 30x20cm", spec: "FSC oak, food-grade oil", qty: 1000, unit: 6.8, amount: 6800 },
    { name: "Oak Cutting Board 40x25cm", spec: "FSC oak, food-grade oil", qty: 500, unit: 9.5, amount: 4750 },
  ]), 11550, "USD", "已发", "2026-12-16", now);
}

const g = globalThis as any;
if (!g.__beaconDb) {
  // Next.js loads route modules in parallel while collecting page data.
  const d = new Database(isProductionBuild ? ":memory:" : DB_PATH);
  if (!isProductionBuild) d.pragma("journal_mode = WAL");
  initSchema(d);
  d.exec(`
    CREATE TABLE IF NOT EXISTS zernio_profiles (
      owner_id TEXT PRIMARY KEY,
      external_id TEXT NOT NULL UNIQUE,
      profile_id TEXT UNIQUE
    );
  `);
  g.__beaconDb = d;
}

export const systemDb: Database.Database = g.__beaconDb;

const activeDatabase = new AsyncLocalStorage<Database.Database>();
const tenantDatabases: Map<string, Database.Database> = g.__novaTenantDbs || new Map<string, Database.Database>();
g.__novaTenantDbs = tenantDatabases;

export function openTenantDatabase(accountId: string): Database.Database {
  if (accountId === "owner") return systemDb;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error("Invalid account id");
  const cached = tenantDatabases.get(accountId);
  if (cached) return cached;
  const tenantDir = path.join(DATA_DIR, "accounts");
  if (!fs.existsSync(tenantDir)) fs.mkdirSync(tenantDir, { recursive: true });
  const tenantDb = new Database(path.join(tenantDir, `${accountId}.db`));
  tenantDb.pragma("journal_mode = WAL");
  initSchema(tenantDb);
  tenantDatabases.set(accountId, tenantDb);
  return tenantDb;
}

export function deleteTenantDatabase(accountId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new Error("Invalid account id");
  const tenantDir = path.resolve(DATA_DIR, "accounts");
  const databasePath = path.resolve(tenantDir, `${accountId}.db`);
  if (path.dirname(databasePath) !== tenantDir) throw new Error("Invalid account database path");
  const cached = tenantDatabases.get(accountId);
  if (cached) { cached.close(); tenantDatabases.delete(accountId); }
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = `${databasePath}${suffix}`;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
}

export function runWithTenantDatabase<T>(accountId: string, callback: () => T): T {
  return activeDatabase.run(openTenantDatabase(accountId), callback);
}

export const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const active = activeDatabase.getStore() || systemDb;
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as Database.Database;

export type Lead = {
  source_url?: string;
  evidence?: string;
  id: number;
  company: string;
  country: string;
  industry: string;
  hs_code: string;
  position: string;
  name: string;
  email: string;
  whatsapp: string;
  phone: string;
  source: string;
  website: string;
  address: string;
  channel_id?: string;
  status: string;
  note: string;
  acquired_at: string;
  completeness: number;
};

export { SALES_STAGES, STAGE_COLOR } from "./stages";

export function completenessOf(l: { company: string; name: string; email: string; whatsapp: string }): number {
  let c = 0;
  if (l.company) c++;
  if (l.name) c++;
  if (l.email) c++;
  if (l.whatsapp) c++;
  return c;
}

export function getSetting(key: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
  return row?.value ?? "";
}

export function setSetting(key: string, value: string) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function deleteSettings(keys: readonly string[]) {
  db.transaction(() => {
    const remove = db.prepare("DELETE FROM settings WHERE key = ?");
    for (const key of keys) remove.run(key);
  })();
}

// OAuth application credentials and the shared Evolution service belong to the platform,
// while user tokens and mailbox credentials remain in the active tenant database.
export function getGmailOAuth() {
  return { clientId: getSetting("gmail_oauth_client_id"), clientSecret: getSetting("gmail_oauth_client_secret") };
}

export function getPlatformSetting(key: string): string {
  const prefixed = systemDb.prepare("SELECT value FROM settings WHERE key = ?").get(`platform_${key}`) as { value?: string } | undefined;
  if (prefixed?.value) return prefixed.value;
  const legacy = systemDb.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value?: string } | undefined;
  if (legacy?.value) return legacy.value;
  const envKeys: Record<string, string> = {
    meta_app_id: "NOVA_META_APP_ID",
    meta_app_secret: "NOVA_META_APP_SECRET",
    meta_webhook_verify_token: "NOVA_META_WEBHOOK_VERIFY_TOKEN",
    google_client_id: "NOVA_GOOGLE_CLIENT_ID",
    google_client_secret: "NOVA_GOOGLE_CLIENT_SECRET",
    evolution_url: "NOVA_EVOLUTION_URL",
    evolution_key: "NOVA_EVOLUTION_KEY",
    zernio_api_key: "NOVA_ZERNIO_API_KEY",
    zernio_webhook_secret: "NOVA_ZERNIO_WEBHOOK_SECRET",
  };
  return process.env[envKeys[key] || ""] || "";
}

export function setPlatformSetting(key: string, value: string) {
  systemDb.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(`platform_${key}`, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
