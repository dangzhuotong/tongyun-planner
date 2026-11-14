import type { SyncCategory } from "./types";

/**
 * 同步拉取写回 React 状态时，抑制「脏标记 / 版本 bump」，
 * 避免 apply → markDirty → 空包或重复 push 的循环。
 */
let depth = 0;

export function beginSyncApply(): void {
  depth += 1;
}

export function endSyncApply(): void {
  // React 在 promise / 原生事件里的 effect 可能排在第一个 setTimeout(0) 之后。
  // 多等一轮，避免同步回写被当成用户修改，马上再标脏再同步。
  setTimeout(() => {
    setTimeout(() => {
      depth = Math.max(0, depth - 1);
    }, 0);
  }, 0);
}

export function isSyncApplying(): boolean {
  return depth > 0;
}

const replacements = new Set<SyncCategory>();

export function requestCategoryReplace(...categories: SyncCategory[]): void {
  for (const category of categories) replacements.add(category);
}

export function consumeCategoryReplace(): Set<SyncCategory> {
  const pending = new Set(replacements);
  replacements.clear();
  return pending;
}
