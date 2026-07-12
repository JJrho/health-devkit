import type { NextRequest, NextResponse } from "next/server";
import { SESSION_CONFIG } from "@/modules/auth";

/** session cookie 讀寫（C8：HttpOnly；不做記住我＝一律 7 天滑動，無「永久」選項） */

export function readSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_CONFIG.cookieName)?.value ?? null;
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set(SESSION_CONFIG.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_CONFIG.cookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
