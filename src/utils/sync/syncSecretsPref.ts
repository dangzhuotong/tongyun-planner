/** Device-local opt-in. Never uploaded by itself; the config flag is mirrored for the UI. */
export const SYNC_SECRETS_ENABLED_KEY = "tongyun_sync_secrets_enabled";
/** Passphrase stays on this device. It is never written into synced config. */
export const SYNC_SECRETS_PASSPHRASE_KEY = "tongyun_sync_secrets_passphrase";
/** Ask the next pull to download config even when the local version is newer. */
export const FORCE_CONFIG_PULL_KEY = "tongyun_force_pull_config";
/**
 * Set when the cloud secret envelope could not be decrypted with this device's passphrase.
 * While set, uploads keep the cloud ciphertext unchanged.
 */
export const SYNC_SECRETS_DECRYPT_FAILED_KEY = "tongyun_sync_secrets_decrypt_failed";

export function readSyncSecretsPassphrase(): string {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(SYNC_SECRETS_PASSPHRASE_KEY) || "";
}

export function writeSyncSecretsPassphrase(value: string): void {
  if (typeof localStorage === "undefined") return;
  if (!value) localStorage.removeItem(SYNC_SECRETS_PASSPHRASE_KEY);
  else localStorage.setItem(SYNC_SECRETS_PASSPHRASE_KEY, value);
}

export function setSyncSecretsOptIn(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SYNC_SECRETS_ENABLED_KEY, enabled ? "1" : "0");
  if (enabled) localStorage.setItem(FORCE_CONFIG_PULL_KEY, "1");
}

export function isSyncSecretsOptIn(localConfig?: unknown): boolean {
  if (typeof localStorage !== "undefined") {
    const flag = localStorage.getItem(SYNC_SECRETS_ENABLED_KEY);
    if (flag === "1") return true;
    if (flag === "0") return false;
  }
  return !!(
    localConfig &&
    typeof localConfig === "object" &&
    (localConfig as { syncSecrets?: boolean }).syncSecrets === true
  );
}

export function peekForceConfigPull(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(FORCE_CONFIG_PULL_KEY) === "1";
}

export function clearForceConfigPull(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(FORCE_CONFIG_PULL_KEY);
}

export function markSyncSecretsDecryptFailed(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SYNC_SECRETS_DECRYPT_FAILED_KEY, "1");
}

export function clearSyncSecretsDecryptFailed(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SYNC_SECRETS_DECRYPT_FAILED_KEY);
}

export function hasSyncSecretsDecryptFailed(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    localStorage.getItem(SYNC_SECRETS_DECRYPT_FAILED_KEY) === "1"
  );
}

/** Settings copy shown while the cloud envelope is being preserved after a bad passphrase. */
export function secretSyncDecryptWarning(message: string): string | null {
  return hasSyncSecretsDecryptFailed() ? message : null;
}
