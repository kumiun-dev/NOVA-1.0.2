import type { Metadata } from "next";
import { SidebarNavigationProvider } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "NOVA · 外贸获客智能体平台",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
  description: "找到客户、联系客户、处理客户事情、发报价单的一体化智能体平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><SidebarNavigationProvider>{children}</SidebarNavigationProvider></body>
    </html>
  );
}
