import { createHash } from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VirusTotalScanAdapter } from "@/adapters/virustotal/virustotal-scan-adapter";

/**
 * VirusTotalScanAdapter 單元測試（E6-F2，A142）：以 mock fetch 驗證請求/回應解析邏輯，
 * 不需要真實 API key。正式站部署驗證會另外用真實 API key 對真實服務驗證（見 SPRINT_LOG）。
 */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("VirusTotalScanAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("命中雜湊快取（GET /files/{hash} 200）時直接用快取結果，不觸發上傳", async () => {
    const body = Buffer.from("clean file content");
    const sha256 = createHash("sha256").update(body).digest("hex");
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(`https://www.virustotal.com/api/v3/files/${sha256}`);
      return jsonResponse(200, {
        data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0 } } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new VirusTotalScanAdapter("fake-key");
    await expect(adapter.isClean(body)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 僅查快取，未觸發上傳
  });

  it("雜湊快取命中且 malicious > 0 時判定為不乾淨", async () => {
    const body = Buffer.from("eicar-like content");
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        data: { attributes: { last_analysis_stats: { malicious: 57, suspicious: 2 } } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new VirusTotalScanAdapter("fake-key");
    await expect(adapter.isClean(body)).resolves.toBe(false);
  });

  it("未命中快取（404）時上傳檔案並輪詢分析結果直到 completed", async () => {
    const body = Buffer.from("brand new file");
    let pollCount = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/files/") && !url.includes("/analyses/")) {
        return jsonResponse(404, { error: { code: "NotFoundError" } });
      }
      if (url.endsWith("/files") && init?.method === "POST") {
        return jsonResponse(200, { data: { id: "analysis-123" } });
      }
      if (url.includes("/analyses/analysis-123")) {
        pollCount += 1;
        if (pollCount < 2) {
          return jsonResponse(200, { data: { attributes: { status: "queued" } } });
        }
        return jsonResponse(200, {
          data: { attributes: { status: "completed", stats: { malicious: 0, suspicious: 0 } } },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const adapter = new VirusTotalScanAdapter("fake-key");
    const resultPromise = adapter.isClean(body);
    // 讓輪詢間隔的 setTimeout 立即觸發，不真的等待
    await vi.runAllTimersAsync();
    await expect(resultPromise).resolves.toBe(true);
    expect(pollCount).toBe(2);

    vi.useRealTimers();
  });

  it("分析結果一直不是 completed（逾時）時拋出例外（fail closed 由呼叫端負責）", async () => {
    const body = Buffer.from("never resolves");
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/files/") && !url.includes("/analyses/")) {
        return jsonResponse(404, { error: { code: "NotFoundError" } });
      }
      if (url.endsWith("/files") && init?.method === "POST") {
        return jsonResponse(200, { data: { id: "analysis-stuck" } });
      }
      return jsonResponse(200, { data: { attributes: { status: "queued" } } });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers();

    const adapter = new VirusTotalScanAdapter("fake-key");
    const resultPromise = adapter.isClean(body);
    resultPromise.catch(() => {}); // 避免 unhandled rejection 警告先行觸發
    await vi.runAllTimersAsync();
    await expect(resultPromise).rejects.toThrow("VirusTotal 分析逾時");

    vi.useRealTimers();
  });

  it("API 回傳非 2xx（如金鑰無效）時拋出例外", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: { code: "WrongCredentialsError" } }));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new VirusTotalScanAdapter("invalid-key");
    await expect(adapter.isClean(Buffer.from("x"))).rejects.toThrow();
  });
});
