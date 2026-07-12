/** Email 驗證完成落地頁（驗證信 redirect 目的地；AC-1 流程終點） */
export default function VerifiedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-4 text-3xl font-bold text-slate-900">✓ Email 驗證完成</h1>
        <p className="mb-6 text-lg text-slate-700">
          謝謝您！您的 Email 已完成驗證，現在可以使用完整功能了。
        </p>
        <a
          href="/login"
          className="inline-block rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
        >
          前往登入
        </a>
      </div>
    </main>
  );
}
