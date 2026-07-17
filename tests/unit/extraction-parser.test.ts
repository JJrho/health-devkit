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
