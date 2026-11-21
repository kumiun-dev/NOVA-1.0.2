// 数据源汇总：按优先级排列，采集时并行调用
import { companiesHouse, overpass, samGov, gleif } from "./official";
import type { SearchParams, SourceAdapter } from "./types";
import { hotfrogSource } from "./hotfrog";
import { importYetiSource } from "./importyeti";
import { sirene, abn } from "./registries";
import { overture } from "./overture";
export { categoryConflict } from "./overture";

// 当前已接入的源（Cloudflare 强保护的 YellowPages/Yell/Cylex 待后续有头模式接入）
export const SOURCES: SourceAdapter[] = [overture, overpass, companiesHouse, samGov, sirene, abn, gleif, importYetiSource, hotfrogSource];

export function getSource(id: string): SourceAdapter | undefined {
  return SOURCES.find((s) => s.id === id);
}

// 无官网、邮箱、电话的身份登记源不能单独承担获客发现。
export function pickSources(p: SearchParams, deep = false) { const eligible=SOURCES.filter(s => !["gleif","companies_house","sirene","abn","samgov"].includes(s.id) && (deep || !["hotfrog","importyeti"].includes(s.id)) && (!s.supports || s.supports(p)));const primary=eligible.find(s=>s.id==="overture");return primary&&!deep?[primary]:eligible; }
