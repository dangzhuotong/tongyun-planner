import { describe, it, expect } from "vitest";
import {
  isSecretConfigKey,
  sanitizeConfigForSync,
  withLocalSecrets,
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

  describe("isSecretConfigKey", () => {
    it("identifies secret keys correctly (positives)", () => {
      expect(isSecretConfigKey("aiApiKey")).toBe(true);
      expect(isSecretConfigKey("providerApiKeys")).toBe(true);
      expect(isSecretConfigKey("smtpPass")).toBe(true);
      expect(isSecretConfigKey("githubToken")).toBe(true);
      expect(isSecretConfigKey("smtp_password")).toBe(true);
      expect(isSecretConfigKey("access_token")).toBe(true);
      expect(isSecretConfigKey("refreshToken")).toBe(true);
      expect(isSecretConfigKey("someServiceApiKey")).toBe(true);
      expect(isSecretConfigKey("client_secret")).toBe(true);
      expect(isSecretConfigKey("sharedSecrets")).toBe(true);
      expect(isSecretConfigKey("db-passwd")).toBe(true);
      expect(isSecretConfigKey("my_custom_api_key")).toBe(true);
      expect(isSecretConfigKey("user_token")).toBe(true);
    });

    it("rejects non-secret keys correctly (negatives)", () => {
      expect(isSecretConfigKey("aiMaxTokens")).toBe(false);
      expect(isSecretConfigKey("darkMode")).toBe(false);
      expect(isSecretConfigKey("syncInterval")).toBe(false);
      expect(isSecretConfigKey("locale")).toBe(false);
      expect(isSecretConfigKey("weatherCity")).toBe(false);
      expect(isSecretConfigKey("cardBackground")).toBe(false);
      expect(isSecretConfigKey("tokenExpiry")).toBe(false);
      expect(isSecretConfigKey("passwordPrompt")).toBe(false);
      expect(isSecretConfigKey("")).toBe(false);
    });
  });

  describe("sanitizeConfigForSync (extended)", () => {
    it("removes unknown future secret fields like someServiceApiKey", () => {
      const configWithFutureSecrets = {
        darkMode: "dark",
        syncInterval: 60,
        aiEndpoint: "https://api.example.com",
        aiMaxTokens: 4096,
        someServiceApiKey: "secret-key-12345",
        githubToken: "ghp_abcdef123456",
        smtp_password: "super_secret_smtp",
      };

      const sanitized = sanitizeConfigForSync(configWithFutureSecrets as unknown as CustomizationConfig) as any;

      expect(sanitized.darkMode).toBe("dark");
      expect(sanitized.syncInterval).toBe(60);
      expect(sanitized.aiEndpoint).toBe("https://api.example.com");
      expect(sanitized.aiMaxTokens).toBe(4096);
      expect(sanitized.someServiceApiKey).toBeUndefined();
      expect(sanitized.githubToken).toBeUndefined();
      expect(sanitized.smtp_password).toBeUndefined();
    });

    it("handles undefined safely as passthrough", () => {
      expect(sanitizeConfigForSync(undefined)).toBeUndefined();
    });
  });

  describe("withLocalSecrets", () => {
    it("keeps local keys and drops remote-supplied keys", () => {
      const remoteConfig = {
        darkMode: "dark",
        syncInterval: 60,
        aiApiKey: "remote-stolen-key",
        providerApiKeys: { openai: "remote-openai" },
        someServiceApiKey: "remote-some-key",
        githubToken: "remote-gh-token",
        aiMaxTokens: 2048,
      };

      const localConfig = {
        darkMode: "light",
        aiApiKey: "local-private-key",
        providerApiKeys: { openai: "local-openai", deepseek: "local-deepseek" },
        someServiceApiKey: "local-some-key",
        githubToken: "local-gh-token",
      };

      const merged = withLocalSecrets(remoteConfig, localConfig) as any;

      // Remote non-secret fields are accepted
      expect(merged.darkMode).toBe("dark");
      expect(merged.syncInterval).toBe(60);
      expect(merged.aiMaxTokens).toBe(2048);

      // Local secret keys are preserved
      expect(merged.aiApiKey).toBe("local-private-key");
      expect(merged.providerApiKeys).toEqual({ openai: "local-openai", deepseek: "local-deepseek" });
      expect(merged.someServiceApiKey).toBe("local-some-key");
      expect(merged.githubToken).toBe("local-gh-token");
    });

    it("drops remote-supplied secret keys when local has none and falls back to valid defaults", () => {
      const remoteConfig = {
        darkMode: "dark",
        aiApiKey: "remote-injected-key",
        providerApiKeys: { openai: "remote-injected-provider" },
        someServiceApiKey: "remote-custom-secret",
        smtp_password: "remote-password",
      };

      const mergedWithNull = withLocalSecrets(remoteConfig, null) as any;
      expect(mergedWithNull.darkMode).toBe("dark");
      expect(mergedWithNull.aiApiKey).toBe("");
      expect(mergedWithNull.providerApiKeys).toEqual({});
      expect(mergedWithNull.someServiceApiKey).toBeUndefined();
      expect(mergedWithNull.smtp_password).toBeUndefined();

      const mergedWithEmpty = withLocalSecrets(remoteConfig, {}) as any;
      expect(mergedWithEmpty.darkMode).toBe("dark");
      expect(mergedWithEmpty.aiApiKey).toBe("");
      expect(mergedWithEmpty.providerApiKeys).toEqual({});
      expect(mergedWithEmpty.someServiceApiKey).toBeUndefined();
      expect(mergedWithEmpty.smtp_password).toBeUndefined();
    });
  });
});
