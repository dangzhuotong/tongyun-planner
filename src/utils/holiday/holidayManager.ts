import { BUILTIN_CHINA_HOLIDAYS, FIXED_ANNUAL_FESTIVALS } from "./chinaHolidays";
import { BUILTIN_HK_HOLIDAYS } from "./hkHolidays";
import { getRegionOption } from "./regions";
import type { HolidayMap, HolidayMeta, HolidayRegion } from "./types";
import { safeJsonParse } from "../json";

export const ICAL_CACHE_KEY = "tongyun_calendar_ical_cache";

/**
 * 从 localStorage 读取已缓存的自定义 iCal 节假日数据。
 *
 * 缓存按订阅地址分区存储（key = ICAL_CACHE_KEY + ':' + url），
 * 这样切换地区或改订阅地址时不会串用上一次的数据。
 */
export function loadCachedICalHolidays(url?: string): HolidayMap {
  if (!url) return {};
  try {
    const raw = localStorage.getItem(`${ICAL_CACHE_KEY}:${url}`);
    if (!raw) return {};
    return safeJsonParse(raw, {});
  } catch {
    return {};
  }
}

/**
 * 缓存自定义 iCal 节假日数据到 localStorage
 */
export function saveCachedICalHolidays(url: string, data: HolidayMap): void {
  if (!url) return;
  try {
    localStorage.setItem(`${ICAL_CACHE_KEY}:${url}`, JSON.stringify(data));
  } catch {
    /* ignore storage errors */
  }
}

/**
 * 清除已缓存的自定义 iCal 节假日数据
 */
export function clearCachedICalHolidays(url?: string): void {
  try {
    if (url) {
      localStorage.removeItem(`${ICAL_CACHE_KEY}:${url}`);
    } else {
      // 未指定地址时清掉本应用写入的所有分区
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`${ICAL_CACHE_KEY}:`)) stale.push(key);
      }
      stale.forEach((key) => localStorage.removeItem(key));
    }
  } catch {
    /* ignore storage errors */
  }
}

export interface ResolveHolidayOptions {
  /** 是否开启节假日与调休显示，默认为 true */
  showHolidays?: boolean;
  /** 自定义覆盖年表 (例如 iCal 订阅解析产物) */
  customHolidays?: HolidayMap;
  /** 节假日地区，默认中国内地 */
  region?: HolidayRegion;
}

/**
 * 统一解析某一天的节假日与调休元数据。
 *
 * 优先级：自定义 iCal 订阅 > 内置地区年表 > 固定公历节日 > 常规周末/工作日。
 */
export function resolveDayHolidayMeta(
  dateStr: string,
  options: ResolveHolidayOptions = {},
): HolidayMeta {
  const { showHolidays = true, customHolidays = {}, region = "cn" } = options;

  const date = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = isNaN(date.getTime()) ? 0 : date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 开关关闭时：法定节假日「休」与调休「班」都不显示，仅保留周末底色
  if (!showHolidays) {
    if (isWeekend) {
      return { type: "weekend", label: "", name: "周末", isWeekend: true };
    }
    return { type: "workday", label: "", name: "", isWeekend: false };
  }

  // 1. 优先查用户自定义 / iCal 订阅数据（优先级最高，覆盖任何内置年表）
  const customEntry = customHolidays[dateStr];
  if (customEntry) {
    return {
      type: customEntry.type,
      label: customEntry.type,
      name: customEntry.name,
      isWeekend,
    };
  }

  // 2. 查内置地区法定节假日年表（中国内地含调休，中国香港含法定公众假期）
  if (region === "cn") {
    const builtinEntry = BUILTIN_CHINA_HOLIDAYS[dateStr];
    if (builtinEntry) {
      return {
        type: builtinEntry.type,
        label: builtinEntry.type,
        name: builtinEntry.name,
        isWeekend,
      };
    }
  } else if (region === "hk") {
    const builtinEntry = BUILTIN_HK_HOLIDAYS[dateStr];
    if (builtinEntry) {
      return {
        type: builtinEntry.type,
        label: builtinEntry.type,
        name: builtinEntry.name,
        isWeekend,
      };
    }
  }

  // 3. 固定公历节日兜底 (如圣诞节 12-25)
  const mmdd = dateStr.slice(5);
  const fixedName = FIXED_ANNUAL_FESTIVALS[mmdd];
  if (fixedName) {
    return {
      type: "休",
      label: "休",
      name: fixedName,
      isWeekend,
    };
  }

  // 4. 常规周末或普通工作日
  if (isWeekend) {
    return { type: "weekend", label: "", name: "周末", isWeekend: true };
  }
  return { type: "workday", label: "", name: "", isWeekend: false };
}

/**
 * 取某个地区应当使用的 iCal 订阅地址。
 * 内地用内置年表，返回空串；其他地区返回官方订阅地址。
 */
export function getRegionIcalUrl(region: HolidayRegion): string {
  return getRegionOption(region).icalUrl ?? "";
}
