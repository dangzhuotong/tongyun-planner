export type DayHolidayType = "休" | "班" | "weekend" | "workday";

export interface HolidayMeta {
  type: DayHolidayType;
  label: "休" | "班" | "";
  name: string;
  isWeekend: boolean;
}

export interface HolidayItem {
  date: string; // YYYY-MM-DD
  type: "休" | "班";
  name: string;
}

export type HolidayMap = Record<string, { type: "休" | "班"; name: string }>;

/**
 * 节假日地区。
 * - cn：中国内地（内置离线年表，含调休补班）
 * - hk：中国香港（通过官方 1823 iCal 订阅拉取，无调休补班）
 */
export type HolidayRegion = "cn" | "hk";

export interface ICalParseResult {
  ok: boolean;
  holidays: HolidayMap;
  error?: string;
  count: number;
}
