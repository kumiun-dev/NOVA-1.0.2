import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { DuckDBInstance as EngineInstance, DuckDBConnection } from "@duckdb/node-api";
import { requestBytes, requestText } from "../http";
import { getSetting } from "../db";
import { COUNTRIES } from "./countries";
import type { LeadCandidate, SourceAdapter, SearchParams } from "./types";
import { COUNTRY_BOUNDS } from "./bounds";

// 只映射商业场所分类；个人、地标、论坛及社媒用户不参与检索。
export const BUSINESS_CATEGORIES=[
 {test:/无人机|\bdrones?\b|\buav\b/i,pattern:"drone|hobby_shop|electronics_store|aviation|aircraft_dealer"},
 {test:/五金|建材|hardware|fastener|hinge|building material/i,pattern:"hardware_store|building_materials_store|construction_suppl|tool_store|industrial_suppl"},
 {test:/家具|家居|furniture|wardrobe|sofa|cabinet|chair|table/i,pattern:"furniture_store|home_furnishings|home_decor"},
 {test:/宠物|\bpet(?: supplies| products| food)?\b|\bdog food\b|\bcat food\b/i,pattern:"pet_store|pet_suppl"},
 {test:/汽配|汽车配件|auto parts|car parts|brake/i,pattern:"auto_parts|automotive_parts|tire_dealer"},
 {test:/灯具|照明|灯饰|lighting|lamp/i,pattern:"lighting_store|lighting_fixture"},
 {test:/服装|纺织|clothing|apparel|textile/i,pattern:"clothing_store|fabric_store|textile"},
 {test:/电子|electronics|connector|battery|circuit/i,pattern:"electronics_store|electronic_parts"},
 {test:/美妆|化妆|cosmetic|beauty|skincare/i,pattern:"cosmetics_store|beauty_suppl"},
 {test:/玩具|toy/i,pattern:"toy_store"},
 {test:/农业|农产品|agricultur|farm supplies/i,pattern:"farm_suppl|agricultural_suppl|agricultural_equipment"},
 {test:/机械|machinery|pump|bearing|valve/i,pattern:"industrial_equipment|machinery|industrial_suppl"},
 {test:/园艺|garden/i,pattern:"garden_center|garden_suppl"},
 {test:/运动|体育|sports|fitness/i,pattern:"sporting_goods_store|fitness_equipment"},
 {test:/箱包|bags|luggage/i,pattern:"luggage_store|bag_store"},
 {test:/食品|饮料|food|beverage/i,pattern:"food_wholesale|food_distributor|grocery_store"},
 {test:/医疗|medical|surgical/i,pattern:"medical_suppl|medical_equipment"},
 {test:/包装|packaging/i,pattern:"packaging|packing_suppl"},
 {test:/太阳能|光伏|solar/i,pattern:"solar_equipment|solar_energy|solar_panel"},
 {test:/化工|chemical/i,pattern:"chemical_suppl|chemical_wholesale"},
];
const matchingCategories=(text:string)=>BUSINESS_CATEGORIES.filter(c=>c.test.test(text));
const category=(p:SearchParams)=>{const industry=matchingCategories(p.industry),keyword=matchingCategories(p.keyword);return industry.find(c=>keyword.includes(c))||industry[0]||keyword[0];};
export function categoryConflict(p:SearchParams){const industry=matchingCategories(p.industry),keyword=matchingCategories(p.keyword);return industry.length>0&&keyword.length>0&&!industry.some(c=>keyword.includes(c));}
export const businessCategoryPattern=(p:SearchParams)=>{const c=category(p);return c?"^(?:"+c.pattern+")":"";};
const RELEASE="2026-10-21.0";
const root=()=>path.resolve(process.env.DATA_DIR||"data","overture");
const literal=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
let tail=Promise.resolve();
async function atomic(file:string,text:string|Buffer){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+"."+randomUUID()+".tmp";await fs.writeFile(tmp,text);await fs.rename(tmp,file);}

