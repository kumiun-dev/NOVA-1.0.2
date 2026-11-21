// 数据源适配器统一类型定义

export interface SearchParams {
  keyword: string; // 英文关键词（采集前已转英文）
  keywordZh: string; // 原始中文关键词
  country: string; // 中文国家名（用于展示）
  countryEn: string; // 英文国家名
  industry: string; // 中文行业
  industryEn: string; // 英文行业
  position: string; // 职位
  signal?: AbortSignal;
  warn?: (message: string) => void;
  maxResults: number; // 最多抓多少家公司（默认 20）
}

export interface LeadCandidate {
  product_match?: string;
  source_url?: string;
  evidence?: string;
  company: string;
  name: string; // 联系人姓名（公开页常有）
  email: string;
  phone: string; // 电话
  whatsapp: string; // WhatsApp（欧美少，缺则空）
  country: string; // 中文国家名
  industry: string;
  position: string;
  website: string; // 官网
  address: string;
  source: string; // 来源名称
}

// 进度回调：抓到一家公司就回调一次，供前端实时显示
export type ProgressFn = (info: { company: string; source: string; candidate?: LeadCandidate }) => void;

export interface SourceAdapter {
  id: string;
  name: string;
  supports?(p: SearchParams): boolean;
  search(p: SearchParams, onProgress?: ProgressFn): Promise<LeadCandidate[]>;
}
