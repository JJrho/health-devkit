import type { AuthAdapter } from "@/adapters";
import { SupabaseAuthAdapter } from "@/adapters/supabase-auth/supabase-auth-adapter";
import { requireEnv } from "@/lib/env";
import { AuthService } from "./service";

/**
 * auth 模組組裝點：正式環境的 AuthService 單例（Supabase adapter）。
 * 測試不經此處——直接以假 adapter 建構 AuthService。
 */
let service: AuthService | undefined;
let adapter: AuthAdapter | undefined;

function buildAdapter(): AuthAdapter {
  return new SupabaseAuthAdapter(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

export function getAuthService(): AuthService {
  if (!service) {
    service = new AuthService(buildAdapter());
  }
  return service;
}

/** E6-F1：帳號永久刪除鏈需要 `deleteUser()`，不經 AuthService 包裝直接取用 adapter */
export function getAuthAdapter(): AuthAdapter {
  if (!adapter) {
    adapter = buildAdapter();
  }
  return adapter;
}

export { AuthService, CONSENT_VERSION } from "./service";
export type { RegisterResult, LoginResult, GoogleLoginResult } from "./service";
export { SESSION_CONFIG, validateSession } from "./session";
