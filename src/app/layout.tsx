import type { Metadata } from "next";
import "./globals.css";
import { RecoveryHashRouter } from "@/components/auth/recovery-hash-router";

export const metadata: Metadata = {
  title: "個人健康檢查管理平台",
  description: "把多年健檢資料整理成可追溯的趨勢與可停止的行動計畫",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">
        <RecoveryHashRouter />
        {children}
      </body>
    </html>
  );
}
