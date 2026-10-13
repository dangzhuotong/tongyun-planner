import { beforeEach, describe, expect, it } from "vitest";
import type { CustomizationConfig } from "../../../types";
import { sanitizeConfigForSync } from "../types";
import {
  SYNC_SECRET_KDF_ITERATIONS,
  decryptSecretFields,
  encryptSecretFields,
  importDecryptedSecrets,
  prepareConfigForUpload,
} from "../secretSync";
import {
  SYNC_SECRETS_DECRYPT_FAILED_KEY,
  SYNC_SECRETS_ENABLED_KEY,
  SYNC_SECRETS_PASSPHRASE_KEY,
  hasSyncSecretsDecryptFailed,
  secretSyncDecryptWarning,
  setSyncSecretsOptIn,
  writeSyncSecretsPassphrase,
} from "../syncSecretsPref";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const FAST = 1_000;

describe("opt-in encrypted secret sync", () => {
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage =
      new LocalStorageMock() as unknown as Storage;
  });

  it("keeps the default off and uploads no plaintext secrets", async () => {
    const uploaded = await prepareConfigForUpload({
      darkMode: "dark",
      aiApiKey: "sk-secret-token",
      providerApiKeys: { openai: "sk-openai" },
      syncSecrets: false,
    } as unknown as CustomizationConfig);

    const json = JSON.stringify(uploaded);
    expect(json).not.toContain("sk-secret-token");
    expect(json).not.toContain("sk-openai");
    expect(uploaded?.encryptedSecrets).toBeUndefined();
    expect(uploaded?.aiApiKey).toBeUndefined();
    expect(uploaded?.syncSecrets).toBeUndefined();
  });

  it("encrypts secrets with the device passphrase and leaves the passphrase and WebDAV password behind", async () => {
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase("correct horse battery");
    localStorage.setItem("tongyun_webdav_pass", "webdav-app-password");
    localStorage.setItem(
      "tongyun_email_config",
      JSON.stringify({ smtpUser: "a@b.c", smtpPass: "smtp-auth-code" }),
    );

    const uploaded = await prepareConfigForUpload(
      {
        darkMode: "dark",
        aiModel: "gpt-4o",
        aiApiKey: "sk-secret-token",
        providerApiKeys: { deepseek: "sk-deepseek" },
        syncSecrets: true,
      } as unknown as CustomizationConfig,
      { iterations: FAST },
    );

    const json = JSON.stringify(uploaded);
    expect(json).not.toContain("sk-secret-token");
    expect(json).not.toContain("sk-deepseek");
    expect(json).not.toContain("smtp-auth-code");
    expect(json).not.toContain("correct horse battery");
    expect(json).not.toContain("webdav-app-password");
    expect(uploaded?.darkMode).toBe("dark");
    expect(uploaded?.syncSecrets).toBe(true);
    expect(localStorage.getItem(SYNC_SECRETS_PASSPHRASE_KEY)).toBe("correct horse battery");
    expect(json).not.toContain(SYNC_SECRETS_PASSPHRASE_KEY);

    const envelope = uploaded?.encryptedSecrets as { kdf: string; iterations: number };
    expect(envelope.kdf).toBe("PBKDF2-SHA256");
    expect(envelope.iterations).toBe(FAST);
    const restored = await decryptSecretFields(uploaded?.encryptedSecrets, "correct horse battery");
    expect(restored.aiApiKey).toBe("sk-secret-token");
    expect(restored.providerApiKeys).toEqual({ deepseek: "sk-deepseek" });
    expect(restored.smtpPass).toBe("smtp-auth-code");
    expect(JSON.stringify(restored)).not.toContain("webdav-app-password");
    await expect(decryptSecretFields(uploaded?.encryptedSecrets, "wrong")).rejects.toThrow();
  });

  it("does not replace a remote envelope when this device has no secrets to publish", async () => {
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase("correct horse battery");
    const remoteEnvelope = await encryptSecretFields(
      { aiApiKey: "sk-from-other-device" },
      "correct horse battery",
      FAST,
    );
    const uploaded = await prepareConfigForUpload(
      { darkMode: "light", syncSecrets: true, aiApiKey: "" } as unknown as CustomizationConfig,
      {
        secretSource: {
          darkMode: "light",
          syncSecrets: true,
          aiApiKey: "",
        } as unknown as CustomizationConfig,
        remoteEnvelope,
        iterations: FAST,
      },
    );
    expect(uploaded?.encryptedSecrets).toEqual(remoteEnvelope);
    expect(JSON.stringify(uploaded)).not.toContain("sk-from-other-device");
  });

  it("fills empty local keys from the envelope and refuses to overwrite a key already set here", async () => {
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase("correct horse battery");
    const envelope = await encryptSecretFields(
      {
        aiApiKey: "sk-from-cloud",
        providerApiKeys: { openai: "sk-cloud-openai" },
        smtpPass: "smtp-from-cloud",
      },
      "correct horse battery",
      FAST,
    );
    localStorage.setItem(
      "aero_customization_config",
      JSON.stringify({ darkMode: "dark", aiApiKey: "", providerApiKeys: {} }),
    );
    localStorage.setItem(
      "tongyun_email_config",
      JSON.stringify({ smtpUser: "a@b.c", smtpPass: "" }),
    );

    const imported = await importDecryptedSecrets(
      { darkMode: "dark", encryptedSecrets: envelope },
      { darkMode: "dark", aiApiKey: "", providerApiKeys: {}, syncSecrets: true },
    );
    expect(imported).toBe(true);
    const stored = JSON.parse(localStorage.getItem("aero_customization_config") || "{}");
    expect(stored.aiApiKey).toBe("sk-from-cloud");
    expect(stored.providerApiKeys).toEqual({ openai: "sk-cloud-openai" });
    expect(JSON.parse(localStorage.getItem("tongyun_email_config") || "{}").smtpPass).toBe(
      "smtp-from-cloud",
    );

    localStorage.setItem(
      "aero_customization_config",
      JSON.stringify({ aiApiKey: "sk-already-here", providerApiKeys: { openai: "local" } }),
    );
    await importDecryptedSecrets(
      { encryptedSecrets: envelope },
      {
        aiApiKey: "sk-already-here",
        providerApiKeys: { openai: "local" },
        syncSecrets: true,
      },
    );
    const kept = JSON.parse(localStorage.getItem("aero_customization_config") || "{}");
    expect(kept.aiApiKey).toBe("sk-already-here");
    expect(kept.providerApiKeys).toEqual({ openai: "local" });
  });

  it("does not import secrets when the opt-in flag is off", async () => {
    localStorage.setItem(SYNC_SECRETS_ENABLED_KEY, "0");
    writeSyncSecretsPassphrase("correct horse battery");
    const envelope = await encryptSecretFields(
      { aiApiKey: "sk-from-cloud" },
      "correct horse battery",
      FAST,
    );
    localStorage.setItem("aero_customization_config", JSON.stringify({ aiApiKey: "" }));
    const imported = await importDecryptedSecrets(
      { encryptedSecrets: envelope, syncSecrets: true },
      { aiApiKey: "", syncSecrets: true },
    );
    expect(imported).toBe(false);
    expect(JSON.parse(localStorage.getItem("aero_customization_config") || "{}").aiApiKey).toBe("");
  });

  it("keeps the cloud envelope when decrypt fails, and the next upload does not re-encrypt it", async () => {
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase("wrong-pass");
    const remoteEnvelope = await encryptSecretFields(
      { aiApiKey: "sk-from-device-a", providerApiKeys: { x: "X" } },
      "right-pass",
      FAST,
    );

    const imported = await importDecryptedSecrets(
      { encryptedSecrets: remoteEnvelope },
      { aiApiKey: "sk-only-on-b", syncSecrets: true },
    );
    expect(imported).toBe(false);
    expect(hasSyncSecretsDecryptFailed()).toBe(true);
    expect(localStorage.getItem(SYNC_SECRETS_DECRYPT_FAILED_KEY)).toBe("1");
    expect(secretSyncDecryptWarning("口令与云端不一致")).toBe("口令与云端不一致");

    const uploaded = await prepareConfigForUpload(
      {
        darkMode: "dark",
        syncSecrets: true,
        aiApiKey: "sk-only-on-b",
      } as unknown as CustomizationConfig,
      { remoteEnvelope, iterations: FAST },
    );
    expect(uploaded?.encryptedSecrets).toEqual(remoteEnvelope);
    const stillCloud = await decryptSecretFields(uploaded?.encryptedSecrets, "right-pass");
    expect(stillCloud).toEqual({ aiApiKey: "sk-from-device-a", providerApiKeys: { x: "X" } });
    await expect(decryptSecretFields(uploaded?.encryptedSecrets, "wrong-pass")).rejects.toThrow();
    expect(JSON.stringify(uploaded)).not.toContain("sk-only-on-b");
  });

  it("merges cloud-only secret fields before encrypting a partial local set", async () => {
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase("right-pass");
    const remoteEnvelope = await encryptSecretFields(
      { aiApiKey: "sk-a", providerApiKeys: { x: "X", y: "Y" }, smtpPass: "smtp-cloud" },
      "right-pass",
      FAST,
    );

    const uploaded = await prepareConfigForUpload(
      {
        syncSecrets: true,
        aiApiKey: "sk-b2",
        providerApiKeys: { x: "X2" },
      } as unknown as CustomizationConfig,
      { remoteEnvelope, iterations: FAST },
    );
    const restored = await decryptSecretFields(uploaded?.encryptedSecrets, "right-pass");
    expect(restored.aiApiKey).toBe("sk-b2");
    expect(restored.providerApiKeys).toEqual({ x: "X2", y: "Y" });
    expect(restored.smtpPass).toBe("smtp-cloud");
    expect(uploaded?.encryptedSecrets).not.toEqual(remoteEnvelope);
  });

  it("uses a high PBKDF2 cost in production and strips leftover ciphertext from plain sanitize", () => {
    expect(SYNC_SECRET_KDF_ITERATIONS).toBeGreaterThanOrEqual(210_000);
    const sanitized = sanitizeConfigForSync({
      darkMode: "dark",
      aiApiKey: "sk-secret-token",
      encryptedSecrets: { v: 1, ciphertext: "aabb" },
      syncSecretsPassphrase: "should-not-stick",
    } as unknown as CustomizationConfig) as unknown as Record<string, unknown>;
    expect(sanitized.aiApiKey).toBeUndefined();
    expect(sanitized.encryptedSecrets).toBeUndefined();
    expect(sanitized.syncSecretsPassphrase).toBeUndefined();
    expect(sanitized.darkMode).toBe("dark");
  });
});
