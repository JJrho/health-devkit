import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * 憲法 §1：外部服務（Auth/Storage/OCR/Queue/LLM）一律經 Adapter 介面存取；
 * adapter 實作層與 db 基座以外，禁止直接 import vendor SDK／驅動。
 * AC-6 由此規則把關。
 */
const vendorRestrictedPatterns = [
  { group: ["pg", "pg/*"], message: "資料庫驅動僅限 src/db 與 src/adapters 內使用（憲法 §1）" },
  { group: ["@supabase/*"], message: "Supabase SDK 僅限 adapter 層使用（憲法 §1）" },
  { group: ["openai", "openai/*", "@anthropic-ai/*"], message: "LLM SDK 僅限 adapter 層使用（憲法 §1）" },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: ["node_modules/**", ".next/**", "drizzle/**", "playwright-report/**", "test-results/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    ignores: ["src/adapters/**", "src/db/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: vendorRestrictedPatterns }],
    },
  },
];

export default eslintConfig;
