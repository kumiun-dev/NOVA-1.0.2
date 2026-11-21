import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { requestText } from "./http";
import { extractEmails, decodeEntities } from "./scraper";
import type { LeadCandidate } from "./sources/types";
const usableEmail=(e:string)=>/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e)&&!/^(jobs?|careers?|hr|abuse|privacy|jubao|noreply|x{3,})@|[•…*]/i.test(e);

const blocked=new BlockList();
for(const [ip,bits] of [["0.0.0.0",8],["10.0.0.0",8],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.168.0.0",16],["100.64.0.0",10],["224.0.0.0",4]] as const)blocked.addSubnet(ip,bits,"ipv4");
blocked.addSubnet("::1",128,"ipv6");blocked.addSubnet("fc00::",7,"ipv6");blocked.addSubnet("fe80::",10,"ipv6");
async function safe(raw:string){const u=new URL(raw);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.port&&!['80','443'].includes(u.port))throw Error("非公开官网地址");const host=u.hostname.replace(/^\[|\]$/g,"");if(host.startsWith("::ffff:")||host==='localhost')throw Error("内网地址");const ips=await lookup(host,{all:true});if(!ips.length||ips.some(x=>blocked.check(x.address,x.family===6?'ipv6':'ipv4')))throw Error("内网地址");return u;}
export async function enrichPublicWebsite(c:LeadCandidate,signal:AbortSignal,products:string[]=[]):Promise<LeadCandidate>{
  if(!c.website)return c;
  const out={...c};
  if(!/^\+?[\d\s().-]+$/.test(out.phone)||out.phone.replace(/\D/g,"").length<7||out.phone.replace(/\D/g,"").length>15||/^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(out.phone))out.phone="";
  try{
    const home=await safe(/^https?:\/\//i.test(c.website)?c.website:`https://${c.website}`);
    const options={source:"website",signal,retries:0,timeoutMs:8000,maxBytes:2*1024*1024,validateRedirect:safe};
    const html=await requestText(home.href,options);
    const parse=(body:string)=>{if(!usableEmail(out.email))out.email=extractEmails(decodeEntities(body)).find(usableEmail)||"";out.phone ||= decodeEntities(body.match(/href=["']tel:([^"']+)/i)?.[1]||body.match(/"telephone"\s*:\s*"([^"\n]+)"/i)?.[1]||body.replace(/<[^>]*>/g," ").match(/(?:telephone|phone|tel|电话)\s*[:：]?\s*(\+?[\d(][\d().\s-]{7,23}\d)/i)?.[1]||"").trim().replace(/^tel:/i,"");
     if(products.length&&!out.product_match){const text=decodeEntities(body.replace(/<(script|style)[\s\S]*?<\/\1>/gi," ").replace(/<[^>]*>/g," ")).replace(/\s+/g," ");for(const product of products){const escaped=product.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s+");const m=new RegExp(`(?<![a-z0-9])${escaped}(?:s|es)?(?![a-z0-9])`,"i").exec(text);if(m){out.product_match=text.slice(Math.max(0,m.index-70),m.index+product.length+120);out.evidence=(out.evidence||"")+` 官网产品匹配证据：${out.product_match}`;break;}}}
    };parse(html);
    for(const match of [...html.matchAll(/href=["']([^"']*(?:contact|about|kontakt|impressum|联系我们|products?|catalog)[^"']*)["']/gi)].slice(0,4)){
      if(out.email&&out.phone&&(!products.length||out.product_match))break;const link=await safe(new URL(decodeEntities(match[1]),home).href);if(link.origin!==home.origin)continue;
      try{parse(await requestText(link.href,options));}catch{}
    }
    out.website=home.href;
  }catch{}
  return out;
}
