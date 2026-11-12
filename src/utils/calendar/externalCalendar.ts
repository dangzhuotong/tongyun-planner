import ICAL from "ical.js";
import type { TimeBlock } from "../../types";

export const CALENDAR_LIMIT = 2 * 1024 * 1024;

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
}

export function parseCalendarEvents(text: string, from: Date, until: Date): CalendarEvent[] {
  if (text.length > CALENDAR_LIMIT || !/^BEGIN:VCALENDAR\s*$/im.test(text)) {
    throw new Error("无效或过大的 iCalendar 文件");
  }
  const calendar = new ICAL.Component(ICAL.parse(text));
  // Embedded VTIMEZONE definitions let the parser retain the sender's time zone.
  const zones = calendar.getAllSubcomponents("vtimezone");
  for (const zone of zones) ICAL.TimezoneService.register(zone);
  try {
    const components = calendar.getAllSubcomponents("vevent");
    const events = components.map((component) => new ICAL.Event(component));
    const exceptions = new Map<string, ICAL.Event[]>();
    for (const event of events) {
      if (!event.isRecurrenceException()) continue;
      const list = exceptions.get(event.uid) ?? [];
      list.push(event);
      exceptions.set(event.uid, list);
    }
    const result = new Map<string, CalendarEvent>();
    let expanded = 0;
    const timestamp = (time: ICAL.Time) =>
      time.zone === ICAL.Timezone.localTimezone
        ? new Date(
            time.year,
            time.month - 1,
            time.day,
            time.hour,
            time.minute,
            time.second,
          ).getTime()
        : time.toJSDate().getTime();
    const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
      if (String(event.component.getFirstPropertyValue("status")).toUpperCase() === "CANCELLED")
        return;
      const startMs = timestamp(start);
      const endMs = Math.max(startMs + 1, timestamp(end));
      if (startMs >= +until || endMs <= +from) return;
      const id = `${event.uid}:${startMs}`;
      result.set(id, {
        id,
        title: event.summary || "未命名日程",
        start: startMs,
        end: endMs,
        allDay: start.isDate,
      });
    };
    for (const event of events) {
      if (!event.startDate) continue;
      if (event.isRecurrenceException()) {
        add(event, event.startDate, event.endDate);
        continue;
      }
      if (!event.isRecurring()) {
        add(event, event.startDate, event.endDate);
        continue;
      }
      for (const exception of exceptions.get(event.uid) ?? []) event.relateException(exception);
      const iterator = event.iterator();
      for (let next = iterator.next(); next; next = iterator.next()) {
        if (++expanded > 100_000) throw new Error("日历重复事件过多");
        if (timestamp(next) >= +until) break;
        const occurrence = event.getOccurrenceDetails(next);
        add(occurrence.item, occurrence.startDate, occurrence.endDate);
      }
    }
    return [...result.values()].sort((a, b) => a.start - b.start);
  } finally {
    for (const zone of zones)
      ICAL.TimezoneService.remove(String(zone.getFirstPropertyValue("tzid")));
  }
}

export function calendarOverlap(block: TimeBlock, event: CalendarEvent): boolean {
  if (event.allDay) return false;
  const start = new Date(`${block.date}T${block.startTime}:00`).getTime();
  const end = new Date(`${block.date}T${block.endTime}:00`).getTime();
  return start < event.end && end > event.start;
}

export function planReview(blocks: TimeBlock[], minutes: number, date: string) {
  // Merge overlapping blocks so an overlapping hour is counted only once.
  const intervals = blocks
    .filter((block) => block.date === date)
    .map(({ startTime, endTime }) => {
      const toMinutes = (value: string) =>
        Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
      return [toMinutes(startTime), toMinutes(endTime)];
    })
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] - b[0]);
  let end = 0;
  let planned = 0;
  for (const [start, nextEnd] of intervals) {
    planned += Math.max(0, nextEnd - Math.max(start, end));
    end = Math.max(end, nextEnd);
  }
  return { planned, actual: minutes };
}
