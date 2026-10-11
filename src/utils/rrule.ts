export interface RRuleParsed {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  interval: number;
  byDay?: number[]; // 0=Sun, 1=Mon...6=Sat
  bySetPos?: number; // e.g. -1 = last
}

const DAY_MAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_NAMES_SHORT = ["日", "一", "二", "三", "四", "五", "六"];

export function parseRRule(rrule: string): RRuleParsed | null {
  if (!rrule || rrule === "none") return null;

  // Backward compat with old simple values
  if (rrule === "daily") return { freq: "DAILY", interval: 1 };
  if (rrule === "weekly") return { freq: "WEEKLY", interval: 1 };
  if (rrule === "monthly") return { freq: "MONTHLY", interval: 1 };

  const parts = rrule.split(";");
  const result: RRuleParsed = { freq: "DAILY", interval: 1 };

  for (const part of parts) {
    const [key, val] = part.split("=");
    if (key === "FREQ") {
      if (val === "DAILY" || val === "WEEKLY" || val === "MONTHLY") result.freq = val;
    } else if (key === "INTERVAL") {
      result.interval = parseInt(val, 10) || 1;
    } else if (key === "BYDAY") {
      result.byDay = val
        .split(",")
        .map((d) => DAY_MAP[d.trim()])
        .filter((d) => d !== undefined);
    } else if (key === "BYSETPOS") {
      result.bySetPos = parseInt(val, 10);
    }
  }
  return result;
}

export function rruleToLabel(
  rrule: string,
  t?: {
    daily?: string;
    weekly?: string;
    monthly?: string;
    weekday?: string;
    every?: string;
    day?: string;
  },
): string {
  const parsed = parseRRule(rrule);
  if (!parsed) return "";

  const tDaily = t?.daily || "每天";
  const tWeekly = t?.weekly || "每周";
  const tMonthly = t?.monthly || "每月";
  const tWeekday = t?.weekday || "工作日";
  const tEvery = t?.every || "每";
  const tDay = t?.day || "天";

  if (parsed.freq === "DAILY") {
    if (parsed.byDay) {
      return `${parsed.interval > 1 ? `${tEvery}${parsed.interval}${tDay}` : tEvery}${parsed.byDay.map((d) => DAY_NAMES_SHORT[d]).join("、")}`;
    }
    return parsed.interval === 1 ? tDaily : `${tEvery}${parsed.interval}${tDay}`;
  }
  if (parsed.freq === "WEEKLY") {
    if (parsed.byDay) {
      if (parsed.byDay.length === 5 && parsed.byDay[0] === 1 && parsed.byDay[4] === 5)
        return tWeekday;
      return `${parsed.interval > 1 ? `${tEvery}${parsed.interval}${tWeekly}` : tWeekly}${parsed.byDay.map((d) => DAY_NAMES_SHORT[d]).join("、")}`;
    }
    return parsed.interval === 1 ? tWeekly : `${tEvery}${parsed.interval}${tWeekly}`;
  }
  if (parsed.freq === "MONTHLY") {
    if (parsed.bySetPos && parsed.byDay?.length) {
      const posLabel = parsed.bySetPos === -1 ? "最后" : `第${parsed.bySetPos}`;
      return `${tMonthly}${posLabel}个周${DAY_NAMES_SHORT[parsed.byDay[0]]}`;
    }
    return parsed.interval === 1 ? tMonthly : `${tEvery}${parsed.interval}${tMonthly}`;
  }
  return rrule;
}

function getNextWeekdayDate(from: Date, targetDay: number): Date {
  const d = new Date(from);
  const currentDay = d.getDay();
  let diff = targetDay - currentDay;
  if (diff <= 0) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function getLastWeekdayDate(year: number, month: number, targetDay: number): Date {
  const lastDay = new Date(year, month + 1, 0);
  let diff = lastDay.getDay() - targetDay;
  if (diff < 0) diff += 7;
  const result = new Date(lastDay);
  result.setDate(result.getDate() - diff);
  return result;
}

function getNthWeekdayDate(year: number, month: number, n: number, targetDay: number): Date {
  if (n === -1) return getLastWeekdayDate(year, month, targetDay);
  const firstDay = new Date(year, month, 1);
  const firstTarget = getNextWeekdayDate(firstDay, targetDay);
  firstTarget.setDate(firstTarget.getDate() + (n - 1) * 7);
  if (firstTarget.getMonth() !== month) return getLastWeekdayDate(year, month, targetDay);
  return firstTarget;
}

export function getNextRRuleDate(currentDue: string, rrule: string): string | undefined {
  const parsed = parseRRule(rrule);
  if (!parsed) return undefined;

  const current = new Date(currentDue);
  const year = current.getFullYear();
  const month = current.getMonth();
  const day = current.getDate();

  if (parsed.freq === "DAILY") {
    const next = new Date(year, month, day + parsed.interval);
    return formatDate(next);
  }

  if (parsed.freq === "WEEKLY") {
    if (parsed.byDay && parsed.byDay.length > 0) {
      const next = new Date(year, month, day + 1);
      for (let i = 0; i < 14; i++) {
        if (parsed.byDay.includes(next.getDay())) {
          return formatDate(next);
        }
        next.setDate(next.getDate() + 1);
      }
    }
    const next = new Date(year, month, day + 7 * parsed.interval);
    return formatDate(next);
  }

  if (parsed.freq === "MONTHLY") {
    if (parsed.bySetPos !== undefined && parsed.byDay?.length) {
      let nextMonth = month + 1;
      let nextYear = year;
      if (nextMonth > 11) {
        nextMonth = 0;
        nextYear++;
      }
      const next = getNthWeekdayDate(nextYear, nextMonth, parsed.bySetPos, parsed.byDay[0]);
      return formatDate(next);
    }
    let nextMonth = month + parsed.interval;
    let nextYear = year;
    while (nextMonth > 11) {
      nextMonth -= 12;
      nextYear++;
    }
    const dayInMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
    const next = new Date(nextYear, nextMonth, Math.min(day, dayInMonth));
    return formatDate(next);
  }

  return undefined;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildRRule(
  freq: "DAILY" | "WEEKLY" | "MONTHLY",
  options?: { interval?: number; byDay?: number[]; bySetPos?: number },
): string {
  const parts = [`FREQ=${freq}`];
  if (options?.interval && options.interval > 1) parts.push(`INTERVAL=${options.interval}`);
  if (options?.byDay && options.byDay.length > 0) {
    const dayKeys = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    parts.push(`BYDAY=${options.byDay.map((d) => dayKeys[d]).join(",")}`);
  }
  if (options?.bySetPos !== undefined) parts.push(`BYSETPOS=${options.bySetPos}`);
  return parts.join(";");
}
