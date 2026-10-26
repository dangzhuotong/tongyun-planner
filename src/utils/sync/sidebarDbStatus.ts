import type { SyncStatus, SyncStatusChannel } from "./engine";
import type { SyncBackendType } from "./types";

export type SidebarDbStatus = "synced" | "syncing" | "error";
export type { SyncStatusChannel };

/**
 * 侧栏主状态只跟个人远端库的写入。
 * 默认「已同步」。只有这次数据库写入失败才变红。
 * WebDAV / 坚果云自动备份、离线、冲突，以及公司名册读失败，都不占这里。
 * 公司库派活写失败只在 Agent 面板红字。
 */
export function sidebarStatusFromSync(input: {
  backend: SyncBackendType;
  status: SyncStatus;
  channel?: SyncStatusChannel;
}): SidebarDbStatus {
  if (input.channel === "webdav") return "synced";
  if (input.backend !== "database") return "synced";
  if (input.channel && input.channel !== "database") return "synced";
  if (input.status === "syncing") return "syncing";
  if (input.status === "error") return "error";
  return "synced";
}
