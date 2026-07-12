/**
 * 登入鎖定狀態機（C7，純函式）：
 * 15 分鐘內失敗 5 次 → 鎖 15 分鐘；累犯鎖定時間翻倍（level 遞增），
 * 成功登入即歸零。皆為設定值。
 */
export const LOCKOUT_CONFIG = {
  windowMs: 15 * 60 * 1000,
  maxFailures: 5,
  baseLockMs: 15 * 60 * 1000,
} as const;

export interface ThrottleState {
  failedCount: number;
  windowStartedAt: Date;
  lockedUntil: Date | null;
  lockoutLevel: number;
}

export const INITIAL_THROTTLE: ThrottleState = {
  failedCount: 0,
  windowStartedAt: new Date(0),
  lockedUntil: null,
  lockoutLevel: 0,
};

/** 目前是否處於鎖定中 */
export function isLocked(state: ThrottleState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil > now;
}

/** 登入失敗後的新狀態 */
export function onFailure(state: ThrottleState, now: Date): ThrottleState {
  const windowExpired =
    now.getTime() - state.windowStartedAt.getTime() > LOCKOUT_CONFIG.windowMs;

  const failedCount = windowExpired ? 1 : state.failedCount + 1;
  const windowStartedAt = windowExpired ? now : state.windowStartedAt;

  if (failedCount >= LOCKOUT_CONFIG.maxFailures) {
    // 觸發鎖定：時間 = base × 2^level（累犯翻倍），計數歸零、等待下一輪
    const lockMs = LOCKOUT_CONFIG.baseLockMs * 2 ** state.lockoutLevel;
    return {
      failedCount: 0,
      windowStartedAt: now,
      lockedUntil: new Date(now.getTime() + lockMs),
      lockoutLevel: state.lockoutLevel + 1,
    };
  }

  return { ...state, failedCount, windowStartedAt };
}

/** 登入成功：全部歸零 */
export function onSuccess(now: Date): ThrottleState {
  return { ...INITIAL_THROTTLE, windowStartedAt: now };
}
