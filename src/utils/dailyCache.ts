import { safeJsonParse } from "./json";

interface DailyCache<T> {
  date: string;
  locale?: string;
  data: T;
}

export function readDailyCache<T>(key: string, today: string, locale: string): T | null {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const parsed = safeJsonParse<DailyCache<T> | null>(raw, null);
  if (!parsed) return null;
  if (parsed.date !== today) return null;
  if (parsed.locale && parsed.locale !== locale) return null;
  return parsed.data;
}

export function writeDailyCache<T>(key: string, today: string, locale: string, data: T) {
  const payload: DailyCache<T> = { date: today, locale, data };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // 忽略配额错误
  }
}
