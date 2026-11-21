import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fetch, ProxyAgent } from "undici";
import { getSetting, setSetting } from "./db";

type Options = { source: string; method?: "GET" | "POST"; headers?: Record<string,string>; body?: string; signal?: AbortSignal; timeoutMs?: number; ttlMs?: number; retries?: number; noRedirect?: boolean; maxBytes?: number; binary?: boolean; validateRedirect?: (url:string)=>Promise<unknown> };
class Gate {
  private active=0; private queue: Array<()=>void> = [];
  constructor(private max:number) {}
  async run<T>(task:()=>Promise<T>):Promise<T> {
    if(this.active>=this.max) await new Promise<void>(resolve=>this.queue.push(resolve)); else this.active++;
    try{return await task();}finally{const next=this.queue.shift();if(next)next();else this.active--;}
  }
}
const globalGate=new Gate(6), hosts=new Map<string,Gate>(), nextRequest=new Map<string,number>(), pending=new Map<string,Promise<string>>(), proxies=new Map<string,ProxyAgent>();
const base=()=>path.join(process.cwd(),process.env.DATA_DIR||"data");
const hash=(s:string)=>createHash("sha1").update(s).digest("hex");
function pause(ms:number,signal?:AbortSignal):Promise<void>{return new Promise((resolve,reject)=>{if(signal?.aborted){reject(signal.reason);return;}const cancel=()=>{clearTimeout(timer);reject(signal?.reason);};const timer=setTimeout(()=>{signal?.removeEventListener("abort",cancel);resolve();},ms);signal?.addEventListener("abort",cancel,{once:true});});}
function safeUrl(raw:string):string { const u=new URL(raw);u.username="";u.password="";for(const k of [...u.searchParams.keys()])if(/key|token|secret|password|guid|auth/i.test(k))u.searchParams.set(k,"[redacted]");return u.href; }
async function log(source:string,url:string,status:number,ms:number,cached:boolean){try{await fs.mkdir(path.join(base(),"logs"),{recursive:true});await fs.appendFile(path.join(base(),"logs","collect.log"),JSON.stringify({at:new Date().toISOString(),source,url:safeUrl(url),status,ms,cached})+"\n");}catch{}}
function quota(source:string) {
  const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(new Date());
  const used=getSetting(`quota_date_${source}`)===date?Number(getSetting(`quota_used_${source}`)||0):0;
  const limit=Number(getSetting(`quota_limit_${source}`)||0);
  if(limit>0&&used>=limit)throw new Error(`${source} 已达到设置的今日请求上限`);
  setSetting(`quota_date_${source}`,date);setSetting(`quota_used_${source}`,String(used+1));
}
export async function requestText(raw:string,o:Options):Promise<string> {
  const u=new URL(raw);
  if(!/^https?:$/.test(u.protocol))throw new Error("仅支持 HTTP/HTTPS 接口");
  o.signal?.throwIfAborted();
  const source=o.source.replace(/[^a-z0-9_-]/gi,"_");
  const key=hash(JSON.stringify([raw,o.method||"GET",o.body||"",o.headers||{},!!o.noRedirect,o.maxBytes||0,!!o.binary]));
  const file=path.join(base(),"cache",source,key+".json");
  const ttl=o.ttlMs??7*86400000;
  if(ttl>0)try{const cached=JSON.parse(await fs.readFile(file,"utf8"));if(cached.expires>Date.now()){await log(source,raw,200,0,true);return cached.text;}}catch{}
  const existing=pending.get(source+key);if(existing)return existing;
  const job=(async()=>{
    const attempts=Math.min(2,Math.max(0,o.retries??2))+1;
    for(let attempt=0;attempt<attempts;attempt++){
      o.signal?.throwIfAborted();
      const spacing=/company-information\.service\.gov\.uk$/.test(u.hostname)?700:/overpass/.test(u.hostname)?2500:500;
      const slot=Math.max(Date.now(),nextRequest.get(u.hostname)||0);nextRequest.set(u.hostname,slot+spacing);
      await pause(Math.max(0,slot-Date.now()),o.signal);
      let hostGate=hosts.get(u.hostname);if(!hostGate){hostGate=new Gate(2);hosts.set(u.hostname,hostGate);}
      let status=0;const start=Date.now();
      try {
        const result=await hostGate.run(()=>globalGate.run(async()=>{
          o.signal?.throwIfAborted();quota(source);
          const proxy=getSetting("http_proxy")||process.env.COLLECT_HTTP_PROXY||"";
          let dispatcher:ProxyAgent|undefined;
          if(proxy){const parsed=new URL(proxy);if(!/^https?:$/.test(parsed.protocol))throw new Error("代理仅支持 HTTP/HTTPS");dispatcher=proxies.get(proxy);if(!dispatcher){dispatcher=new ProxyAgent(proxy);proxies.set(proxy,dispatcher);}}
          const timeout=AbortSignal.timeout(o.timeoutMs??15000);
          const signal=o.signal?AbortSignal.any([o.signal,timeout]):timeout;
          const options={method:o.method||"GET",body:o.body,redirect:(o.validateRedirect?"manual":o.noRedirect?"error":"follow") as "manual"|"error"|"follow",headers:{"User-Agent":getSetting("collect_user_agent")||"NOVA/1.0 (public business research)",Accept:"application/json,text/html;q=0.9",...o.headers},signal,dispatcher};
          let response=await fetch(raw,options),current=raw;
          if(o.validateRedirect)for(let hop=0;[301,302,303,307,308].includes(response.status);hop++){
            const location=response.headers.get("location");await response.body?.cancel();if(hop>=4||!location)throw Object.assign(new Error("官网重定向无效"),{retryable:false});
            current=new URL(location,current).href;await o.validateRedirect(current);response=await fetch(current,options);
          }
          status=response.status;
          const chunks:Uint8Array[]=[];let bytes=0;
          for await(const chunk of response.body||[]){bytes+=chunk.length;if(bytes>(o.maxBytes||8*1024*1024))throw Object.assign(new Error("页面过大"),{retryable:false});chunks.push(chunk);}
          const text=Buffer.concat(chunks).toString(o.binary?"base64":"utf8");
          if(!response.ok){const error=new Error(`${source} HTTP ${status}`) as Error&{retryable:boolean};error.retryable=status===429||status>=500;throw error;}
          return text;
        }));
        await log(source,raw,status,Date.now()-start,false);
        if(ttl>0)try{await fs.mkdir(path.dirname(file),{recursive:true});const temporary=file+"."+randomUUID()+".tmp";await fs.writeFile(temporary,JSON.stringify({expires:Date.now()+ttl,text:result}));await fs.rename(temporary,file);}catch{/* 缓存写入失败不丢弃已取得的数据 */}
        return result;
      }catch(e){
        await log(source,raw,status,Date.now()-start,false);
        o.signal?.throwIfAborted();
        if(e instanceof Error && e.message.includes("今日请求上限"))throw e;
        const retryable=(e as any)?.retryable ?? status===0;
        if(!retryable||attempt===attempts-1)throw new Error(status>=400?`${source} HTTP ${status}`:e instanceof Error&&e.message==="页面过大"?`${source} 页面超过读取大小限制`:`${source} 请求失败或超时，请检查网络/代理`);
        await pause((attempt===0?1000:4000)+Math.floor(Math.random()*200),o.signal);
      }
    }
    throw new Error(`${source} 请求失败`);
  })();
  pending.set(source+key,job);
  try{return await job;}finally{pending.delete(source+key);}
}
export async function requestJson<T=any>(url:string,o:Options):Promise<T>{const text=await requestText(url,o);try{return JSON.parse(text);}catch{throw new Error(`${o.source} 返回的不是有效 JSON`);}}
export async function requestBytes(url:string,o:Options):Promise<Buffer>{return Buffer.from(await requestText(url,{...o,binary:true}),"base64");}
