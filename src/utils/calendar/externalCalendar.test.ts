import { expect, it } from "vitest";
import { calendarOverlap, parseCalendarEvents, planReview } from "./externalCalendar";

const event = (fields: string[]) => ["BEGIN:VEVENT", ...fields, "END:VEVENT"];
it("expands recurring meetings, honors EXDATE, and detects a conflicting time block", () => {
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    ...event([
      "UID:standup",
      "DTSTAMP:20261110T000000Z",
      "SUMMARY:站会",
      "DTSTART:20261111T090000",
      "DTEND:20261111T093000",
      "RRULE:FREQ=DAILY;COUNT=4",
      "EXDATE:20261112T090000",
    ]),
    ...event([
      "UID:holiday",
      "DTSTAMP:20261110T000000Z",
      "SUMMARY:休假",
      "DTSTART;VALUE=DATE:20261113",
      "DTEND;VALUE=DATE:20261114",
    ]),
    "END:VCALENDAR",
  ].join("\r\n");
  const range = (day: string, next: string) =>
    parseCalendarEvents(calendar, new Date(day + "T00:00:00"), new Date(next + "T00:00:00"));
  expect(range("2026-11-12", "2026-11-13")).toHaveLength(0);
  const [allDay, meeting] = range("2026-11-13", "2026-11-14");
  const block = {
    date: "2026-11-13",
    startTime: "09:20",
    endTime: "10:00",
    id: "b",
    title: "工作",
    color: "",
  };
  expect(calendarOverlap(block, allDay)).toBe(false);
  expect(calendarOverlap(block, meeting)).toBe(true);
  expect(calendarOverlap({ ...block, startTime: "09:30" }, meeting)).toBe(false);
});

it("counts an overlapping planned minute once", () => {
  const block = {
    date: "2026-11-13",
    startTime: "09:00",
    endTime: "10:00",
    id: "b",
    title: "",
    color: "",
  };
  expect(
    planReview([block, { ...block, startTime: "09:45", endTime: "10:30" }], 32, block.date),
  ).toEqual({ planned: 90, actual: 32 });
});
