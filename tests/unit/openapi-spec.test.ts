import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * AC-6：OpenAPI 規格檔格式驗證——3.1、必要區塊、涵蓋 /api/health。
 */
describe("OpenAPI 3.1 規格檔", () => {
  const spec = JSON.parse(
    readFileSync(join(process.cwd(), "openapi", "openapi.json"), "utf8"),
  );

  it("版本為 3.1.x 且必要區塊齊備", () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.info?.title).toBeTruthy();
    expect(spec.info?.version).toBeTruthy();
    expect(spec.paths).toBeTruthy();
  });

  it("涵蓋 /api/health 且回應 schema 含 request_id", () => {
    const health = spec.paths["/api/health"]?.get;
    expect(health).toBeTruthy();
    const schema =
      health.responses["200"].content["application/json"].schema;
    expect(schema.required).toContain("request_id");
  });

  it("定義統一 ErrorEnvelope（error.code/message＋request_id）", () => {
    const envelope = spec.components?.schemas?.ErrorEnvelope;
    expect(envelope?.required).toEqual(["error", "request_id"]);
    expect(envelope?.properties?.error?.required).toEqual(["code", "message"]);
  });
});
