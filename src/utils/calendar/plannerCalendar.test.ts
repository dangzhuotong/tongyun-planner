import { expect, it } from "vitest";
import { blockTimeRange, exportPlannerDay, planReview, validBlockTime } from "./plannerCalendar";

it("keeps a late time block on the same day at the requested length", () => {
  expect(blockTimeRange("23:55", 60)).toEqual({ start: "22:59", end: "23:59" });
  expect(blockTimeRange(undefined, 30)).toEqual({ start: "09:00", end: "09:30" });
  expect(validBlockTime("12:00", "11:00")).toBe(false);
});

it("exports valid folded iCalendar lines and skips a duplicate deadline for a linked block", () => {
  const date = "2026-11-12";
  const calendar = exportPlannerDay(
    date,
    [
      { id: "a", title: "Duplicate", dueDate: date, category: "urgent-important" },
      { id: "b", title: "汇报,\\原稿\n完成", dueDate: date, category: "urgent-important" },
    ],
    [
      {
        id: "slot",
        title: "时间块".repeat(30),
        date,
        startTime: "10:30",
        endTime: "11:00",
        taskId: "a",
        color: "green",
      },
    ],
    new Date("2026-11-12T08:00:00Z"),
  );
  expect(calendar).toContain("DTSTART:20261112T103000\r\nDTEND:20261112T110000");
  expect(calendar).toContain("DTSTAMP:20261112T080000Z");
  expect(calendar).toContain("DTSTART;VALUE=DATE:20261112");
  expect(calendar).toContain("SUMMARY:汇报\\,\\\\原稿\\n完成");
  expect(calendar).not.toContain("Duplicate");
  expect(calendar.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
    true,
  );
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
