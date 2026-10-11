const CACHE_PREFIX = "tongyun_cache_";

interface CacheEntry<T> {
  data: T;
  time: number;
}

export function getCachedData<T>(key: string, ttl: number): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.time >= ttl) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, time: Date.now() };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable
  }
}

export function clearCache(key?: string): void {
  if (key) {
    localStorage.removeItem(CACHE_PREFIX + key);
  } else {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
  }
}

export async function fetchWithRetry<T>(
  fetcher: () => Promise<T>,
  retries = 2,
  delay = 1000,
): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetcher();
    } catch (e) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delay * (i + 1)));
      } else {
        throw e;
      }
    }
  }
  throw new Error("unreachable");
}
