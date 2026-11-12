import type { Task, TimeBlock } from "../../types";

const clockTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validBlockTime(start: string, end: string): boolean {
  return clockTime.test(start) && clockTime.test(end) && start < end;
}

export function blockTimeRange(preferred: string | undefined, duration: 30 | 60) {
  const fallback = "09:00";
  const start = preferred && clockTime.test(preferred) ? preferred : fallback;
  const [hour, minute] = start.split(":").map(Number);
  const first = Math.min(hour * 60 + minute, 1439 - duration);
  const format = (value: number) =>
    `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return { start: format(first), end: format(first + duration) };
}

function escapeText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n?|\n/g, "\\n")
    .replace(/([;,])/g, "\\$1");
}

function fold(line: string) {
  const encoder = new TextEncoder();
  let size = 0;
  let result = "";
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      result += "\r\n ";
      size = 1;
    }
    result += char;
    size += bytes;
  }
  return result;
}

export function exportPlannerDay(
  date: string,
  tasks: Task[],
  blocks: TimeBlock[],
  now = new Date(),
) {
  const compactDate = date.replace(/-/g, "");
  const timestamp = now.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tongyun Planner//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
  ];
  const appendEvent = (id: string, title: string, start: string, end?: string) => {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(encodeURIComponent(id))}@tongyun-planner`,
      `DTSTAMP:${timestamp}`,
      start,
    );
    if (end) lines.push(end);
    lines.push(`SUMMARY:${escapeText(title)}`, "END:VEVENT");
  };
  const at = (time: string) => `${compactDate}T${time.replace(":", "")}00`;
  const linked = new Set<string>();
  for (const block of blocks) {
    if (block.date !== date || !validBlockTime(block.startTime, block.endTime)) continue;
    if (block.taskId) linked.add(block.taskId);
    appendEvent(
      `block-${block.id}`,
      block.title,
      `DTSTART:${at(block.startTime)}`,
      `DTEND:${at(block.endTime)}`,
    );
  }
  for (const task of tasks) {
    if (task.completedAt || task.dueDate !== date || linked.has(task.id)) continue;
    const start =
      task.dueTime && clockTime.test(task.dueTime)
        ? `DTSTART:${at(task.dueTime)}`
        : `DTSTART;VALUE=DATE:${compactDate}`;
    appendEvent(`task-${task.id}`, task.title, start);
  }
  return [...lines, "END:VCALENDAR", ""].map(fold).join("\r\n");
}
