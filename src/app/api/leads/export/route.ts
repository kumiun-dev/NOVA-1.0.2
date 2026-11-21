import { NextRequest,NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";
import { withAuth } from "@/lib/auth";
const fields=["company","country","industry","name","position","email","whatsapp","phone","website","address","source","acquired_at"];
const header=["公司名","国家","行业","联系人","职位","邮箱","WhatsApp","电话","官网","地址","来源","获取日期"];
const score=(r:any)=>(r.email?3:0)+(r.phone||r.whatsapp?2:0)+(r.name?1:0)+(r.website?1:0);
function cell(raw:unknown){let s=String(raw??"");if(/^[=+@\-\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
export const GET = withAuth(async function GET(req:NextRequest){
 const p=req.nextUrl.searchParams;const format=p.get("format")||"csv";if(!["csv","xlsx"].includes(format))return NextResponse.json({error:"不支持的导出格式"},{status:400});
 const limit=Math.min(500,Math.max(1,Math.floor(Number(p.get("limit"))||100)));const page=Math.max(1,Math.floor(Number(p.get("page"))||1));
 const cond:string[]=[],args:any[]=[];
 if(p.has("ids")){const ids=[...new Set((p.get("ids")||"").split(",").map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))];if(!ids.length)return NextResponse.json({error:"未选择客户"},{status:400});if(ids.length>500)return NextResponse.json({error:"单次最多导出500家"},{status:400});cond.push("id IN ("+ids.map(()=>"?").join(",")+")");args.push(...ids);}
 else{for(const key of ["country","industry","position","source"]){if(p.get(key)){cond.push(key+"=?");args.push(p.get(key));}}if(p.get("keyword")){cond.push("(company LIKE ? OR name LIKE ? OR email LIKE ?)");const k="%"+p.get("keyword")+"%";args.push(k,k,k);}}
 const where=cond.length?"WHERE "+cond.join(" AND "):"";
 const order="ORDER BY ((email!='')*3 + ((phone!='' OR whatsapp!='')*2) + (name!='') + (website!='')) DESC, company COLLATE NOCASE";
 const offset=p.has("ids")?0:(page-1)*limit;const rows=db.prepare(`SELECT * FROM leads ${where} ${order} LIMIT ? OFFSET ?`).all(...args,limit,offset) as any[];
 const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(new Date());const base=["nova-leads",p.get("keyword")||"本次",p.get("country")||"企业",date,rows.length+"条"].join("-").replace(/[\\/:*?"<>|\r\n]/g,"_");
 const disposition=`attachment; filename="nova-leads-${rows.length}.${format}"; filename*=UTF-8''${encodeURIComponent(base+"."+format)}`;
 const values=rows.map(r=>fields.map(f=>f==="source"&&r.source==="Overture 开放商家库"?`${r.source}；Overture Maps Foundation https://overturemaps.org/；${r.evidence||""}`:r[f]??""));
 if(format==="xlsx"){const sheet=XLSX.utils.aoa_to_sheet([header,...values]);sheet['!cols']=header.map(()=>({wch:24}));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"获客");const bytes=XLSX.write(book,{type:"buffer",bookType:"xlsx"});return new NextResponse(new Uint8Array(bytes),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":disposition}});}
 return new NextResponse("\ufeff"+[header,...values].map(r=>r.map(cell).join(",")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":disposition}});
});
