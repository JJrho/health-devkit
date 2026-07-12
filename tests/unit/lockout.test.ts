import { describe, expect, it } from "vitest";
import {
  INITIAL_THROTTLE,
  LOCKOUT_CONFIG,
  isLocked,
  onFailure,
  onSuccess,
} from "@/modules/auth/lockout";

/** C7（AC-5）：15 分鐘內 5 次失敗鎖 15 分鐘、累犯翻倍、成功歸零 */
describe("登入鎖定狀態機（C7）", () => {
  const t0 = new Date("2026-07-12T10:00:00Z");
  const minutes = (n: number) => new Date(t0.getTime() + n * 60 * 1000);

  function failTimes(count: number, start = INITIAL_THROTTLE, at = t0) {
    let state = start;
    for (let i = 0; i < count; i++) state = onFailure(state, at);
    return state;
  }

  it("4 次失敗尚未鎖定", () => {
    const state = failTimes(4);
    expect(isLocked(state, t0)).toBe(false);
    expect(state.failedCount).toBe(4);
  });

  it("第 5 次失敗觸發 15 分鐘鎖定", () => {
    const state = failTimes(5);
    expect(isLocked(state, t0)).toBe(true);
    expect(state.lockedUntil).toEqual(minutes(15));
    expect(state.lockoutLevel).toBe(1);
  });

  it("鎖定期滿自動解鎖", () => {
    const state = failTimes(5);
    expect(isLocked(state, minutes(15.01))).toBe(false);
  });

  it("累犯翻倍：第二輪鎖 30 分鐘", () => {
    const first = failTimes(5); // level 1
    const after = minutes(20); // 第一輪已解鎖
    let second = first;
    for (let i = 0; i < 5; i++) second = onFailure(second, after);
    expect(second.lockedUntil).toEqual(
      new Date(after.getTime() + 2 * LOCKOUT_CONFIG.baseLockMs),
    );
    expect(second.lockoutLevel).toBe(2);
  });

  it("超過 15 分鐘視窗後計數重算", () => {
    const state = failTimes(4);
    const later = onFailure(state, minutes(16)); // 視窗過期 → 重新起算
    expect(later.failedCount).toBe(1);
    expect(isLocked(later, minutes(16))).toBe(false);
  });

  it("成功登入全部歸零（含累犯等級）", () => {
    const locked = failTimes(5);
    const reset = onSuccess(minutes(30));
    expect(reset.failedCount).toBe(0);
    expect(reset.lockoutLevel).toBe(0);
    expect(isLocked(reset, minutes(30))).toBe(false);
    expect(locked.lockoutLevel).toBe(1); // 原狀態不被改動（純函式）
  });
});
