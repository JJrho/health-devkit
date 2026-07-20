import { getSupabaseBrowserClient } from "@/adapters/supabase-browser-client";

const CONSENT_STORAGE_KEY = "hd_google_consent";

/**
 * 觸發 Google OAuth 導向流程（A122）。`consent` 僅在註冊頁點擊時提供
 * （A125：同意條款勾選只在註冊頁把關），透過 sessionStorage 跨頁面重導傳遞
 * 給 /auth/callback，登入頁呼叫時不傳，callback 會視為未附同意。
 */
export async function startGoogleLogin(consent?: {
  agreeTermsAndDisclaimer: boolean;
  declareAge18: boolean;
}): Promise<void> {
  if (consent) {
    sessionStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } else {
    sessionStorage.removeItem(CONSENT_STORAGE_KEY);
  }
  const supabase = getSupabaseBrowserClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}
