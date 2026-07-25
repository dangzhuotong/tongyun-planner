import type { StorageProvider, StorageBackendType } from "./types";
import { LocalStorageProvider } from "./localProvider";
import { WebDAVStorageProvider } from "./webdavProvider";
import { SupabaseStorageProvider } from "./supabaseProvider";

export type StorageStatus = "idle" | "busy" | "error";
export type StorageListener = (current: StorageBackendType) => void;

const STORAGE_KEY = "tongyun_storage_backend";

export class StorageManager {
  private providers = new Map<StorageBackendType, StorageProvider>();
  private _current: StorageBackendType = "local";
  private _status: StorageStatus = "idle";
  private listeners = new Set<StorageListener>();

  readonly local: LocalStorageProvider;
  readonly webdav: WebDAVStorageProvider;
  readonly supabase: SupabaseStorageProvider;

  constructor() {
    this.local = new LocalStorageProvider();
    this.webdav = new WebDAVStorageProvider();
    this.supabase = new SupabaseStorageProvider();

    this.providers.set("local", this.local);
    this.providers.set("webdav", this.webdav);
    this.providers.set("supabase", this.supabase);

    this.loadPreference();
  }

  private loadPreference(): void {
    const saved = localStorage.getItem(STORAGE_KEY) as StorageBackendType | null;
    if (saved && this.providers.has(saved)) {
      this._current = saved;
    }
  }

  get current(): StorageBackendType {
    return this._current;
  }

  get provider(): StorageProvider {
    return this.providers.get(this._current)!;
  }

  get status(): StorageStatus {
    return this._status;
  }

  allProviders(): [StorageBackendType, StorageProvider][] {
    return Array.from(this.providers.entries());
  }

  setBackend(type: StorageBackendType): void {
    if (!this.providers.has(type)) throw new Error(`Unknown storage backend: ${type}`);
    this._current = type;
    localStorage.setItem(STORAGE_KEY, type);
    this.notify();
  }

  subscribe(fn: StorageListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn(this._current));
  }

  /* ── Delegated methods ── */

  isConfigured(): boolean {
    return this.provider.isConfigured();
  }

  async test(): Promise<boolean> {
    return this.provider.test();
  }

  async uploadFile(path: string, data: Uint8Array, mime: string): Promise<string> {
    this._status = "busy";
    try {
      return await this.provider.uploadFile(path, data, mime);
    } finally {
      this._status = "idle";
    }
  }

  async downloadFile(path: string): Promise<Uint8Array | null> {
    return this.provider.downloadFile(path);
  }

  async deleteFile(path: string): Promise<void> {
    await this.provider.deleteFile(path);
  }

  async listFiles(prefix: string): Promise<string[]> {
    return this.provider.listFiles(prefix);
  }

  getPublicUrl(path: string): string | null {
    return this.provider.getPublicUrl(path);
  }

  async getFileUrl(path: string, mime: string): Promise<string> {
    return this.provider.getFileUrl(path, mime);
  }

  async writeText(path: string, content: string): Promise<void> {
    this._status = "busy";
    try {
      await this.provider.writeText(path, content);
    } finally {
      this._status = "idle";
    }
  }

  async readText(path: string): Promise<string | null> {
    return this.provider.readText(path);
  }
}

export const storageManager = new StorageManager();
