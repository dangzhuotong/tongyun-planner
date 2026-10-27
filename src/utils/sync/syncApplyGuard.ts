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

/** WebDAV 整包和手动恢复要按分类覆盖本地行。远端库拉回已经按行写过，不要再对账删除。 */
let categoryReplace = false;

export function requestCategoryReplace(): void {
  categoryReplace = true;
}

export function consumeCategoryReplace(): boolean {
  const pending = categoryReplace;
  categoryReplace = false;
  return pending;
}