export const overture:SourceAdapter={
 id:"overture",name:"Overture 开放商家库",supports:p=>!!COUNTRIES[p.country]&&!!category(p),
 async search(p,progress){
  const cat=category(p);if(!cat)return [];
  const categoryPattern=businessCategoryPattern(p);
  const iso=p.country==="英国"?"GB":COUNTRIES[p.country]?.hotfrog.toUpperCase();if(!iso)return [];
  // 同一国家、商业类别共享候选池；具体关键词仍由获客路由逐条核对产品证据。
  const key=createHash("sha256").update(JSON.stringify([RELEASE,iso,cat.pattern])).digest("hex"),cache=path.join(root(),"queries",key+".json");
  const legacy=path.join(root(),"queries",createHash("sha256").update(JSON.stringify([RELEASE,iso,cat.pattern,p.keyword])).digest("hex")+".json");
  const rows:LeadCandidate[]=[],seen=new Set<string>();let cursor={file:0,offset:0};
  const identity=(name:string)=>name.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  try{let saved:any,migrated=false;try{saved=JSON.parse(await fs.readFile(cache,"utf8"));}catch{saved=JSON.parse(await fs.readFile(legacy,"utf8"));migrated=true;}if(saved.expires>Date.now()){
   const records=(saved.rows as LeadCandidate[]).filter(c=>new RegExp(categoryPattern).test(c.evidence?.match(/商家分类 ([^.。]+)[.。]/)?.[1]||""));
   cursor=records.length===saved.rows.length?(saved.cursor||cursor):{file:0,offset:0};
   if(migrated)await atomic(cache,JSON.stringify({...saved,rows:records,cursor,complete:saved.complete&&records.length===saved.rows.length}));
   for(const record of records){if(p.signal?.aborted)return rows;const c={...record,industry:p.industry};rows.push(c);seen.add(identity(c.company));progress?.({company:c.company,source:this.name,candidate:c});}
   if(saved.complete&&records.length===saved.rows.length||p.signal?.aborted||rows.length>=p.maxResults)return rows;
  }}catch{p.signal?.throwIfAborted();}
  let release!:()=>void;const previous=tail;tail=new Promise<void>(r=>{release=r;});await previous;
  let db:EngineInstance|undefined,connection:DuckDBConnection|undefined;
  const interrupt=()=>connection?.interrupt();
  try{
   p.signal?.throwIfAborted();progress?.({company:"首次读取开放商家文件，后续相同条件使用本地缓存",source:this.name});
   const {DuckDBInstance}=await import("@duckdb/node-api");
   const extensionDir=path.join(root(),"extensions");await fs.mkdir(extensionDir,{recursive:true});
   db=await DuckDBInstance.create(":memory:",{extension_directory:extensionDir,memory_limit:"384MB",threads:"2",autoinstall_known_extensions:"false",autoload_known_extensions:"false"});connection=await db.connect();p.signal?.addEventListener("abort",interrupt,{once:true});
   const version=String((await connection.runAndReadAll("SELECT version() AS v")).getRowObjectsJson()[0].v),platform=String((await connection.runAndReadAll("PRAGMA platform")).getRowObjectsJson()[0].platform);
   if(!/^v\d+\.\d+\.\d+$/.test(version)||!/^\w+$/.test(platform))throw Error("不支持的数据引擎平台");
   const extension=path.join(extensionDir,version,platform,"httpfs.duckdb_extension");
   try{await fs.access(extension);}catch{const bytes=await requestBytes(`https://extensions.duckdb.org/${version}/${platform}/httpfs.duckdb_extension.gz`,{source:"overture_setup",signal:p.signal,timeoutMs:45000,maxBytes:30*1024*1024});await atomic(extension,gunzipSync(bytes,{maxOutputLength:150*1024*1024}));}
   await connection.run(`LOAD ${literal(extension.replace(/\\/g,"/"))}; SET http_timeout=15; SET http_retries=0;`);
   const proxy=getSetting("http_proxy")||process.env.COLLECT_HTTP_PROXY;if(proxy)await connection.run(`SET http_proxy=${literal(proxy)};`);
   const prefix=`release/${RELEASE}/theme=places/type=place/`;
   const xml=await requestText(`https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`,{source:"overture_catalog",signal:p.signal});
   const files=[...xml.matchAll(/<Key>([^<]+\.parquet)<\/Key>/g)].map(m=>m[1]).filter(s=>s.startsWith(prefix)&&/^[\w=./-]+$/.test(s));if(!files.length)throw Error("开放数据目录无可读取文件");
   const bounds=COUNTRY_BOUNDS[iso]||[-180,-90,180,90];
   for(const [index,file] of files.entries()){
    if(index<cursor.file)continue;
    p.signal?.throwIfAborted();progress?.({company:`读取开放商家分片 ${index+1}/${files.length} · 已找到 ${rows.length} 家不同名称的商家`,source:this.name});
    const sql=`SELECT id,names.primary AS company,emails[1] AS email,phones[1] AS phone,websites[1] AS website,addresses[1].freeform AS address,addresses[1].locality AS city,taxonomy.primary AS category,to_json(sources) AS provenance FROM read_parquet(?) WHERE addresses[1].country=? AND regexp_matches(taxonomy.primary,?) AND bbox.xmin BETWEEN ? AND ? AND bbox.ymin BETWEEN ? AND ? AND confidence>=0.8 AND (operating_status IS NULL OR operating_status='open') AND len(emails)>0 AND len(phones)>0 AND names.primary IS NOT NULL LIMIT ? OFFSET ?`;
    for(let offset=index===cursor.file?cursor.offset:0;offset<1000;){
    const batchSize=offset===0?5:25;
    cursor={file:index,offset};p.signal?.throwIfAborted();
    const result=await connection.runAndReadAll(sql,["https://overturemaps-us-west-2.s3.amazonaws.com/"+file,iso,categoryPattern,bounds[0],bounds[2],bounds[1],bounds[3],batchSize,offset]);
    for(const raw of result.getRowObjectsJson()){
     p.signal?.throwIfAborted();const name=String(raw.company||"").trim(),companyKey=identity(name);if(!companyKey||seen.has(companyKey))continue;seen.add(companyKey);
     const c:LeadCandidate={company:name,name:"",email:String(raw.email||""),phone:String(raw.phone||""),whatsapp:"",country:p.country,industry:p.industry,position:"",website:String(raw.website||""),address:[raw.address,raw.city].filter(Boolean).join(", "),source:this.name,source_url:"https://explore.overturemaps.org/",evidence:`Overture Maps Foundation；发布 ${RELEASE}；GERS ${raw.id}；商家分类 ${raw.category}。仅属行业相关商家，具体产品需求及采购意向未核实。来源与许可：${raw.provenance}`};
     rows.push(c);progress?.({company:c.company,source:this.name,candidate:c});if(rows.length>=p.maxResults)break;
    }
    cursor={file:index,offset:rows.length>=p.maxResults?offset:offset+batchSize};await atomic(cache,JSON.stringify({expires:Date.now()+7*86400000,release:RELEASE,rows,cursor,complete:false}));
    if(result.currentRowCount<batchSize||rows.length>=p.maxResults)break;
    offset+=batchSize;
    }
    if(rows.length>=p.maxResults)break;
    cursor={file:index+1,offset:0};
   }
   await atomic(cache,JSON.stringify({expires:Date.now()+7*86400000,release:RELEASE,rows,cursor,complete:cursor.file>=files.length}));return rows;
  }catch(e){
   // 达到目标或用户停止后，保留已找到的数据，下一次从缓存读取。
   if(rows.length)await atomic(cache,JSON.stringify({expires:Date.now()+7*86400000,release:RELEASE,rows,cursor,complete:false})).catch(()=>{});
   if(p.signal?.aborted)throw e;
   p.warn?.("Overture 开放商家文件读取失败或超时，已保留此前找到的商家；请检查网络与代理。数据目录可访问不代表大文件范围读取一定成功。");return rows;
  }finally{p.signal?.removeEventListener("abort",interrupt);connection?.closeSync();db?.closeSync();release();}
 }
};
