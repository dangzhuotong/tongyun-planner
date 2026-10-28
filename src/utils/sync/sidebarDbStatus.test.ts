import { describe, expect, it } from "vitest";
import zhCN from "../../i18n/zh-CN";
import { sidebarStatusFromSync } from "./sidebarDbStatus";

describe("sidebar copy", () => {
  it("uses simple sync status strings", () => {
    expect(zhCN.sidebar.syncSynced).toBe("已同步");
    expect(zhCN.sidebar.syncError).toBe("同步失败");
    expect(zhCN.sidebar.syncSyncing).toBe("正在同步…");
  });
});

describe("sidebar follows WebDAV sync status", () => {
  it("reflects syncing and error when WebDAV is active", () => {
    expect(sidebarStatusFromSync({ backend: "webdav", status: "syncing", channel: "webdav" })).toBe(
      "syncing",
    );
    expect(sidebarStatusFromSync({ backend: "webdav", status: "error", channel: "webdav" })).toBe(
      "error",
    );
    expect(sidebarStatusFromSync({ backend: "webdav", status: "success", channel: "webdav" })).toBe(
      "synced",
    );
  });

  it("stays synced when no sync backend is selected", () => {
    expect(sidebarStatusFromSync({ backend: "none", status: "error" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "none", status: "idle" })).toBe("synced");
  });
});
