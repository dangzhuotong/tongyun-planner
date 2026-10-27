import type { TaskCategory } from "../types";
import { addLocalDays, getLocalDateString } from "./date";

export interface ParsedCapture {
  type: "task" | "note" | "journal";
  content: string;
  category?: TaskCategory;
  tags?: string[];
  dueDate?: string;
}

/** 解析极速捕捉胶囊的输入内容 */
export function parseQuickCaptureInput(
  rawText: string,
  todayStr: string = getLocalDateString(),
): ParsedCapture {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { type: "task", content: "" };
  }

  // 1. 判断是否为便签前缀
  if (
    trimmed.startsWith("//") ||
    trimmed.startsWith("memo:") ||
    trimmed.startsWith("便签：") ||
    trimmed.startsWith("便签:")
  ) {
    const content = trimmed.replace(/^(\/\/|memo:|便签：|便签:)\s*/i, "");
    return { type: "note", content };
  }

  // 2. 判断是否为日记随笔前缀
  if (
    trimmed.startsWith("..") ||
    trimmed.startsWith("diary:") ||
    trimmed.startsWith("日记：") ||
    trimmed.startsWith("日记:")
  ) {
    const content = trimmed.replace(/^(\.\.|diary:|日记：|日记:)\s*/i, "");
    return { type: "journal", content };
  }

  // 3. 待办任务解析（提取标签、象限、日期）
  let cleanTitle = trimmed;
  let category: TaskCategory = "urgent-important";
  const tags: string[] = [];
  let dueDate: string | undefined = undefined;

  // 提取 #标签
  const tagMatches = cleanTitle.match(/#[^\s#]+/g);
  if (tagMatches) {
    tagMatches.forEach((m) => {
      tags.push(m.slice(1));
    });
    cleanTitle = cleanTitle.replace(/#[^\s#]+/g, "").trim();
  }

  // 提取象限优先级标记 (!1, !重要, !紧急, !2, !3, !4)
  if (
    cleanTitle.includes("!重要紧急") ||
    cleanTitle.includes("!1") ||
    cleanTitle.includes("!紧急")
  ) {
    category = "urgent-important";
    cleanTitle = cleanTitle.replace(/!(重要紧急|1|紧急)/g, "").trim();
  } else if (
    cleanTitle.includes("!重要不紧急") ||
    cleanTitle.includes("!2") ||
    cleanTitle.includes("!重要")
  ) {
    category = "important-not-urgent";
    cleanTitle = cleanTitle.replace(/!(重要不紧急|2|重要)/g, "").trim();
  } else if (cleanTitle.includes("!紧急不重要") || cleanTitle.includes("!3")) {
    category = "urgent-not-important";
    cleanTitle = cleanTitle.replace(/!(紧急不重要|3)/g, "").trim();
  } else if (cleanTitle.includes("!不重要不紧急") || cleanTitle.includes("!4")) {
    category = "not-urgent-not-important";
    cleanTitle = cleanTitle.replace(/!(不重要不紧急|4)/g, "").trim();
  }

  // 提取日期 (@今天, @明天, @YYYY-MM-DD)
  if (cleanTitle.includes("@今天")) {
    dueDate = todayStr;
    cleanTitle = cleanTitle.replace(/@今天/g, "").trim();
  } else if (cleanTitle.includes("@明天")) {
    dueDate = addLocalDays(todayStr, 1);
    cleanTitle = cleanTitle.replace(/@明天/g, "").trim();
  } else {
    const dateMatch = cleanTitle.match(/@(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      dueDate = dateMatch[1];
      cleanTitle = cleanTitle.replace(/@\d{4}-\d{2}-\d{2}/, "").trim();
    }
  }

  return {
    type: "task",
    content: cleanTitle || trimmed,
    category,
    tags: tags.length > 0 ? tags : undefined,
    dueDate,
  };
}
