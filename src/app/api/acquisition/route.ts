import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";
import { withAuth } from "@/lib/auth";
const ids=["companies_house","samgov","overpass","gleif","sirene","abn","vies","website"];
export const GET = withAuth(async function GET(){
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai"}).format(new Date());
 return NextResponse.json({abn_configured:!!getSetting("abn_guid"),companies_house_configured:!!getSetting("companies_house_key"),samgov_configured:!!getSetting("samgov_key"),proxy_configured:!!getSetting("http_proxy"),user_agent:getSetting("collect_user_agent"),quotas:ids.map(id=>({id,used:getSetting(`quota_date_${id}`)===today?Number(getSetting(`quota_used_${id}`)||0):0,limit:Number(getSetting(`quota_limit_${id}`)||0)})),phase:"商家发现与身份核验分开；登记数据不等于可联系客户"});
});
export const POST = withAuth(async function POST(req:NextRequest){
 const body=await req.json().catch(()=>({}));
 if(body.clear_proxy===true)setSetting("http_proxy","");
 for(const key of ["companies_house_key","samgov_key","abn_guid","http_proxy","collect_user_agent"]){
  if(typeof body[key]!=="string"||!body[key].trim())continue;
  if(key==="http_proxy"){try{if(!/^https?:$/.test(new URL(body[key]).protocol))throw Error();}catch{return NextResponse.json({error:"代理地址必须是 HTTP/HTTPS URL"},{status:400});}}
  if(key==="collect_user_agent"&&/[\r\n]/.test(body[key]))return NextResponse.json({error:"UA 不得包含换行"},{status:400});
  setSetting(key,body[key].trim());
 }
 for(const id of ids){const value=body[`quota_limit_${id}`];if(value!==undefined){if(!Number.isFinite(Number(value))||Number(value)<0)return NextResponse.json({error:"请求上限必须为非负整数"},{status:400});setSetting(`quota_limit_${id}`,String(Math.floor(Number(value))));}}
 return NextResponse.json({ok:true});
});
