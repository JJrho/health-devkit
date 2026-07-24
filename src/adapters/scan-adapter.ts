/**
 * ScanAdapter 介面（憲法 §1；E6-F2，上游 §27.3／§31：惡意檔案掃描）。
 * 掃描服務逾時或錯誤一律拋出例外，呼叫端須視同失敗處理（fail closed）——
 * 絕不可將「掃描不可用」當成「未偵測到威脅」而放行，安全優先於可用性（DOR AC-3）。
 */
export interface ScanAdapter {
  /** 回傳 true 表示乾淨；回傳 false 表示偵測到惡意內容 */
  isClean(body: Buffer): Promise<boolean>;
}
