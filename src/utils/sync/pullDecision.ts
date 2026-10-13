/** Whether a category file should be downloaded. `force` re-reads config for encrypted secrets. */
export function shouldPullCategory(localVer: number, remoteVer: number, force: boolean): boolean {
  if (!(remoteVer > 0)) return false;
  if (force) return true;
  return localVer < remoteVer;
}

/**
 * Keep a newer local version when a forced pull only exists to import secrets.
 * Rolling the version backward would make the following upload look unchanged.
 */
export function categoryVersionAfterPull(
  localVer: number,
  remoteVer: number,
  force: boolean,
): number {
  if (force && localVer >= remoteVer) return localVer;
  return remoteVer;
}
