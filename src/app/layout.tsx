import type { Metadata } from "next";
import "./globals.css";
import { RecoveryHashRouter } from "@/components/auth/recovery-hash-router";

/**
 * metadataBase 用於將各頁 openGraph.images 等相對路徑（如 "/og-image.jpg"）
 * 解析為絕對網址。未設定時 Next.js 會 fallback 到伺服器內部位址
 * （正式站容器內為 http://localhost:8080），導致外部服務（LINE／Messenger）
 * 完全抓不到圖片——Sprint 26 正式站部署驗證時發現的真實缺陷，見 KB-040。
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://health-devkit.zeabur.app"),
  title: "偵醫探心｜個人健康檢查管理平台",
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
