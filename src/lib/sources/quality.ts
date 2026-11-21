export type BusinessContact = { company?: string; email?: string; phone?: string; whatsapp?: string; source?: string; website?: string; evidence?: string; customer_type?: string };
export function usableContactCount(c: BusinessContact): number {
 const company=(c.company||"").trim();const email=(c.email||"").trim();const phone=(c.phone||"").trim();const digits=phone.replace(/\D/g,"");
 const validEmail=/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) && !/^(jubao|abuse|noreply|no-reply|privacy|webmaster|jobs?|careers?|hr|recruitment)@/i.test(email) && !/^(?:x{3,}|\*+)|[•…*]/i.test(email);
 const validPhone=/^\+?[\d\s().-]+$/.test(phone) && digits.length>=7 && digits.length<=15 && !/^(\d)\1{6,}$/.test(digits) && !/^(19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(phone);
 return Number(!!company && !/未获取|待确认主体|unknown|n\/a/i.test(company))+Number(validEmail)+Number(validPhone);
}
export function isBusiness(c: BusinessContact): boolean {
 if(/(?:hiring|recruitment|employment)\s+(?:center|office)|招聘中心|人才市场/i.test(c.company||""))return false;
 if(/社媒公开线索|个人|论坛|博客/.test(c.source||"")) return false;
 if(/Overture 开放商家库|Hotfrog|ImportYeti|OpenStreetMap|企业名录|工商登记|企业登记|法人实体登记|公开地图企业资料|海关/.test(c.source||"")) return true;
 return !!c.website && /company|corporation|inc\b|llc\b|ltd\b|gmbh|wholesal|distribut|importer|procurement|公司|经销|批发|采购|business/i.test([c.company,c.evidence,c.customer_type].join(" "));
}
export function displayableLead(c: BusinessContact): boolean { return usableContactCount(c)===3 && isBusiness(c); }
