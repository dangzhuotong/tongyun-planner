import type { HolidayMap, ICalParseResult } from "./types";

/**
 * 提取 iCal 日期格式字符串中的 YYYY-MM-DD
 * 支持：
 * - 20261001
 * - 20261001T080000Z
 * - 2026-10-01
 */
export function extractIcalDate(rawVal: string): string | null {
  if (!rawVal) return null;
  const cleaned = rawVal.trim();
  // 匹配 20261001 或 2026-10-01
  const compactMatch = cleaned.match(/(\d{4})[-]?(\d{2})[-]?(\d{2})/);
  if (!compactMatch) return null;
  const y = compactMatch[1];
  const m = compactMatch[2];
  const d = compactMatch[3];
  return `${y}-${m}-${d}`;
}

/**
 * 计算两个 YYYY-MM-DD 之间的全部日期（含 start，不含 end；若 end <= start 则仅含 start）
 */
export function getDatesBetween(startDateStr: string, endDateStr?: string | null): string[] {
  const dates: string[] = [];
  const start = new Date(`${startDateStr}T00:00:00`);
  if (isNaN(start.getTime())) return dates;

  if (!endDateStr) {
    dates.push(startDateStr);
    return dates;
  }

  const end = new Date(`${endDateStr}T00:00:00`);
  if (isNaN(end.getTime()) || end <= start) {
    dates.push(startDateStr);
    return dates;
  }

  const current = new Date(start);
  while (current < end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 根据 iCal 事件标题/描述判断是「休」还是「班」。
 *
 * 判据只认明确的中文补班词与英文标记：
 * - 「班」类：补班、调休上班、上班日、workday / working day
 * - 其余一律按公众假期「休」处理
 *
 * 注意不要用宽泛的 /work/ 之类做判断，否则 "The first day of January"
 * 之类的普通英文标题会被误判成工作日。
 */
export function classifyHolidayType(summary: string): "休" | "班" {
  const s = summary.trim();
  if (!s) return "休";
  // 明确的补班/上班语义
  if (/补班|调休上班|上班日|是工作日|工作日(?!休息)/.test(s)) return "班";
  if (/\bworkday\b|\bworking\s*day\b/i.test(s)) return "班";
  return "休";
}

/**
 * 清理事件标题，去掉多余的前缀和标志
 */
export function cleanSummaryName(summary: string): string {
  let name = summary.trim();
  // 移除常见的 [休] (班) 等标记
  name = name.replace(/^\[[休班]\]\s*/, "");
  name = name.replace(/^\([休班]\)\s*/, "");
  name = name.replace(/\s*\([休班]\)$/, "");
  name = name.replace(/\s*\[[休班]\]$/, "");
  return name.trim() || summary.trim();
}

/**
 * 解析 iCal (.ics) 文本内容
 * 遵循 RFC 5545 基础子集，安全处理换行折叠与异常格式
 */
export function parseICal(icsText: string): ICalParseResult {
  if (typeof icsText !== "string" || !icsText.trim()) {
    return { ok: false, holidays: {}, error: "iCal 内容为空", count: 0 };
  }

  // RFC 5545: 折叠行展开 (换行后紧随空格或制表符视为同一行)
  const unfolded = icsText.replace(/\r\n[ \t]|\r[ \t]|\n[ \t]/g, "");

  if (!unfolded.includes("BEGIN:VCALENDAR")) {
    return { ok: false, holidays: {}, error: "内容未包含有效的 BEGIN:VCALENDAR", count: 0 };
  }

  const lines = unfolded.split(/\r\n|\r|\n/);
  const holidays: HolidayMap = {};
  let inEvent = false;
  let currentStart = "";
  let currentEnd = "";
  let currentSummary = "";
  let currentStatus = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      currentStart = "";
      currentEnd = "";
      currentSummary = "";
      currentStatus = "";
      continue;
    }

    if (trimmed === "END:VEVENT") {
      if (inEvent && currentStart && currentStatus !== "CANCELLED") {
        const type = classifyHolidayType(currentSummary);
        const name = cleanSummaryName(currentSummary) || (type === "休" ? "节假日" : "调休工作日");
        const dateRange = getDatesBetween(currentStart, currentEnd || null);
        for (const d of dateRange) {
          holidays[d] = { type, name };
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    // 解析属性名与属性值
    // 兼容: DTSTART:20261001, DTSTART;VALUE=DATE:20261001, SUMMARY;LANGUAGE=zh:国庆节
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const propPart = trimmed.slice(0, colonIdx);
    const valuePart = trimmed.slice(colonIdx + 1);
    const propName = propPart.split(";")[0].toUpperCase();

    if (propName === "DTSTART") {
      const parsed = extractIcalDate(valuePart);
      if (parsed) currentStart = parsed;
    } else if (propName === "DTEND") {
      const parsed = extractIcalDate(valuePart);
      if (parsed) currentEnd = parsed;
    } else if (propName === "SUMMARY") {
      // 还原 iCal 转义字符
      currentSummary = valuePart
        .replace(/\\n/g, "\n")
        .replace(/\\,/g, ",")
        .replace(/\\;/g, ";")
        .replace(/\\\\/g, "\\");
    } else if (propName === "STATUS") {
      currentStatus = valuePart.trim().toUpperCase();
    }
  }

  const count = Object.keys(holidays).length;
  return {
    ok: true,
    holidays,
    count,
  };
}

/**
 * 判断当前是否运行在 Tauri 桌面端
 */
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
}

/**
 * 用 Tauri 原生命令拉取远程文本。
 *
 * 桌面端必须走 Rust 侧请求：WebView 里直接 fetch 会被 CORS 拦掉
 * （香港 1823 等政府站点都不带 CORS 头）。fetch_rss 已带桌面 UA，
 * 也接受 text/calendar。
 */
async function fetchViaTauri(url: string): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<string>("fetch_rss", { url });
    if (typeof res === "string" && res.trim().length > 0) return res;
    return null;
  } catch {
    return null;
  }
}

