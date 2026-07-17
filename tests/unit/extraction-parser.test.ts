import { describe, expect, it } from "vitest";
import { extractCandidatesFromPage, groupTextIntoLines, parseLabLine } from "@/modules/extraction";

describe("extraction parser（E2-F2 PoC 啟發式，A23）", () => {
  it("groupTextIntoLines：依 y 座標分組，同列依 x 排序拼字", () => {
    const lines = groupTextIntoLines([
      { str: "6.2", x: 100, y: 700, width: 20, height: 12 },
      { str: "WBC", x: 50, y: 700, width: 30, height: 12 },
      { str: "Glucose", x: 50, y: 650, width: 50, height: 12 },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("WBC 6.2");
    expect(lines[1]!.text).toBe("Glucose");
  });

  it("groupTextIntoLines：y 座標在容許誤差內視為同一列", () => {
    const lines = groupTextIntoLines([
      { str: "A", x: 10, y: 700, width: 10, height: 12 },
      { str: "B", x: 30, y: 701.5, width: 10, height: 12 }, // 誤差 1.5 < 容許值 3
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe("A B");
  });

  it("parseLabLine：四段皆清楚匹配 → 高信心值（>=0.85，C14）", () => {
    const result = parseLabLine("WBC 6.2 10^3/uL 4.0-10.0");
    expect(result).toMatchObject({
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      rawReferenceRange: "4.0-10.0",
    });
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("parseLabLine：帶比較符號的參考區間（<200）也能匹配", () => {
    const result = parseLabLine("Cholesterol 210 mg/dL <200");
    expect(result).toMatchObject({ rawUnit: "mg/dL", rawReferenceRange: "<200" });
    expect(result!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("parseLabLine：缺單位與參考區間 → 低信心值（<0.85）", () => {
    const result = parseLabLine("Vitamin D 32");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThan(0.85);
  });

  it("parseLabLine：無數值的一般文字（如標題）回 null，不算候選列", () => {
    expect(parseLabLine("Health Check Report")).toBeNull();
    expect(parseLabLine("2026-07-16")).toBeNull(); // 純數字開頭沒有名稱
  });

  it("parseLabLine（Sprint 8）：pdfjs 因間距過近黏合的殘留字串不猜測切法，維持無法辨識", () => {
    // 對應真實案例（KB-023 記錄）：參考區間與單位因欄位間距 <1.5pt 被 pdfjs
    // 黏合成單一字串且無分隔字元，如 "14290~135mmHg"（"142" 誤黏 "90~135mmHg"）
    const result = parseLabLine("BloodPressure 128 14290~135mmHg");
    expect(result).not.toBeNull();
    expect(result!.rawTestName).toBe("BloodPressure");
    expect(result!.rawValue).toBe("128"); // 數值本身有正常間距，未受影響
    expect(result!.rawUnit).toBeNull(); // 不猜測切法，寧可無法辨識
    expect(result!.rawReferenceRange).toBeNull();
    expect(result!.confidence).toBeLessThan(0.85);
  });

  it("parseLabLine（Sprint 8）：語法上恰好像乾淨區間的黏合殘留物是已知殘留限制（不誇大宣稱完全解決）", () => {
    // "14290-135" 本身語法上就是合法的 RANGE_TOKEN（142 是否為真正下限、90 是否為
    // 真正上限本質上無法從字串本身判斷），純規則驗證無法辨識這種恰好合法的巧合。
    // 記錄於此作為已知殘留限制，非本輪宣稱已解決的案例（AC-6 誠實記錄的一部分）。
    const result = parseLabLine("BloodPressure 128 14290-135");
    expect(result!.rawReferenceRange).toBe("14290-135"); // 已知限制：無法辨識此類巧合
  });

  it("parseLabLine（Sprint 8，A28）：含冒號的頁首／病患中繼資料列不當作候選列", () => {
    // 對應真實案例（SPRINT_LOG 記錄）："何志仁 列印序號 : 50065" 型態曾被誤判為高信心檢驗列
    expect(parseLabLine("列印序號 : 50065")).toBeNull();
    expect(parseLabLine("Patient ID: 12345")).toBeNull();
    expect(parseLabLine("姓名：何志仁 病歷號 67890")).toBeNull();
  });

  it("parseLabLine（Sprint 8）：無單位、只有乾淨參考區間仍可正確辨識", () => {
    const result = parseLabLine("Hemoglobin 14.2 12.0-16.0");
    expect(result).toMatchObject({ rawUnit: null, rawReferenceRange: "12.0-16.0" });
  });

  it("extractCandidatesFromPage（Sprint 8，AC-4）：合成多欄情境——欄位緊鄰黏合 vs. 正常間距", () => {
    // 模擬 pdfjs 對間距 <1.5pt 的合併行為（探測結果：合併為單一 str，無分隔字元）
    const items = [
      { str: "SystolicBP", x: 50, y: 700, width: 70, height: 12 },
      { str: "128", x: 130, y: 700, width: 20, height: 12 }, // 與名稱間距充足
      { str: "14290~135mmHg", x: 155, y: 700, width: 90, height: 12 }, // 黏合殘留（已合併字串直接作為單一 item）
      { str: "Cholesterol", x: 50, y: 650, width: 60, height: 12 },
      { str: "180", x: 120, y: 650, width: 20, height: 12 },
      { str: "mg/dL", x: 150, y: 650, width: 35, height: 12 }, // 正常間距，乾淨單位
      { str: "<200", x: 195, y: 650, width: 30, height: 12 }, // 正常間距，乾淨區間
    ];
    const candidates = extractCandidatesFromPage(items);
    expect(candidates).toHaveLength(2);

    const bp = candidates.find((c) => c.rawTestName === "SystolicBP");
    expect(bp).toMatchObject({ rawValue: "128", rawUnit: null, rawReferenceRange: null });
    expect(bp!.confidence).toBeLessThan(0.85);

    const chol = candidates.find((c) => c.rawTestName === "Cholesterol");
    expect(chol).toMatchObject({ rawValue: "180", rawUnit: "mg/dL", rawReferenceRange: "<200" });
    expect(chol!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("extractCandidatesFromPage（Sprint 8，AC-4／A28）：頁首中繼資料列不混入候選列", () => {
    const items = [
      { str: "何志仁", x: 50, y: 780, width: 40, height: 12 },
      { str: "列印序號", x: 100, y: 780, width: 50, height: 12 },
      { str: ":", x: 155, y: 780, width: 5, height: 12 },
      { str: "50065", x: 165, y: 780, width: 30, height: 12 },
      { str: "WBC", x: 50, y: 700, width: 30, height: 12 },
      { str: "6.2", x: 85, y: 700, width: 20, height: 12 },
      { str: "10^3/uL", x: 110, y: 700, width: 45, height: 12 },
      { str: "4.0-10.0", x: 160, y: 700, width: 50, height: 12 },
    ];
    const candidates = extractCandidatesFromPage(items);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.rawTestName).toBe("WBC");
  });

  it("extractCandidatesFromPage：整頁多列，過濾出真正的檢驗數據列", () => {
    const items = [
      { str: "Health", x: 50, y: 800, width: 40, height: 12 },
      { str: "Check", x: 95, y: 800, width: 35, height: 12 },
      { str: "Report", x: 135, y: 800, width: 40, height: 12 },
      { str: "WBC", x: 50, y: 750, width: 30, height: 12 },
      { str: "6.2", x: 85, y: 750, width: 20, height: 12 },
      { str: "10^3/uL", x: 110, y: 750, width: 45, height: 12 },
      { str: "4.0-10.0", x: 160, y: 750, width: 50, height: 12 },
    ];
    const candidates = extractCandidatesFromPage(items);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.rawTestName).toBe("WBC");
    expect(candidates[0]!.coordinates.y).toBe(750);
  });
});
