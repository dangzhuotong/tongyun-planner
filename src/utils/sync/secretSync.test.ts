import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  collectSecretFields,
  isSecretsEmpty,
  mergeSecretFields,
  SYNC_SECRET_KDF_ITERATIONS,
} from "./secretSync";

describe("secretSync pure helpers", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  it("should define OWASP recommended PBKDF2 iterations constant", () => {
    expect(SYNC_SECRET_KDF_ITERATIONS).toBe(210_000);
  });

  describe("collectSecretFields", () => {
    it("should return empty object when config is null or undefined and no SMTP pass in storage", () => {
      expect(collectSecretFields(null)).toEqual({});
      expect(collectSecretFields(undefined)).toEqual({});
    });

    it("should collect secret fields while ignoring non-secret or empty fields", () => {
      const config = {
        aiModel: "gpt-4o",
        theme: "light",
        aiApiKey: "sk-openai-test-key",
        providerApiKeys: { openai: "sk-openai-key" },
        emptyKey: "",
        encryptedSecrets: "should-be-ignored",
        syncSecretsPassphrase: "local-passphrase-ignored",
      };

      const collected = collectSecretFields(config);
      expect(collected.aiApiKey).toBe("sk-openai-test-key");
      expect(collected.providerApiKeys).toEqual({ openai: "sk-openai-key" });
      expect(collected.aiModel).toBeUndefined();
      expect(collected.theme).toBeUndefined();
      expect(collected.encryptedSecrets).toBeUndefined();
      expect(collected.syncSecretsPassphrase).toBeUndefined();
    });

    it("should read smtpPass from localStorage if missing in config", () => {
      mockStore["tongyun_email_config"] = JSON.stringify({
        smtpPass: "stored-smtp-pass",
      });

      const collected = collectSecretFields({ aiApiKey: "test-key" });
      expect(collected.smtpPass).toBe("stored-smtp-pass");
      expect(collected.aiApiKey).toBe("test-key");
    });
  });

  describe("isSecretsEmpty", () => {
    it("should return true for empty object and false for object with keys", () => {
      expect(isSecretsEmpty({})).toBe(true);
      expect(isSecretsEmpty({ aiApiKey: "key" })).toBe(false);
    });
  });

  describe("mergeSecretFields", () => {
    it("should merge remote and local secrets with local taking precedence", () => {
      const remote = {
        aiApiKey: "remote-key",
        smtpPass: "remote-smtp",
      };
      const local = {
        aiApiKey: "local-key",
      };

      const merged = mergeSecretFields(remote, local);
      expect(merged.aiApiKey).toBe("local-key");
      expect(merged.smtpPass).toBe("remote-smtp");
    });

    it("should recursively merge nested objects like providerApiKeys", () => {
      const remote = {
        providerApiKeys: {
          openai: "remote-openai",
          anthropic: "remote-claude",
        },
      };
      const local = {
        providerApiKeys: {
          openai: "local-openai",
          deepseek: "local-deepseek",
        },
      };

      const merged = mergeSecretFields(remote, local) as {
        providerApiKeys: Record<string, string>;
      };
      expect(merged.providerApiKeys.openai).toBe("local-openai");
      expect(merged.providerApiKeys.anthropic).toBe("remote-claude");
      expect(merged.providerApiKeys.deepseek).toBe("local-deepseek");
    });

    it("should not let empty local values overwrite remote values", () => {
      const remote = {
        aiApiKey: "remote-key",
        smtpPass: "remote-smtp",
      };
      const local = {
        aiApiKey: "",
        smtpPass: "   ",
      };

      const merged = mergeSecretFields(remote, local);
      expect(merged.aiApiKey).toBe("remote-key");
      expect(merged.smtpPass).toBe("remote-smtp");
    });
  });
});
