import { NextRequest, NextResponse } from "next/server";
import { SOURCES } from "@/lib/sources";
import { COUNTRIES } from "@/lib/sources/countries";
import { validateVat } from "@/lib/sources/registries";
import { withAuth } from "@/lib/auth";
export const POST = withAuth(async function POST(req:NextRequest){
 const b=await req.json().catch(()=>({}));
 try{
  if(b.source==="vies")return NextResponse.json(await validateVat(String(b.code||""),String(b.number||""),req.signal));
  const source=SOURCES.find(s=>s.id===b.source&&["gleif","companies_house","sirene","abn","samgov"].includes(s.id));
  const country=String(b.country||""),keyword=String(b.keyword||"").trim();
  if(!source||!COUNTRIES[country]||!keyword||keyword.length>120)return NextResponse.json({error:"请选择登记服务、国家并填写企业名或行业"},{status:400});
  const p={country,countryEn:COUNTRIES[country].en,keyword,keywordZh:keyword,industry:String(b.industry||""),industryEn:"",position:"",maxResults:10,signal:AbortSignal.any([req.signal,AbortSignal.timeout(30000)])};
  if(source.supports&&!source.supports(p))return NextResponse.json({error:"登记服务不支持此国家"},{status:400});
  const records=await source.search(p);
  return NextResponse.json({records,purpose:"仅供企业身份或行业登记核验，不属于达标获客结果，不写入客户库，也不证明采购意向"});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:"核验服务不可用"},{status:502});}
});
