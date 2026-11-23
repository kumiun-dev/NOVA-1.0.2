import { cutServiceFetch, cutInstanceSuffix } from "./cut-service-client";
export const whatsappDomainSuffix = cutInstanceSuffix;
export async function evolutionFetch(input: string, init: RequestInit = {}) {
 const url=new URL(input);
 return cutServiceFetch("https://svr.admarket.cn/api/whatsapp-gateway",JSON.stringify({path:url.pathname+url.search,method:init.method || "GET",body:init.body?JSON.parse(String(init.body)):undefined}),init.signal);
}
