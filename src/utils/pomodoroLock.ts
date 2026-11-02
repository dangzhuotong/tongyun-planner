/**
 * 跨窗口倒计时结束认领锁：
 * 保证同一轮倒计时（专注或休息）在多 Webview 窗口（主窗口、悬浮挂件）并存时，
 * 无论哪个窗口先倒数至零，都能且仅能执行一次结束结算、播放音效、发送通知与写入记录。
 * 悬浮窗单独在前台时无需打开主窗口即可自然结束，主窗口与悬浮窗同开时绝不重复触发。
 */
export function claimPomodoroCompletion(
  endTime: number | null | undefined,
  isBreak: boolean,
): boolean {
  if (!endTime || typeof localStorage === "undefined") return true;
  const key = `tongyun_pomo_done_${endTime}_${isBreak ? "break" : "focus"}`;
  try {
    const existing = localStorage.getItem(key);
    if (existing) {
      return false;
    }
    localStorage.setItem(key, String(Date.now()));

    cleanOldPomodoroCompletionLocks();
    return true;
  } catch {
    return true;
  }
}

export function cleanOldPomodoroCompletionLocks(maxAgeMs: number = 3600 * 1000): void {
  if (typeof localStorage === "undefined") return;
  try {
    const now = Date.now();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("tongyun_pomo_done_")) {
        const val = localStorage.getItem(k);
        const claimedAt = val ? parseInt(val, 10) : NaN;
        const parts = k.split("_");
        const endTs = parseInt(parts[3] || "", 10);
        const lockTime = Number.isFinite(claimedAt) ? claimedAt : endTs;
        if (Number.isFinite(lockTime) && now - lockTime > maxAgeMs) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {
    /* ignore */
  }
}
