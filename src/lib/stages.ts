// 纯常量模块：不依赖 Node/数据库，可安全被客户端组件引用。
export const SALES_STAGES = ["线索", "已联系", "已报价", "谈判中", "样品中", "成交", "流失"] as const;

export const STAGE_COLOR: Record<string, string> = {
  "线索": "#9A9E9F", "已联系": "#6B6F76", "已报价": "#B07A2A", "谈判中": "#B07A2A", "样品中": "#A45D22", "成交": "#2E7D5B", "流失": "#A32D2D",
};