/**
 * 从远程订阅 URL 获取并解析 iCal，提供超时与优雅降级保护。
 *
 * 桌面端走 Tauri 原生命令（绕 CORS）；浏览器调试时走 Vite dev 代理，
 * 再退回浏览器直连。任何一步失败都返回明确的错误文案，不抛异常、不崩溃。
 */
export async function fetchAndParseICal(
  url: string,
  timeoutMs = 15000,
): Promise<ICalParseResult> {
  if (!url || typeof url !== "string") {
    return { ok: false, holidays: {}, error: "URL 为空", count: 0 };
  }
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return { ok: false, holidays: {}, error: "订阅地址必须是以 http:// 或 https:// 开头的合法链接", count: 0 };
  }

  // 1. Tauri 原生命令（桌面端主路径，绕 CORS）
  const nativeText = await fetchViaTauri(trimmed);
  if (nativeText) {
    return parseICal(nativeText);
  }

  // 2. 本地 Vite 开发服务器代理（仅浏览器调试时用；桌面端相对路径无意义）
  if (!isTauriRuntime()) {
    try {
      const devRes = await fetch(`/api/proxy-fetch?url=${encodeURIComponent(trimmed)}`);
      if (devRes.ok) {
        const text = await devRes.text();
        if (text.trim().length > 0) {
          return parseICal(text);
        }
      }
    } catch {
      // 降级到浏览器 fetch
    }
  }

  // 3. 浏览器直连（带超时保护）
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(trimmed, {
      signal: controller.signal,
      headers: {
        Accept: "text/calendar, text/plain, */*",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        holidays: {},
        error: `服务器响应异常 (HTTP ${res.status})`,
        count: 0,
      };
    }

    const text = await res.text();
    return parseICal(text);
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return { ok: false, holidays: {}, error: "请求 iCal 订阅超时，请检查网络", count: 0 };
    }
    return {
      ok: false,
      holidays: {},
      error: `获取日历失败: ${err?.message || "网络请求异常"}`,
      count: 0,
    };
  }
}
