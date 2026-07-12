import { SupabaseAuthAdapter } from "@/adapters/supabase-auth/supabase-auth-adapter";
import { requireEnv } from "@/lib/env";
import { AuthService } from "./service";

/**
 * auth 模組組裝點：正式環境的 AuthService 單例（Supabase adapter）。
 * 測試不經此處——直接以假 adapter 建構 AuthService。
 */
let service: AuthService | undefined;

export function getAuthService(): AuthService {
  if (!service) {
    service = new AuthService(
      new SupabaseAuthAdapter(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_ANON_KEY"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      ),
    );
  }
  return service;
}

export { AuthService, CONSENT_VERSION } from "./service";
export type { RegisterResult, LoginResult } from "./service";
export { SESSION_CONFIG, validateSession } from "./session";
