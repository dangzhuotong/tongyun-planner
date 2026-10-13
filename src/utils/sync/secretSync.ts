import type { CustomizationConfig } from "../../types";
import { isSecretConfigKey, sanitizeConfigForSync } from "./types";
import { isSyncSecretsOptIn, readSyncSecretsPassphrase } from "./syncSecretsPref";

/** OWASP-aligned PBKDF2-SHA256 cost. Envelope records the count used to encrypt. */
export const SYNC_SECRET_KDF_ITERATIONS = 210_000;

export interface EncryptedSecretsEnvelope {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function isEmptySecretValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function readSmtpPass(): string {
  if (typeof localStorage === "undefined") return "";
  try {
    const raw = localStorage.getItem("tongyun_email_config");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { smtpPass?: unknown };
    return typeof parsed.smtpPass === "string" ? parsed.smtpPass : "";
  } catch {
    return "";
  }
}

function applySmtpPassIfEmpty(incoming: string): void {
  if (!incoming || typeof localStorage === "undefined") return;
  let parsed: Record<string, unknown> | null;
  try {
    const raw = localStorage.getItem("tongyun_email_config");
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }
  if (parsed && typeof parsed.smtpPass === "string" && parsed.smtpPass.trim()) return;
  const next = parsed ?? {
    smtpProvider: "qq",
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
    smtpUser: "",
    recipientEmail: "",
    enableRemindBefore: false,
    remindBeforeMinutes: 30,
    enableDailyDigest: false,
    digestHour: 8,
    digestMinute: 0,
  };
  next.smtpPass = incoming;
  localStorage.setItem("tongyun_email_config", JSON.stringify(next));
}

/** Secret fields from config, plus the local SMTP password. WebDAV passwords are not included. */
export function collectSecretFields(config: object | null | undefined): Record<string, unknown> {
  const secrets: Record<string, unknown> = {};
  if (config && typeof config === "object") {
    for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
      if (key === "encryptedSecrets" || key === "syncSecretsPassphrase") continue;
      if (!isSecretConfigKey(key) || isEmptySecretValue(value)) continue;
      secrets[key] = value;
    }
  }
  if (isEmptySecretValue(secrets.smtpPass)) {
    const smtp = readSmtpPass();
    if (smtp) secrets.smtpPass = smtp;
  }
  return secrets;
}

export function isSecretsEmpty(secrets: Record<string, unknown>): boolean {
  return Object.keys(secrets).length === 0;
}

function isEnvelope(value: unknown): value is EncryptedSecretsEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as EncryptedSecretsEnvelope;
  return (
    envelope.v === 1 &&
    envelope.kdf === "PBKDF2-SHA256" &&
    typeof envelope.iterations === "number" &&
    typeof envelope.salt === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.ciphertext === "string"
  );
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function encryptSecretFields(
  secrets: Record<string, unknown>,
  passphrase: string,
  iterations = SYNC_SECRET_KDF_ITERATIONS,
): Promise<EncryptedSecretsEnvelope> {
  if (!passphrase) throw new Error("Passphrase required");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(JSON.stringify(secrets)),
  );
  return {
    v: 1,
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptSecretFields(
  envelope: unknown,
  passphrase: string,
): Promise<Record<string, unknown>> {
  if (!isEnvelope(envelope)) throw new Error("Invalid secret envelope");
  if (!passphrase) throw new Error("Passphrase required");
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveKey(passphrase, salt, envelope.iterations, ["decrypt"]);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    base64ToBytes(envelope.ciphertext) as BufferSource,
  );
  const parsed = JSON.parse(textDecoder.decode(plain)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid secret payload");
  }
  return parsed as Record<string, unknown>;
}

export interface PrepareConfigOptions {
  /** Full local config, including secret fields that a merged public payload no longer has. */
  secretSource?: CustomizationConfig | null;
  /** Keep the remote ciphertext when this device has nothing new to publish. */
  remoteEnvelope?: unknown;
  iterations?: number;
}

/**
 * Default (opt-in off): strip every secret and any previous ciphertext.
 * Opt-in on: encrypt secrets with the device passphrase. The passphrase itself is never included.
 * An empty local secret set does not replace a remote envelope, so a new device cannot wipe keys.
 */
export type UploadedConfig = CustomizationConfig & {
  encryptedSecrets?: EncryptedSecretsEnvelope;
};

export async function prepareConfigForUpload(
  config: CustomizationConfig | null | undefined,
  options: PrepareConfigOptions = {},
): Promise<UploadedConfig | null | undefined> {
  if (!config || typeof config !== "object") return config;
  const source = options.secretSource ?? config;
  const enabled = isSyncSecretsOptIn(source);
  const sanitized = sanitizeConfigForSync(config);
  if (!sanitized || typeof sanitized !== "object") return sanitized;
  const record = { ...(sanitized as object) } as Record<string, unknown>;
  delete record.encryptedSecrets;
  delete record.syncSecretsPassphrase;
  delete record.secretsPassphrase;
  if (!enabled) {
    delete record.syncSecrets;
    return record as unknown as UploadedConfig;
  }
  record.syncSecrets = true;
  const passphrase = readSyncSecretsPassphrase();
  const secrets = collectSecretFields(source);
  if (!passphrase || isSecretsEmpty(secrets)) {
    if (isEnvelope(options.remoteEnvelope)) {
      record.encryptedSecrets = options.remoteEnvelope;
    }
    return record as unknown as UploadedConfig;
  }
  record.encryptedSecrets = await encryptSecretFields(secrets, passphrase, options.iterations);
  return record as unknown as UploadedConfig;
}

/**
 * Fill local secrets that are still empty. A key already set on this device is left alone.
 * Requires the local opt-in flag and the same passphrase used to encrypt.
 */
export async function importDecryptedSecrets(
  remotePayload: unknown,
  localBefore: unknown,
): Promise<boolean> {
  if (!remotePayload || typeof remotePayload !== "object") return false;
  if (!isSyncSecretsOptIn(localBefore)) return false;
  const passphrase = readSyncSecretsPassphrase();
  const envelope = (remotePayload as { encryptedSecrets?: unknown }).encryptedSecrets;
  if (!passphrase || !isEnvelope(envelope)) return false;

  let secrets: Record<string, unknown>;
  try {
    secrets = await decryptSecretFields(envelope, passphrase);
  } catch {
    console.warn("[sync] failed to decrypt synced secrets");
    return false;
  }

  const local = (localBefore && typeof localBefore === "object" ? localBefore : {}) as Record<
    string,
    unknown
  >;

  let stored: Record<string, unknown> = {};
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("aero_customization_config");
      stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      stored = {};
    }
  }

  let changed = false;
  for (const [key, value] of Object.entries(secrets)) {
    if (key === "smtpPass") {
      if (typeof value === "string") applySmtpPassIfEmpty(value);
      continue;
    }
    if (!isSecretConfigKey(key)) continue;
    if (isEmptySecretValue(local[key]) && !isEmptySecretValue(value)) {
      stored[key] = value;
      changed = true;
    }
  }
  if (changed && typeof localStorage !== "undefined") {
    localStorage.setItem("aero_customization_config", JSON.stringify(stored));
  }
  return true;
}
