import { describe, it, expect } from "vitest";
import {
  sanitizeConfigForSync,
  isEffectivelyEmptyCategory,
  isSampleTasksOnly,
  protectAgainstEmptyOverwrite,
  mergeRemoteIntoLocal,
} from "../types";
import type { CustomizationConfig, Task } from "../../../types";

describe("Sync Security & Sanitization", () => {
  it("sanitizeConfigForSync strips aiApiKey and providerApiKeys while preserving other fields", () => {
    const configWithSecrets: Partial<CustomizationConfig> = {
      darkMode: "dark",
      syncInterval: 30,
      locale: "zh-CN",
      aiProvider: "openai",
      aiModel: "gpt-4o",
      aiApiKey: "sk-secret-token-123456",
      providerApiKeys: {
        openai: "sk-openai-private",
        anthropic: "sk-claude-private",
      },
    };

    const sanitized = sanitizeConfigForSync(configWithSecrets as CustomizationConfig);

    expect(sanitized).toBeDefined();
    expect(sanitized?.darkMode).toBe("dark");
    expect(sanitized?.syncInterval).toBe(30);
    expect(sanitized?.locale).toBe("zh-CN");
    expect(sanitized?.aiProvider).toBe("openai");
    expect(sanitized?.aiModel).toBe("gpt-4o");

    // Keys must NOT exist
    expect(sanitized?.aiApiKey).toBeUndefined();
    expect(sanitized?.providerApiKeys).toBeUndefined();
  });

  it("sanitizeConfigForSync handles null or undefined safely", () => {
    expect(sanitizeConfigForSync(null)).toBeNull();
  });

  it("isEffectivelyEmptyCategory detects empty arrays and empty config objects", () => {
    expect(isEffectivelyEmptyCategory("tasks", [])).toBe(true);
    expect(isEffectivelyEmptyCategory("tasks", [{ id: "t1" } as Task])).toBe(false);
    expect(isEffectivelyEmptyCategory("config", {})).toBe(true);
    expect(isEffectivelyEmptyCategory("config", { darkMode: "dark" })).toBe(false);
  });

  it("isSampleTasksOnly identifies fresh startup sample tasks with numeric ids", () => {
    const sampleTasks = [
      { id: "1", title: "示例 1" },
      { id: "2", title: "示例 2" },
    ] as Task[];
    const realTasks = [
      { id: "k9x2a", title: "真实用户任务" },
    ] as Task[];

    expect(isSampleTasksOnly(sampleTasks)).toBe(true);
    expect(isSampleTasksOnly(realTasks)).toBe(false);
  });

  it("protectAgainstEmptyOverwrite prevents empty local journal from overwriting remote journal", () => {
    const localEmptyJournal: unknown[] = [];
    const remoteJournal = [{ id: "j1", title: "昨天的日记" }];

    // Even if isUserDirty = true, journal must be protected
    const result = protectAgainstEmptyOverwrite("journal", localEmptyJournal, remoteJournal, true);
    expect(result.skip).toBe(true);
  });

  it("mergeRemoteIntoLocal preserves local api keys when remote config arrives", () => {
    const localConfig = {
      darkMode: "light",
      aiApiKey: "my-local-secret-key",
      providerApiKeys: { deepseek: "local-deepseek-key" },
    };

    const remoteConfig = {
      darkMode: "dark",
      syncInterval: 60,
      // remote does not have keys (or empty)
    };

    const merged = mergeRemoteIntoLocal("config", remoteConfig, localConfig) as Record<string, unknown>;

    expect(merged.darkMode).toBe("dark"); // remote value takes precedence for public settings
    expect(merged.syncInterval).toBe(60);
    expect(merged.aiApiKey).toBe("my-local-secret-key"); // local key preserved!
    expect(merged.providerApiKeys).toEqual({ deepseek: "local-deepseek-key" });
  });
});
