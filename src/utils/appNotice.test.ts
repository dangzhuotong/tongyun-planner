import { describe, it, expect, vi } from "vitest";

const invokeMock = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => invokeMock(command, args),
}));

import { notifyMicroBreak } from "./appNotice";

describe("notifyMicroBreak", () => {
  it("delegates the decision to the Rust window check", async () => {
    invokeMock.mockResolvedValueOnce(true);

    await expect(notifyMicroBreak("微休息", "看一眼远处")).resolves.toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("notify_micro_break", {
      title: "微休息",
      body: "看一眼远处",
    });
  });

  it("falls back to the in-app overlay when the command fails", async () => {
    invokeMock.mockRejectedValueOnce(new Error("ipc unavailable"));

    await expect(notifyMicroBreak("微休息", "看一眼远处")).resolves.toBe(false);
  });
});
