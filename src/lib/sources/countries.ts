// 国家映射：中文名 -> { 英文名, 各源国家码 }
export interface CountryInfo {
  en: string;
  hotfrog: string; // Hotfrog 站点码
  tld: string; // 国别域名后缀（用于域名国家判定）
  phoneCode: string; // 国际区号（用于电话国家判定）
}

export const COUNTRIES: Record<string, CountryInfo> = {
  美国: { en: "United States", hotfrog: "us", tld: "", phoneCode: "+1" },
  德国: { en: "Germany", hotfrog: "de", tld: ".de", phoneCode: "+49" },
  英国: { en: "United Kingdom", hotfrog: "uk", tld: ".uk", phoneCode: "+44" },
  法国: { en: "France", hotfrog: "fr", tld: ".fr", phoneCode: "+33" },
  意大利: { en: "Italy", hotfrog: "it", tld: ".it", phoneCode: "+39" },
  西班牙: { en: "Spain", hotfrog: "es", tld: ".es", phoneCode: "+34" },
  荷兰: { en: "Netherlands", hotfrog: "nl", tld: ".nl", phoneCode: "+31" },
  加拿大: { en: "Canada", hotfrog: "ca", tld: ".ca", phoneCode: "+1" },
  澳大利亚: { en: "Australia", hotfrog: "au", tld: ".au", phoneCode: "+61" },
  日本: { en: "Japan", hotfrog: "jp", tld: ".jp", phoneCode: "+81" },
  韩国: { en: "South Korea", hotfrog: "kr", tld: ".kr", phoneCode: "+82" },
  印度: { en: "India", hotfrog: "in", tld: ".in", phoneCode: "+91" },
  巴西: { en: "Brazil", hotfrog: "br", tld: ".br", phoneCode: "+55" },
  墨西哥: { en: "Mexico", hotfrog: "mx", tld: ".mx", phoneCode: "+52" },
  阿联酋: { en: "United Arab Emirates", hotfrog: "ae", tld: ".ae", phoneCode: "+971" },
  瑞典: { en: "Sweden", hotfrog: "se", tld: ".se", phoneCode: "+46" },
  土耳其: { en: "Turkey", hotfrog: "tr", tld: ".tr", phoneCode: "+90" },
  越南: { en: "Vietnam", hotfrog: "vn", tld: ".vn", phoneCode: "+84" },
  泰国: { en: "Thailand", hotfrog: "th", tld: ".th", phoneCode: "+66" },
  印尼: { en: "Indonesia", hotfrog: "id", tld: ".id", phoneCode: "+62" },
  菲律宾: { en: "Philippines", hotfrog: "ph", tld: ".ph", phoneCode: "+63" },
  沙特: { en: "Saudi Arabia", hotfrog: "sa", tld: ".sa", phoneCode: "+966" },
  南非: { en: "South Africa", hotfrog: "za", tld: ".za", phoneCode: "+27" },
  尼日利亚: { en: "Nigeria", hotfrog: "ng", tld: ".ng", phoneCode: "+234" },
  阿根廷: { en: "Argentina", hotfrog: "ar", tld: ".ar", phoneCode: "+54" },
  智利: { en: "Chile", hotfrog: "cl", tld: ".cl", phoneCode: "+56" },
  秘鲁: { en: "Peru", hotfrog: "pe", tld: ".pe", phoneCode: "+51" },
  哥伦比亚: { en: "Colombia", hotfrog: "co", tld: ".co", phoneCode: "+57" },
  波兰: { en: "Poland", hotfrog: "pl", tld: ".pl", phoneCode: "+48" },
  俄罗斯: { en: "Russia", hotfrog: "ru", tld: ".ru", phoneCode: "+7" },
  比利时: { en: "Belgium", hotfrog: "be", tld: ".be", phoneCode: "+32" },
  葡萄牙: { en: "Portugal", hotfrog: "pt", tld: ".pt", phoneCode: "+351" },
  瑞士: { en: "Switzerland", hotfrog: "ch", tld: ".ch", phoneCode: "+41" },
  奥地利: { en: "Austria", hotfrog: "at", tld: ".at", phoneCode: "+43" },
  丹麦: { en: "Denmark", hotfrog: "dk", tld: ".dk", phoneCode: "+45" },
  挪威: { en: "Norway", hotfrog: "no", tld: ".no", phoneCode: "+47" },
  芬兰: { en: "Finland", hotfrog: "fi", tld: ".fi", phoneCode: "+358" },
  爱尔兰: { en: "Ireland", hotfrog: "ie", tld: ".ie", phoneCode: "+353" },
  新加坡: { en: "Singapore", hotfrog: "sg", tld: ".sg", phoneCode: "+65" },
  马来西亚: { en: "Malaysia", hotfrog: "my", tld: ".my", phoneCode: "+60" },
  巴基斯坦: { en: "Pakistan", hotfrog: "pk", tld: ".pk", phoneCode: "+92" },
  孟加拉: { en: "Bangladesh", hotfrog: "bd", tld: ".bd", phoneCode: "+880" },
  埃及: { en: "Egypt", hotfrog: "eg", tld: ".eg", phoneCode: "+20" },
  以色列: { en: "Israel", hotfrog: "il", tld: ".il", phoneCode: "+972" },
  希腊: { en: "Greece", hotfrog: "gr", tld: ".gr", phoneCode: "+30" },
  捷克: { en: "Czech Republic", hotfrog: "cz", tld: ".cz", phoneCode: "+420" },
  罗马尼亚: { en: "Romania", hotfrog: "ro", tld: ".ro", phoneCode: "+40" },
  匈牙利: { en: "Hungary", hotfrog: "hu", tld: ".hu", phoneCode: "+36" },
  乌克兰: { en: "Ukraine", hotfrog: "ua", tld: ".ua", phoneCode: "+380" },
  中国: { en: "China", hotfrog: "cn", tld: ".cn", phoneCode: "+86" },
};

export const COUNTRY_OPTIONS = Object.keys(COUNTRIES);

// 行业中英映射（采集时中文行业转英文搜索词）
export const INDUSTRY_EN: Record<string, string> = {
  家具: "furniture",
  家居园艺: "home garden",
  服装纺织: "apparel textile",
  电子产品: "electronics",
  汽车配件: "auto parts",
  机械设备: "machinery",
  五金工具: "hardware tools",
  医疗器械: "medical devices",
  美妆个护: "beauty personal care",
  食品饮料: "food beverage",
  玩具: "toys",
  运动户外: "sports outdoors",
  宠物用品: "pet supplies",
  包装印刷: "packaging printing",
  照明灯具: "lighting",
  建材: "building materials",
  化工产品: "chemicals",
  农产品: "agriculture",
  太阳能光伏: "solar energy",
  箱包: "bags luggage",
};

export const INDUSTRY_OPTIONS = Object.keys(INDUSTRY_EN);
