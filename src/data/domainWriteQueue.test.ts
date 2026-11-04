import type Database from "@tauri-apps/plugin-sql";
import { afterEach, expect, it, vi } from "vitest";
import { queueDomainWrite, setDatabaseOverrideForTesting } from "./domainDatabase";

afterEach(() => setDatabaseOverrideForTesting(null));

it("reports a failed write but executes already queued and subsequent writes in order", async () => {
  const calls: string[] = [];
  setDatabaseOverrideForTesting({} as Database);
  const first = queueDomainWrite(async () => {
    calls.push("failed");
    throw new Error("SQLITE_BUSY");
  });
  const second = queueDomainWrite(async () => {
    calls.push("second");
  });
  await expect(first).rejects.toThrow("SQLITE_BUSY");
  await expect(second).resolves.toBeUndefined();
  await queueDomainWrite(async () => {
    calls.push("third");
  });
  expect(calls).toEqual(["failed", "second", "third"]);
});

it("does not overlap writes while waiting for a slow first write", async () => {
  setDatabaseOverrideForTesting({} as Database);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const later = vi.fn();
  const first = queueDomainWrite(async () => gate);
  const second = queueDomainWrite(async () => {
    later();
  });
  await Promise.resolve();
  expect(later).not.toHaveBeenCalled();
  release();
  await Promise.all([first, second]);
  expect(later).toHaveBeenCalledOnce();
});
