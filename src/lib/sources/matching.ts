// 行业级词只承诺行业相关性；具体产品必须取得官网文本证据。
export function productTerms(keyword:string,english:string):string[]{
 const broad=/^(配件|五金|五金工具|五金配件|家具|宠物|宠物用品|家居|家居用品|灯具|灯饰|照明|农业|农产品|机械|机械设备|汽配|汽车配件|服装|服饰|电子|电子产品|玩具|化妆品|美妆|建材|箱包|食品|饮料|园艺|运动|hardware(?: tools?)?(?: accessories)?|furniture|pet(?: supplies| products)?|lighting|agricultur(?:e|al supplies)|machinery|auto parts|car parts|clothing|apparel|electronics|toys|cosmetics|building materials|bags|luggage|food|beverage|garden|sports)$/i;
 const clean=english.replace(/\b(importers?|distributors?|wholesalers?|wholesale|buyers?|suppliers?)\b/gi," ").replace(/\s+/g," ").trim();
 return broad.test(keyword.trim())||broad.test(clean)?[]:[clean||english];
}
