import type { JournalEntry, StickyNote, Task, TaskCategory } from "../types";
import { createId } from "./id";
import { getLocalDateString } from "./date";

export interface PlannerAgentStore {
  tasks: Task[];
  completed: Task[];
  notes: StickyNote[];
  journal: JournalEntry[];
  addTask: (task: {
    id: string;
    title: string;
    category?: TaskCategory;
    description?: string;
    dueDate?: string;
  }) => void;
  addNote: (text: string, title?: string) => string;
  addJournal: (entry: JournalEntry) => void;
}

export type AgentResult =
  { status: "ok"; data: unknown } | { status: "invalid" | "unavailable" | "unknown" | "conflict" };

class InvalidArguments extends Error {}

const categories: TaskCategory[] = [
  "urgent-important",
  "urgent-not-important",
  "important-not-urgent",
  "not-urgent-not-important",
];

function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) {
    throw new InvalidArguments("invalid text");
  }
  return value;
}

function optionalText(value: unknown, max: number): string | undefined {
  return value === undefined ? undefined : text(value, max);
}

function date(value: unknown): string {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new InvalidArguments("invalid date");
  const parsed = new Date(raw + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new InvalidArguments("invalid date");
  }
  return raw;
}

function args(input: unknown, allowed: string[]): Record<string, unknown> {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  ) {
    throw new InvalidArguments("invalid arguments");
  }
  return input as Record<string, unknown>;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidArguments("invalid page");
  }
  return value;
}

function page<T>(
  values: T[],
  input: unknown,
  fields: (value: T) => (string | undefined)[],
  view: (value: T) => object,
) {
  const a = args(input, ["query", "limit", "offset"]);
  const query = optionalText(a.query, 200)?.trim().toLocaleLowerCase();
  const limit = integer(a.limit, 10, 1, 50);
  const offset = integer(a.offset, 0, 0, 1_000_000);
  const found = query
    ? values.filter((v) => fields(v).some((field) => field?.toLocaleLowerCase().includes(query)))
    : values;
  return {
    items: found.slice(offset, offset + limit).map(view),
    nextOffset: offset + limit < found.length ? offset + limit : null,
  };
}

function preview(value?: string): string | undefined {
  return value?.slice(0, 4000);
}

/** Only these six operations can reach live Planner data. No arbitrary patch or path input. */
export function executePlannerAgent(
  store: PlannerAgentStore,
  operation: string,
  input: unknown,
): AgentResult {
  const ok = (data: unknown): AgentResult => ({ status: "ok", data });
  try {
    switch (operation) {
      case "list_tasks":
        return ok(
          page(
            [...store.tasks, ...store.completed],
            input,
            (t) => [t.title, t.description, t.notes],
            (t) => ({
              id: t.id,
              title: preview(t.title),
              description: preview(t.description),
              notes: preview(t.notes),
              category: t.category,
              dueDate: t.dueDate,
              dueTime: t.dueTime,
              completedAt: t.completedAt ?? null,
            }),
          ),
        );
      case "list_notes":
        return ok(
          page(
            store.notes,
            input,
            (n) => [n.title, n.text],
            (n) => ({
              id: n.id,
              title: preview(n.title),
              text: preview(n.text),
              color: n.color,
            }),
          ),
        );
      case "list_journal":
        return ok(
          page(
            store.journal,
            input,
            (j) => [j.title, j.content, j.date],
            (j) => ({
              id: j.id,
              title: preview(j.title),
              content: preview(j.content),
              date: j.date,
              isDaily: j.isDaily,
            }),
          ),
        );
      case "create_task": {
        const a = args(input, ["title", "description", "category", "dueDate"]);
        if (a.category !== undefined && !categories.includes(a.category as TaskCategory))
          return { status: "invalid" };
        const id = createId("task");
        const task = {
          id,
          title: text(a.title, 200).trim(),
          description: optionalText(a.description, 4000),
          category: a.category as TaskCategory | undefined,
          dueDate: a.dueDate === undefined ? undefined : date(a.dueDate),
        };
        store.addTask(task);
        return ok({ id });
      }
      case "create_note": {
        const a = args(input, ["text", "title"]);
        return ok({ id: store.addNote(text(a.text, 8000), optionalText(a.title, 200)?.trim()) });
      }
      case "create_journal": {
        const a = args(input, ["title", "content", "date", "isDaily"]);
        const title = text(a.title, 200).trim();
        const content = text(a.content, 16000);
        const entryDate = a.date === undefined ? getLocalDateString() : date(a.date);
        if (a.isDaily !== undefined && typeof a.isDaily !== "boolean") return { status: "invalid" };
        const isDaily = a.isDaily === true;
        if (isDaily && store.journal.some((j) => j.isDaily && j.date === entryDate))
          return { status: "conflict" };
        const now = Date.now();
        const id = createId("journal");
        store.addJournal({
          id,
          title,
          content,
          date: entryDate,
          isDaily,
          linkKey: isDaily ? entryDate : title,
          createdAt: now,
          updatedAt: now,
        });
        return ok({ id });
      }
      default:
        return { status: "invalid" };
    }
  } catch (error) {
    // Input validation is deliberately distinct from a persistence failure after dispatch.
    if (error instanceof InvalidArguments) return { status: "invalid" };
    return { status: "unknown" };
  }
}
