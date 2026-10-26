import { describe, expect, it } from "vitest";
import zhCN from "../../i18n/zh-CN";
import { sidebarStatusFromSync } from "./sidebarDbStatus";

describe("sidebar copy", () => {
  it("does not use the legacy WebDAV auto-backup failure sentence", () => {
    expect(zhCN.sidebar.syncSynced).toBe("已同步");
    expect(zhCN.sidebar.syncError).toBe("数据库同步失败");
    expect(zhCN.sidebar.syncError).not.toContain("自动备份");
    expect(zhCN.sidebar.syncSyncing).not.toContain("自动备份");
  });
});

describe("sidebar follows the database, not WebDAV", () => {
  it("keeps a success state when WebDAV backup fails, conflicts, or is offline", () => {
    for (const status of ["error", "conflict", "offline", "syncing", "idle", "success"] as const) {
      expect(sidebarStatusFromSync({ backend: "webdav", status, channel: "webdav" })).toBe(
        "synced",
      );
      expect(sidebarStatusFromSync({ backend: "database", status, channel: "webdav" })).toBe(
        "synced",
      );
    }
  });

  it("stays synced when no remote database is selected", () => {
    expect(sidebarStatusFromSync({ backend: "none", status: "error" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "none", status: "idle" })).toBe("synced");
  });

  it("shows syncing or error only for a real personal-database write", () => {
    expect(sidebarStatusFromSync({ backend: "database", status: "idle" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "database", status: "success" })).toBe("synced");
    expect(
      sidebarStatusFromSync({ backend: "database", status: "offline", channel: "database" }),
    ).toBe("synced");
    expect(
      sidebarStatusFromSync({ backend: "database", status: "conflict", channel: "database" }),
    ).toBe("synced");
    expect(
      sidebarStatusFromSync({ backend: "database", status: "syncing", channel: "database" }),
    ).toBe("syncing");
    expect(
      sidebarStatusFromSync({ backend: "database", status: "error", channel: "database" }),
    ).toBe("error");
  });

  it("does not turn red when the company roster read fails", () => {
    expect(sidebarStatusFromSync({ backend: "none", status: "idle" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "webdav", status: "error", channel: "webdav" })).toBe(
      "synced",
    );
    expect(
      sidebarStatusFromSync({ backend: "database", status: "syncing", channel: "database" }),
    ).toBe("syncing");
  });
});
