import type { CompanyReadState } from "./companyDbRead";
import type { SyncStatus } from "./engine";
import type { SyncBackendType } from "./types";

export type SidebarDbStatus = "synced" | "syncing" | "error";

/**
 * 侧栏主状态跟数据库：已启用的个人远端库，以及配了公司库之后的读库结果。
 * WebDAV / 坚果云备份失败留在设置页，不把侧栏打成日常错误。
 * 没在走远端库、公司库也还没读失败时保持「已同步」。
 * 公司库派活写失败不进这里，只在 Agent 面板红字。
 */
export function sidebarStatusFromSync(input: {
  backend: SyncBackendType;
  status: SyncStatus;
  companyRead?: CompanyReadState;
}): SidebarDbStatus {
  if (input.companyRead === "failed") return "error";
  if (input.backend !== "database") return "synced";
  if (input.status === "syncing") return "syncing";
  if (input.status === "error" || input.status === "offline" || input.status === "conflict") {
    return "error";
  }
  return "synced";
}
