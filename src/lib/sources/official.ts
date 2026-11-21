import { requestJson } from "../http";
import { getSetting } from "../db";
import { COUNTRIES } from "./countries";
import { classification, CITY_BOXES } from "./classification";
import type { LeadCandidate, SourceAdapter, SearchParams, ProgressFn } from "./types";

function candidate(p:SearchParams,source:string,fields:Partial<LeadCandidate>):LeadCandidate {
  const result:any={company:"",name:"",email:"",phone:"",whatsapp:"",country:p.country,industry:p.industry,position:"",website:"",address:"",source,...fields};
  for(const key of Object.keys(result)) result[key]=result[key]==null?"":String(result[key]);
  return result;
}
export const companiesHouse:SourceAdapter={
 id:"companies_house",name:"英国工商登记",supports:p=>p.country==="英国",
 async search(p,progress){
  const key=getSetting("companies_house_key");if(!key)throw new Error("英国工商登记尚未配置免费 API Key");
  const codes=classification(p)?.sic;if(!codes)throw new Error("该产品尚无 SIC 映射，未使用公司名模糊搜索冒充行业筛选");
  const rows:LeadCandidate[]=[];
  for(let start=0;rows.length<p.maxResults;start+=100){p.signal?.throwIfAborted();const q=new URLSearchParams({sic_codes:codes.join(","),company_status:"active",size:String(Math.min(100,p.maxResults-rows.length)),start_index:String(start)});
   const data=await requestJson(`https://api.company-information.service.gov.uk/advanced-search/companies?${q}`,{source:this.id,headers:{Authorization:"Basic "+Buffer.from(key+":").toString("base64")},signal:p.signal});
   const items=Array.isArray(data.items)?data.items:[];for(const row of items){if(row.company_status!=="active")continue;const a=row.registered_office_address||row.address||{};const c=candidate(p,this.name,{company:row.company_name||row.title,address:[a.address_line_1,a.address_line_2,a.locality,a.postal_code].filter(Boolean).join(", "),source_url:`https://find-and-update.company-information.service.gov.uk/company/${row.company_number}`,evidence:`SIC: ${(row.sic_codes||codes).join(",")}；企业状态 active；行业候选，不代表产品采购意向。`});rows.push(c);progress?.({company:c.company,source:this.name,candidate:c});if(rows.length>=p.maxResults)break;}
   if(!items.length||start+items.length>=Number(data.hits||data.total_results||Infinity))break;
  }return rows;
 }
};
export const overpass:SourceAdapter={
 id:"overpass",name:"公开地图企业资料",supports:p=>!!CITY_BOXES[p.country]&&!!classification(p)?.osm.length&&!/园艺|garden/i.test(p.industry+" "+p.keyword),
 async search(p,progress){
  const tag=classification(p);if(!tag?.osm.length)return [];const iso=p.country==="英国"?"GB":COUNTRIES[p.country]?.hotfrog?.toUpperCase();if(!iso)return [];
  const result:LeadCandidate[]=[];const seen=new Set<string>();let consecutiveFailures=0;
  for(const city of CITY_BOXES[p.country]||[]){p.signal?.throwIfAborted();progress?.({company:`正在查询 ${city.name} 的企业分类`,source:this.name});
   // 先采集有公开联系方式或官网的商家，避免让无联系方式的点位耗尽候选额度。
   const queries=tag.osm.flatMap(t=>["email","contact:email","phone","contact:phone","website","contact:website"].map(field=>`nwr["shop"="${t}"]["name"]["${field}"](${city.box});`)).join("");
   const query=`[out:json][timeout:20];(${queries});out tags center ${Math.min(200,p.maxResults-result.length)};`;
   let ok=false;for(const endpoint of ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]){try{
    const data=await requestJson(endpoint,{source:this.id,method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:"data="+encodeURIComponent(query),signal:p.signal,timeoutMs:12000,retries:0,ttlMs:30*86400000});
    if(data.remark&&!data.elements?.length)throw new Error("地图实例返回查询错误");
    const rows=(data.elements||[]).sort((a:any,b:any)=>{const score=(t:any)=>Number(!!(t.email||t["contact:email"]))*4+Number(!!(t.phone||t["contact:phone"]))*2+Number(!!(t.website||t["contact:website"]));return score(b.tags||{})-score(a.tags||{});});
    for(const row of rows){const t=row.tags||{};if(!t.name)continue;const identity=(t.website||t["contact:website"]||t.name).toLowerCase();if(seen.has(identity))continue;seen.add(identity);const c=candidate(p,this.name,{company:t.name,email:t["contact:email"]||t.email,phone:t["contact:phone"]||t.phone,whatsapp:t["contact:whatsapp"],website:t["contact:website"]||t.website,address:[t["addr:street"],t["addr:housenumber"],t["addr:postcode"],t["addr:city"]||city.name].filter(Boolean).join(" "),source_url:`https://www.openstreetmap.org/${row.type}/${row.id}`,evidence:`© OpenStreetMap contributors；${city.name}；商家分类 ${t.shop}，与产品为行业级匹配，具体产品及采购意向未核实。`});result.push(c);progress?.({company:c.company,source:this.name,candidate:c});if(result.length>=p.maxResults)break;}ok=true;break;
   }catch(e){p.signal?.throwIfAborted();p.warn?.(`${this.name} ${city.name}：${e instanceof Error?e.message:"请求失败"}`);}}
   if(!ok){consecutiveFailures++;p.warn?.(`${city.name} 地图查询不可用，已保留其他城市结果`);}else consecutiveFailures=0;if(consecutiveFailures>=2){p.warn?.("公开地图连续两个城市请求失败，已停止该来源，避免长时间等待。请检查网络/代理，不能据此认定市场没有客户。");break;}if(result.length>=p.maxResults)break;
  }return result;
 }
};
export const samGov:SourceAdapter={
 id:"samgov",name:"美国企业登记候选",supports:p=>p.country==="美国",
 async search(p,progress){
  const key=getSetting("samgov_key");if(!key)throw new Error("SAM.gov 尚未配置免费账号 API Key；普通公开权限不保证提供联系人邮箱/电话");
  const naics=classification(p)?.naics;if(!naics)throw new Error("该产品尚无 NAICS 映射");
  const result:LeadCandidate[]=[];
  for(let page=0;result.length<p.maxResults;page++){
   const q=new URLSearchParams({api_key:key,samRegistered:"Yes",physicalAddressCountryCode:"USA",naicsCode:naics,registrationStatus:"A",includeSections:"entityRegistration,coreData",page:String(page),size:String(Math.min(10,p.maxResults-result.length))});
   const data=await requestJson(`https://api.sam.gov/entity-information/v3/entities?${q}`,{source:this.id,signal:p.signal});const items=data.entityData||data.entities||[];if(!Array.isArray(items))throw new Error("SAM.gov 返回结构与接口契约不符");
   for(const row of items){const registration=row.entityRegistration||{};const core=row.coreData||{};const a=core.physicalAddress||{};if(a.countryCode!=="USA")continue;if(registration.registrationStatus&&!["Active","A"].includes(registration.registrationStatus))continue;
    // 不请求 CUI/FOUO 数据，不从受限联系人字段提取邮箱、电话或个人姓名。
    const c=candidate(p,this.name,{company:registration.legalBusinessName,website:core.entityInformation?.entityURL||core.entityURL,address:[a.addressLine1,a.city,a.stateOrProvinceCode,a.zipCode].filter(Boolean).join(", "),source_url:"https://sam.gov/",evidence:`公开企业登记，NAICS ${naics}；登记为政府供应商不代表其正在采购用户产品。公开权限未提供企业联系方式时保持为空。`});if(c.company){result.push(c);progress?.({company:c.company,source:this.name,candidate:c});}if(result.length>=p.maxResults)break;}
   if(!items.length||result.length>=Number(data.totalRecords||Infinity))break;
  }return result;
 }
};
export const gleif:SourceAdapter={
 id:"gleif",name:"全球法人实体登记",supports:p=>!!p.country,
 async search(p,progress){
  const iso=p.country==="英国"?"GB":COUNTRIES[p.country]?.hotfrog?.toUpperCase();if(!iso)return [];
  const q=new URLSearchParams({"filter[entity.legalName]":p.keyword,"filter[entity.legalAddress.country]":iso,"page[size]":String(Math.min(100,p.maxResults))});
  const data=await requestJson(`https://api.gleif.org/api/v1/lei-records?${q}`,{source:this.id,signal:p.signal});
  const rows:LeadCandidate[]=[];for(const row of data.data||[]){const e=row.attributes?.entity;if(!e||e.status!=="ACTIVE"||e.legalAddress?.country!==iso)continue;const a=e.legalAddress;const c=candidate(p,this.name,{company:e.legalName?.name,address:[...(a.addressLines||[]),a.city,a.postalCode].filter(Boolean).join(", "),source_url:`https://search.gleif.org/#/record/${row.id}`,evidence:"CC0 GLEIF；名称关键词匹配且注册地址国家一致；不证明行业或采购意向。"});rows.push(c);progress?.({company:c.company,source:this.name,candidate:c});}return rows;
 }
};
