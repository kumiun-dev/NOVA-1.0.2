"use client";
import RegistryVerification from "./RegistryVerification";
import { useEffect,useState } from "react";
export default function AcquisitionSettings(){
 const [status,setStatus]=useState<any>(null),[form,setForm]=useState<Record<string,string>>({}),[message,setMessage]=useState("");
 const load=()=>fetch("/api/acquisition").then(r=>r.json()).then(setStatus);
 useEffect(()=>{load().catch(()=>setMessage("配置读取失败"));},[]);
 async function save(clear=false){try{const r=await fetch("/api/acquisition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(clear?{clear_proxy:true}:form)});const d=await r.json();if(!r.ok)throw Error(d.error);setForm({});await load();setMessage("已保存。免费官方 Key 与 AI Key 不同；配置状态不代表通过实际查询验收。");}catch(e){setMessage(e instanceof Error?e.message:"保存失败");}}
 return <section className="mb-6 rounded-lg border border-line bg-card px-5 py-4"><h2 className="mb-3 text-sm">免费官方获客源与网络</h2>
 <p className="mb-3 text-xs text-muted">Overture 开放商家库无需 Key，按国家与商业分类查询公开的邮箱和电话；首次读取云文件较慢，后续使用本地缓存。公司名、邮箱、电话齐全才进入获客结果。登记库一般仅提供企业身份候选；普通 SAM.gov 公开权限不保证提供邮箱、电话。无需购买搜索或数据商 API。</p>
 {[['companies_house_key','英国 Companies House 免费 API Key',status?.companies_house_configured],['samgov_key','美国 SAM.gov 免费 API Key',status?.samgov_configured],['abn_guid','澳大利亚 ABN Lookup 免费 GUID',status?.abn_configured],['http_proxy','采集 HTTP 代理（可选）',status?.proxy_configured],['collect_user_agent','采集 User-Agent（可配置业务联系邮箱）',!!status?.user_agent]].map(([id,label,configured])=><label key={String(id)} className="mb-3 block text-xs">{label} · {configured?'已配置，留空保留':'未配置'}<input aria-label={String(label)} type={id==='collect_user_agent'?'text':'password'} className="mt-1 w-full" value={form[String(id)]||''} onChange={e=>setForm({...form,[String(id)]:e.target.value})}/></label>)}
 <div className="mb-3 flex gap-3 text-xs"><a href="https://developer.company-information.service.gov.uk/" target="_blank" rel="noopener noreferrer" className="underline">英国官方开发者平台</a><a href="https://sam.gov/" target="_blank" rel="noopener noreferrer" className="underline">SAM.gov 官方平台</a></div>
 <button className="rounded bg-[#16181A] px-3 py-2 text-xs text-white" onClick={()=>save()}>保存官方源配置</button><button className="ml-3 rounded border px-3 py-2 text-xs" onClick={()=>save(true)}>清除代理，使用直连</button>
 <p className="mt-3 text-xs">今日真实请求次数（缓存命中不计）：</p>{status?.quotas?.map((q:any)=><div key={q.id} className="mt-1 flex items-center gap-2 text-xs"><span className="w-36">{q.id}：{q.used} / {q.limit||'未设置上限'}</span><input type="number" min={0} aria-label={`${q.id}每日请求上限`} placeholder="自定义每日上限；0不限" value={form[`quota_limit_${q.id}`]||''} onChange={e=>setForm({...form,[`quota_limit_${q.id}`]:e.target.value})}/></div>)}
 <RegistryVerification/>{message&&<p role="status" className="mt-3 text-xs">{message}</p>}</section>;
}
