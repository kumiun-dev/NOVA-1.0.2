import { SALES_STAGES } from "./stages";

export const SALES_PERIODS = { today: "今天", week: "近 7 天", month: "本月", recent: "近 30 天" } as const;
export type SalesPeriod = keyof typeof SALES_PERIODS;
export type SalesStage = typeof SALES_STAGES[number];
export type SalesLead = {
  id: number; company: string; country: string; industry: string; status: string;
  acquired_at: string; next_at: string; interested: 0 | 1;
};
export type SalesSnapshot = {
  from: string; to: string; leads: SalesLead[]; followupToday: number; overdue: number;
  interested: number; pending: number; acceptedByCurrency: { currency: string; total: number }[];
  trend: { date: string; leads: number; inquiries: number }[];
};

export function localDay(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSalesStage(value: unknown): value is SalesStage {
  return SALES_STAGES.some((stage) => stage === value);
}
