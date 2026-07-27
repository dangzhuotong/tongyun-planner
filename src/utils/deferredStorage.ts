type PendingValue = unknown;

const pending = new Map<string, PendingValue>();
let timer: number | null = null;
let listenersInstalled = false;

function flushPendingStorage(): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  for (const [key, value] of pending) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    } catch (error) {
      console.error(`Deferred storage write failed for "${key}"`, error);
    }
  }
  pending.clear();
}

function installFlushListeners(): void {
  if (listenersInstalled || typeof window === "undefined") return;
  listenersInstalled = true;
  window.addEventListener("pagehide", flushPendingStorage);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingStorage();
  });
}

export function scheduleStorageWrite(key: string, value: PendingValue, delay = 150): void {
  pending.set(key, value);
  installFlushListeners();
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(flushPendingStorage, delay);
}

export { flushPendingStorage };
