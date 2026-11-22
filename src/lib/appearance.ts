export const THEMES = [
  { id: "orange", name: "灰白暖橙", color: "#F26A35", dark: false },
  { id: "mint", name: "炭黑薄荷", color: "#2BE7BC", dark: true },
  { id: "violet", name: "深靛幻紫", color: "#A478F2", dark: true },
  { id: "ocean", name: "深海冰蓝", color: "#48C9EF", dark: true },
  { id: "ivory", name: "曜黑米白", color: "linear-gradient(135deg,#242321 50%,#F5F0E4 50%)", dark: false },
] as const;
export type ThemeId = typeof THEMES[number]["id"];
export function validTheme(value: unknown): value is ThemeId { return THEMES.some(t => t.id === value); }
