/**
 * 同步拉取写回 React 状态时，抑制「脏标记 / 版本 bump」，
 * 避免 apply → markDirty → 空包或重复 push 的循环。
 */
let depth = 0;

export function beginSyncApply(): void {
  depth += 1;
}

export function endSyncApply(): void {
  // 延后到本轮 React effect 跑完再清，保证脏检测能看到 guard
  setTimeout(() => {
    depth = Math.max(0, depth - 1);
  }, 0);
}

export function isSyncApplying(): boolean {
  return depth > 0;
}
