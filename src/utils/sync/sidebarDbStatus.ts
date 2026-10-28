import type { SyncStatus, SyncStatusChannel } from "./engine";
import type { SyncBackendType } from "./types";

export type SidebarDbStatus = "synced" | "syncing" | "error";
export type { SyncStatusChannel };

/**
 * 侧栏主状态只跟个人远端库的写入。
 * 变红只认 backend=database && channel=database && status=error。
 * 没带 channel、channel=none（例如存储还没恢复 DSN 时的「未配置」）、
 * WebDAV / 坚果云、离线、冲突、公司名册读失败、公司库派活写失败，都不占这里。
 */
export function sidebarStatusFromSync(input: {
  backend: SyncBackendType;
  status: SyncStatus;
  channel?: SyncStatusChannel;
}): SidebarDbStatus {
  if (input.backend === "none") return "synced";
  if (input.status === "syncing") return "syncing";
  if (input.status === "error") return "error";
  return "synced";
}
