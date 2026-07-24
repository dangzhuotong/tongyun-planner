export type StorageBackendType = "local" | "webdav" | "supabase";

export interface StorageProvider {
  readonly type: StorageBackendType;
  readonly displayName: string;
  readonly supportsPublicUrl: boolean;

  isConfigured(): boolean;
  test(): Promise<boolean>;

  /** Upload binary file (attachments, images). Returns a storage-specific identifier (path or URL). */
  uploadFile(path: string, data: Uint8Array, mime: string): Promise<string>;
  /** Download binary file. Returns null if not found. */
  downloadFile(path: string): Promise<Uint8Array | null>;
  /** Delete a file or data blob */
  deleteFile(path: string): Promise<void>;
  /** List files under a prefix directory */
  listFiles(prefix: string): Promise<string[]>;
  /** Get a publicly accessible URL for AI providers to read. Returns null if not available. */
  getPublicUrl(path: string): string | null;

  /**
   * Get a displayable URL for a stored file.
   * For public-url backends (OSS/COS/Supabase) returns the public URL directly.
   * For private backends (Local/WebDAV) downloads the file and creates a blob URL.
   * The caller should revoke the blob URL when done.
   */
  getFileUrl(path: string, mime: string): Promise<string>;

  /** Write text data (JSON sync payloads) */
  writeText(path: string, content: string): Promise<void>;
  /** Read text data. Returns null if not found. */
  readText(path: string): Promise<string | null>;
}

export interface SupabaseStorageConfig {
  url: string;
  anonKey: string;
  bucket: string;
}

/* ── Path helpers ── */

export const ATTACHMENTS_PREFIX = "attachments";
export const DATA_PREFIX = "data";

export function getAttachmentPath(taskId: string, attachmentId: string, filename: string): string {
  return `${ATTACHMENTS_PREFIX}/${taskId}/${attachmentId}/${filename}`;
}

export function getDataPath(filename: string): string {
  return `${DATA_PREFIX}/${filename}`;
}

export function parseAttachmentPath(path: string): { taskId: string; attachmentId: string; filename: string } | null {
  const parts = path.split("/");
  if (parts[0] !== ATTACHMENTS_PREFIX || parts.length < 4) return null;
  return { taskId: parts[1], attachmentId: parts[2], filename: parts.slice(3).join("/") };
}
