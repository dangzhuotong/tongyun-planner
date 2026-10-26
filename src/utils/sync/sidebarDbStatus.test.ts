import { describe, expect, it } from "vitest";
import { sidebarStatusFromSync } from "./sidebarDbStatus";

describe("sidebar follows the database, not WebDAV", () => {
  it("keeps a success state when WebDAV backup fails, conflicts, or is offline", () => {
    for (const status of ["error", "conflict", "offline", "syncing", "idle", "success"] as const) {
      expect(sidebarStatusFromSync({ backend: "webdav", status })).toBe("synced");
    }
  });

  it("stays synced when no remote database is selected", () => {
    expect(sidebarStatusFromSync({ backend: "none", status: "error" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "none", status: "idle" })).toBe("synced");
  });

  it("shows syncing or error only for a real personal-database sync", () => {
    expect(sidebarStatusFromSync({ backend: "database", status: "idle" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "database", status: "success" })).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "database", status: "syncing" })).toBe("syncing");
    expect(sidebarStatusFromSync({ backend: "database", status: "error" })).toBe("error");
    expect(sidebarStatusFromSync({ backend: "database", status: "offline" })).toBe("error");
    expect(sidebarStatusFromSync({ backend: "database", status: "conflict" })).toBe("error");
  });

  it("turns red on a company-database read failure, and stays quiet before that read", () => {
    expect(
      sidebarStatusFromSync({ backend: "webdav", status: "error", companyRead: "unknown" }),
    ).toBe("synced");
    expect(sidebarStatusFromSync({ backend: "webdav", status: "success", companyRead: "ok" })).toBe(
      "synced",
    );
    expect(sidebarStatusFromSync({ backend: "none", status: "idle", companyRead: "failed" })).toBe(
      "error",
    );
    expect(
      sidebarStatusFromSync({ backend: "database", status: "syncing", companyRead: "failed" }),
    ).toBe("error");
  });
});
