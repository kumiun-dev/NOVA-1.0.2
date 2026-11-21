import { requestJson, requestText } from "../http";
import { getSetting } from "../db";
import { classification } from "./classification";
import type { SourceAdapter,LeadCandidate,SearchParams } from "./types";
const record=(p:SearchParams,source:string,extra:Partial<LeadCandidate>):LeadCandidate=>Object.fromEntries(Object.entries({company:"",name:"",email:"",phone:"",whatsapp:"",country:p.country,industry:p.industry,position:"",website:"",address:"",source,...extra}).map(([k,v])=>[k,String(v??"")])) as unknown as LeadCandidate;
const naf:Record<string,string[]>={"423210":["46.47Z","47.59A"],"423610":["46.47Z"],"423710":["46.74A","47.52A"],"424330":["46.42Z","47.71Z"],"423690":["46.52Z"],"423120":["45.31Z","45.32Z"],"423830":["46.69B"],"423920":["46.49Z","47.65Z"],"424210":["46.45Z","47.75Z"],"424990":["47.76Z"]};
export const sirene:SourceAdapter={id:"sirene",name:"法国官方企业登记",supports:p=>p.country==="法国",async search(p,progress){
 const category=classification(p),codes=category?naf[category.naics]:undefined;if(!codes)throw Error("该产品尚无已核对的 NAF 分类，未扩大为任意企业");
 const out:LeadCandidate[]=[];
 for(let page=1;page<=10&&out.length<p.maxResults;page++){
  p.signal?.throwIfAborted();const q=new URLSearchParams({activite_principale:codes.join(","),etat_administratif:"A",page:String(page),per_page:"25"});
  // 使用法国政府公开的 Sirene 企业搜索服务；不请求个人经营者资料。
  const d=await requestJson(`https://recherche-entreprises.api.gouv.fr/search?${q}`,{source:this.id,signal:p.signal});
  const rows=d.results||[];for(const r of rows){if(r.etat_administratif!=="A"||String(r.nature_juridique||"").startsWith("1"))continue;const a=r.siege||{};const c=record(p,this.name,{company:r.nom_raison_sociale||r.nom_complet,address:a.adresse||[a.adresse_ligne_1,a.code_postal,a.libelle_commune].filter(Boolean).join(" "),source_url:`https://annuaire-entreprises.data.gouv.fr/entreprise/${r.siren}`,evidence:`Sirene 法人登记；NAF ${r.activite_principale||a.activite_principale||codes.join(",")}；行业分类候选，不证明正在采购该产品。`});if(c.company){out.push(c);progress?.({company:c.company,source:this.name,candidate:c});}if(out.length>=p.maxResults)break;}
  if(!rows.length||page>=Number(d.total_pages||1))break;
 }return out;
}};
export const abn:SourceAdapter={id:"abn",name:"澳大利亚 ABN 企业登记",supports:p=>p.country==="澳大利亚",async search(p,progress){
 const key=getSetting("abn_guid");if(!key)throw Error("ABN Lookup 尚未配置官方免费 GUID");
 const q=new URLSearchParams({name:p.keyword,maxResults:String(Math.min(200,p.maxResults)),guid:key,callback:"callback"});
 const raw=await requestText(`https://abr.business.gov.au/json/MatchingNames.aspx?${q}`,{source:this.id,signal:p.signal});let d:any;try{d=JSON.parse(raw.replace(/^\s*callback\s*\(/,"").replace(/\)\s*;?\s*$/,""));}catch{throw Error("ABN 返回格式无效");}if(d.Message)throw Error("ABN 账号或查询错误，请检查 GUID");
 const out:LeadCandidate[]=[];for(const r of d.Names||[]){if(r.IsCurrent===false||!/\b(pty|ltd|limited|inc|corporation|company)\b/i.test(r.Name||""))continue;const c=record(p,this.name,{company:r.Name,address:[r.State,r.Postcode].filter(Boolean).join(" "),source_url:`https://abr.business.gov.au/ABN/View?abn=${String(r.Abn||"").replace(/\D/g,"")}`,evidence:"ABN 公开企业名称匹配；已排除无明确公司法律形式的个人名称。ABN Lookup 不提供 ANZSIC 行业码或采购意向。"});out.push(c);progress?.({company:c.company,source:this.name,candidate:c});if(out.length>=p.maxResults)break;}return out;
}};
export async function validateVat(country:string,number:string,signal?:AbortSignal){
 const code=country.trim().toUpperCase();
 if(!/^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)$/.test(code))throw Error("请输入支持的欧盟国家代码");
 const raw=number.replace(/\s/g,"").toUpperCase(),vat=raw.startsWith(code)?raw.slice(2):raw;
 if(!/^[A-Z0-9]{2,14}$/.test(vat))throw Error("请输入正确格式的 VAT 号码");
 const d=await requestJson(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${code}/vat/${vat}`,{source:"vies",signal,ttlMs:86400000});
 if(d.userError&&d.userError!=="VALID"&&d.userError!=="INVALID")return{status:"unavailable",message:"成员国验证服务暂不可用，不判定为无效企业"};
 const valid=d.isValid??d.valid;if(typeof valid!=="boolean")return{status:"unavailable",message:"验证服务未返回明确结果"};
 return{status:valid?"valid":"invalid",name:d.name&&d.name!=="---"?String(d.name):"",address:d.address&&d.address!=="---"?String(d.address):"",country:code,checked_at:new Date().toISOString(),message:"仅验证给定VAT号，不证明采购意向；缺少名称不等于验证失败"};
}
