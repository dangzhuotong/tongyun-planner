import type { HolidayRegion } from "./types";

export interface RegionOption {
  id: HolidayRegion;
  label: string;
  /** 该地区公众假期的官方 iCal 订阅地址（离线年表地区可为空） */
  icalUrl?: string;
  /** 是否有内置离线年表 */
  builtin: boolean;
}

/**
 * 支持的节假日地区。
 * 中国内地使用内置离线年表（含调休补班）；
 * 中国香港没有调休制度，用特区政府 1823 官方 iCal 订阅。
 */
export const HOLIDAY_REGIONS: RegionOption[] = [
  {
    id: "cn",
    label: "中国内地",
    builtin: true,
  },
  {
    id: "hk",
    label: "中国香港",
    icalUrl: "https://www.1823.gov.hk/common/ical/en.ics",
    builtin: false,
  },
];

export const DEFAULT_HOLIDAY_REGION: HolidayRegion = "cn";

export function getRegionOption(region: HolidayRegion): RegionOption {
  return HOLIDAY_REGIONS.find((r) => r.id === region) ?? HOLIDAY_REGIONS[0]!;
}

export function isHolidayRegion(value: unknown): value is HolidayRegion {
  return value === "cn" || value === "hk";
}
