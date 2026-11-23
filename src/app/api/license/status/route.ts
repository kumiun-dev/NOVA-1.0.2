import { NextResponse } from "next/server";
import { userById } from "@/lib/auth";
export async function GET() { return NextResponse.json({selfHosted:true,setupRequired:!userById("owner"),authorized:true,requiresLicense:false,message:"",license:{expiresAt:"",maxEmployees:Number.MAX_SAFE_INTEGER,modules:["*"]}},{headers:{"Cache-Control":"private, no-store"}}); }
