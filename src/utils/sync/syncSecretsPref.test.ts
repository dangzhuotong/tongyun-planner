import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readSyncSecretsPassphrase,
  writeSyncSecretsPassphrase,
  setSyncSecretsOptIn,
  isSyncSecretsOptIn,
  peekForceConfigPull,
  clearForceConfigPull,
  markSyncSecretsDecryptFailed,
  clearSyncSecretsDecryptFailed,
  hasSyncSecretsDecryptFailed,
  secretSyncDecryptWarning,
  SYNC_SECRETS_PASSPHRASE_KEY,
  SYNC_SECRETS_ENABLED_KEY,
  FORCE_CONFIG_PULL_KEY,
  SYNC_SECRETS_DECRYPT_FAILED_KEY,
} from "./syncSecretsPref";

describe("syncSecretsPref utils", () => {
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

  describe("passphrase read & write", () => {
    it("should return empty string when no passphrase set", () => {
      expect(readSyncSecretsPassphrase()).toBe("");
    });

    it("should store and retrieve passphrase", () => {
      writeSyncSecretsPassphrase("my-secure-passphrase");
      expect(readSyncSecretsPassphrase()).toBe("my-secure-passphrase");
      expect(mockStore[SYNC_SECRETS_PASSPHRASE_KEY]).toBe("my-secure-passphrase");
    });

    it("should remove passphrase when written with empty string", () => {
      writeSyncSecretsPassphrase("initial");
      writeSyncSecretsPassphrase("");
      expect(readSyncSecretsPassphrase()).toBe("");
      expect(mockStore[SYNC_SECRETS_PASSPHRASE_KEY]).toBeUndefined();
    });
  });

  describe("sync secrets opt-in", () => {
    it("should set opt-in flag and mark force pull when enabled", () => {
      setSyncSecretsOptIn(true);
      expect(mockStore[SYNC_SECRETS_ENABLED_KEY]).toBe("1");
      expect(mockStore[FORCE_CONFIG_PULL_KEY]).toBe("1");
      expect(isSyncSecretsOptIn()).toBe(true);

      setSyncSecretsOptIn(false);
      expect(mockStore[SYNC_SECRETS_ENABLED_KEY]).toBe("0");
      expect(isSyncSecretsOptIn()).toBe(false);
    });

    it("should fall back to localConfig.syncSecrets when localStorage flag is unset", () => {
      delete mockStore[SYNC_SECRETS_ENABLED_KEY];
      expect(isSyncSecretsOptIn({ syncSecrets: true })).toBe(true);
      expect(isSyncSecretsOptIn({ syncSecrets: false })).toBe(false);
      expect(isSyncSecretsOptIn(null)).toBe(false);
    });
  });

  describe("force config pull", () => {
    it("should check and clear force config pull", () => {
      expect(peekForceConfigPull()).toBe(false);
      mockStore[FORCE_CONFIG_PULL_KEY] = "1";
      expect(peekForceConfigPull()).toBe(true);
      clearForceConfigPull();
      expect(peekForceConfigPull()).toBe(false);
    });
  });

  describe("decrypt failed status", () => {
    it("should handle decrypt failed flag and warning message", () => {
      expect(hasSyncSecretsDecryptFailed()).toBe(false);
      expect(secretSyncDecryptWarning("Passphrase error")).toBeNull();

      markSyncSecretsDecryptFailed();
      expect(hasSyncSecretsDecryptFailed()).toBe(true);
      expect(mockStore[SYNC_SECRETS_DECRYPT_FAILED_KEY]).toBe("1");
      expect(secretSyncDecryptWarning("Passphrase error")).toBe("Passphrase error");

      clearSyncSecretsDecryptFailed();
      expect(hasSyncSecretsDecryptFailed()).toBe(false);
      expect(secretSyncDecryptWarning("Passphrase error")).toBeNull();
    });
  });
});
