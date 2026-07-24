import { createHash } from "crypto";
import type { ScanAdapter } from "../scan-adapter";

/**
 * ScanAdapter 的 VirusTotal 實作（A142：免費 API，不自架 ClamAV 等服務）。
 * 先以 SHA256 查快取（`GET /files/{hash}`）——EICAR 等已被廣泛掃過的樣本
 * 幾乎必中快取，不需等待完整分析；未命中才上傳觸發新分析並輪詢結果。
 */
const API_BASE = "https://www.virustotal.com/api/v3";
const POLL_INTERVAL_MS = 3000;
/**
 * 約 105 秒輪詢預算。實測發現（Sprint 24 P0 e2e）：從未被掃過的全新檔案
 * 走上傳＋輪詢路徑時，VirusTotal 完整跑完 70+ 引擎常態耗時可達 40～60 秒以上
 * （已掃過的檔案／EICAR 等常見樣本因命中雜湊快取則是毫秒等級），原訂 30 秒
 * 預算太緊，實測會讓合法全新檔案也被 fail closed 誤判為 FILE_SCAN_FAILED。
 */
const POLL_MAX_ATTEMPTS = 35;

interface VtStats {
  malicious: number;
  suspicious: number;
}

export class VirusTotalScanAdapter implements ScanAdapter {
  constructor(private readonly apiKey: string) {}

  async isClean(body: Buffer): Promise<boolean> {
    const sha256 = createHash("sha256").update(body).digest("hex");

    const cached = await this.lookupByHash(sha256);
    const stats = cached ?? (await this.pollAnalysis(await this.uploadFile(body)));
    return stats.malicious === 0 && stats.suspicious === 0;
  }

  private async lookupByHash(sha256: string): Promise<VtStats | null> {
    const res = await fetch(`${API_BASE}/files/${sha256}`, {
      headers: { "x-apikey": this.apiKey },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`VirusTotal 查詢快取失敗：${res.status}`);
    const data = (await res.json()) as {
      data: { attributes: { last_analysis_stats: VtStats } };
    };
    return data.data.attributes.last_analysis_stats;
  }

  private async uploadFile(body: Buffer): Promise<string> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(body)]), "upload");
    const res = await fetch(`${API_BASE}/files`, {
      method: "POST",
      headers: { "x-apikey": this.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error(`VirusTotal 上傳失敗：${res.status}`);
    const data = (await res.json()) as { data: { id: string } };
    return data.data.id;
  }

  private async pollAnalysis(analysisId: string): Promise<VtStats> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      const res = await fetch(`${API_BASE}/analyses/${analysisId}`, {
        headers: { "x-apikey": this.apiKey },
      });
      if (!res.ok) throw new Error(`VirusTotal 查詢分析結果失敗：${res.status}`);
      const data = (await res.json()) as {
        data: { attributes: { status: string; stats: VtStats } };
      };
      if (data.data.attributes.status === "completed") return data.data.attributes.stats;
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error("VirusTotal 分析逾時");
  }
}
