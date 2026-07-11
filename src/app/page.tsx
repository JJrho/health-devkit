/**
 * Sprint 1 smoke 佔位頁（AC-2）。
 * 正式公開站（Hero／說明／隱私）見 SDD §5，於對應 UI Feature 實作。
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold text-[--color-primary]">
        個人健康檢查管理平台
      </h1>
      <p className="text-lg" data-testid="skeleton-status">
        專案骨架運行中（Sprint 1 技術棧 PoC）
      </p>
    </main>
  );
}
