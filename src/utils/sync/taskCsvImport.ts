import type { Task } from "../../types";

function parseRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const finish = () => {
    rows.push([...row, cell]);
    row = [];
    cell = "";
  };
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else cell += char;
    } else if (!quoted && char === ",") {
      row.push(cell);
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      finish();
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 引号未闭合");
  if (row.length || cell) finish();
  return rows;
}

export async function previewTaskCsv(text: string) {
  if (text.length > 5 * 1024 * 1024) throw new Error("CSV 文件最大 5 MB");
  const rows = parseRows(text.replace(/^\uFEFF/, ""));
  const headers = (row: string[]) =>
    row.map((item) => item.trim().toLowerCase().replace(/_/g, " "));
  const index = rows.findIndex((row) =>
    headers(row).some((item) => ["title", "content", "标题", "任务标题"].includes(item)),
  );
  if (index < 0) throw new Error("CSV 缺少任务标题列");
  const columns = headers(rows[index]);
  const items: Task[] = [];
  let skipped = 0;
  const duplicates = new Map<string, number>();
  for (const row of rows.slice(index + 1)) {
    if (!row.some((value) => value.trim())) continue;
    const read = (...aliases: string[]) => {
      const index = columns.findIndex((column) => aliases.includes(column));
      return (row[index] || "").trim();
    };
    const type = read("type");
    const title = read("title", "content", "标题", "任务标题");
    if (!title || (type && type.toLowerCase() !== "task")) {
      skipped++;
      continue;
    }
    const rawDate = read("due date", "date", "截止日期");
    const date = /^(\d{4}-\d{2}-\d{2})(?:[ T]((?:[01]\d|2[0-3]):[0-5]\d))?/.exec(rawDate);
    const dateValue = date?.[1] && new Date(`${date[1]}T00:00:00Z`);
    const validDate =
      dateValue &&
      Number.isFinite(dateValue.getTime()) &&
      dateValue.toISOString().slice(0, 10) === date?.[1];
    const status = read("status", "completed", "状态").toLowerCase();
    const complete = ["true", "1", "2", "done", "completed", "已完成"].includes(status);
    const rawCompleted = read("completed time", "completed at", "completion date");
    const completedAt = rawCompleted ? Date.parse(rawCompleted) : NaN;
    const project = read("project", "list name", "list", "项目") || undefined;
    const description = read("description", "描述") || undefined;
    const tags = read("tags", "labels", "标签")
      .split(/[,;，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    const sourceId = read("id", "task id");
    const identity = JSON.stringify(
      sourceId
        ? [columns.includes("type") ? "todoist" : "ticktick", sourceId]
        : [title, project, rawDate, description, tags],
    );
    const occurrence = (duplicates.get(identity) ?? 0) + 1;
    duplicates.set(identity, occurrence);
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${identity}:${occurrence}`),
    );
    const id =
      "csv-" +
      Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
    items.push({
      id,
      title,
      project,
      description,
      category: "important-not-urgent",
      dueDate: validDate ? date?.[1] : undefined,
      dueTime: validDate ? date?.[2] : undefined,
      tags: tags.length ? tags : undefined,
      completedAt: complete ? (Number.isFinite(completedAt) ? completedAt : Date.now()) : undefined,
    });
  }
  if (!items.length) throw new Error("CSV 中没有可导入的任务");
  return { items, skipped };
}
