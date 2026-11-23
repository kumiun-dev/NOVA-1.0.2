import {NextRequest,NextResponse} from "next/server";
import {withAuth} from "@/lib/auth";
import {getSetting,setSetting} from "@/lib/db";
function models():string[]{try{return JSON.parse(getSetting("agent_models")||"[]").filter((v:unknown)=>typeof v==="string")}catch{return []}}
export const GET=withAuth(async()=>NextResponse.json({models:Array.from(new Set([getSetting("ai_model")||process.env.DEEPSEEK_MODEL||"deepseek-flash","deepseek-chat","deepseek-reasoner",...models()])),selected:getSetting("agent_model")||""},{headers:{"Cache-Control":"private, no-store"}}));
export const POST=withAuth(async(req:NextRequest)=>{const body=await req.json().catch(()=>null);if(!body||typeof body.model!=="string"||(body.model&&!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(body.model)))return NextResponse.json({error:"模型 ID 格式无效"},{status:400});const list=models();if(body.model&&!list.includes(body.model)&&list.length>=30)return NextResponse.json({error:"最多保存30个自定义模型"},{status:400});setSetting("agent_model",body.model);if(body.model)setSetting("agent_models",JSON.stringify(Array.from(new Set([...list,body.model]))));return NextResponse.json({ok:true})});
