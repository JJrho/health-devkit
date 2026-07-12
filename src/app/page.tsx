/**
 * 公開站首頁（過渡版）：Sprint 3 起提供註冊／登入入口。
 * 完整公開站（Hero／說明／隱私）見 SDD §5，於對應 UI Feature 實作。
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-8">
      <h1 className="text-4xl font-bold text-slate-900">個人健康檢查管理平台</h1>
      <p className="max-w-xl text-center text-xl text-slate-700" data-testid="skeleton-status">
        把多年健檢資料整理成看得懂的趨勢，建立可以安心停止的健康行動計畫。
      </p>
      <div className="flex gap-4">
        <a
          href="/register"
          className="rounded-lg bg-blue-700 px-8 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          建立帳號
        </a>
        <a
          href="/login"
          className="rounded-lg border-2 border-blue-700 px-8 py-4 text-xl font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          登入
        </a>
      </div>
    </main>
  );
}
