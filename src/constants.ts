import type { TaskCategory, TaskPriority, JournalTemplate } from "./types";

export interface SelectOption<TValue extends string | number = string | number> {
  value: TValue;
  label: string;
}

export const PRIORITY_OPTIONS: SelectOption<TaskCategory>[] = [
  { value: "urgent-important", label: "I. 重要且紧急" },
  { value: "important-not-urgent", label: "II. 重要不紧急" },
  { value: "urgent-not-important", label: "III. 紧急不重要" },
  { value: "not-urgent-not-important", label: "IV. 不重要不紧急" },
];

export const PRIORITY_LEVELS: SelectOption<TaskPriority>[] = [
  { value: "high", label: "🔴 高" },
  { value: "medium", label: "🟡 中" },
  { value: "low", label: "🟢 低" },
];

export const PRIORITY_META: Record<TaskPriority, { label: string; dot: string; text: string }> = {
  high: { label: "高", dot: "bg-[#E8A0BF]", text: "text-[#A34E36]" },
  medium: { label: "中", dot: "bg-[#F0D58A]", text: "text-[#8B6E3C]" },
  low: { label: "低", dot: "bg-[#C4D7B2]", text: "text-[#4D7C5D]" },
};

export const FILTER_OPTIONS: SelectOption<TaskCategory | "all">[] = [
  { value: "all", label: "所有象限" },
  ...PRIORITY_OPTIONS,
];

export const CATEGORY_META: Record<TaskCategory, { label: string; dot: string; text: string }> = {
  "urgent-important": {
    label: "重要且紧急",
    dot: "bg-[#E8A0BF]",
    text: "text-[#A34E36]",
  },
  "important-not-urgent": {
    label: "重要不紧急",
    dot: "bg-[#C4D7B2]",
    text: "text-[#4D7C5D]",
  },
  "urgent-not-important": {
    label: "紧急不重要",
    dot: "bg-[#B2C8DF]",
    text: "text-[#5C528B]",
  },
  "not-urgent-not-important": {
    label: "不重要不紧急",
    dot: "bg-[#F5EBEB]",
    text: "text-[#8B6E3C]",
  },
};

export interface ColorConfig {
  bg: string;
  border: string;
  text: string;
  dot: string;
  accent: string;
  name: string;
}

export const PLANNER_COLORS: Record<string, ColorConfig> = {
  rose: {
    bg: "bg-[#FCF2F0]",
    border: "border-[#F5DFDB]",
    text: "text-[#A34E36]",
    dot: "bg-[#E8A0BF]",
    accent: "#A34E36",
    name: "蜜桃粉 (Rose)",
  },
  mint: {
    bg: "bg-[#F0F5F1]",
    border: "border-[#DEEAE2]",
    text: "text-[#4D7C5D]",
    dot: "bg-[#C4D7B2]",
    accent: "#4D7C5D",
    name: "抹茶绿 (Matcha)",
  },
  sky: {
    bg: "bg-[#EBF3F6]",
    border: "border-[#D0E2E8]",
    text: "text-[#366B80]",
    dot: "bg-[#B2C8DF]",
    accent: "#366B80",
    name: "天空蓝 (Sky)",
  },
  lavender: {
    bg: "bg-[#F3F2F7]",
    border: "border-[#E5E2EE]",
    text: "text-[#5C528B]",
    dot: "bg-[#9B7EC9]",
    accent: "#5C528B",
    name: "香芋紫 (Lavender)",
  },
  coral: {
    bg: "bg-[#FBECE5]",
    border: "border-[#F6DCD2]",
    text: "text-[#A64424]",
    dot: "bg-[#E57C58]",
    accent: "#A64424",
    name: "珊瑚橙 (Coral)",
  },
  yellow: {
    bg: "bg-[#FAF5ED]",
    border: "border-[#EFE5D3]",
    text: "text-[#8B6E3C]",
    dot: "bg-[#E0A934]",
    accent: "#8B6E3C",
    name: "甘菊黄 (Chamomile)",
  },
};

export interface DueCountdown {
  days: number;
  text: string;
  isOverdue: boolean;
  isToday: boolean;
}

export function getDueDateCountdown(dueDateStr?: string, dueTimeStr?: string): DueCountdown | null {
  if (!dueDateStr) return null;
  
  const parts = dueDateStr.split("-");
  if (parts.length !== 3) return null;
  
  const dueYear = parseInt(parts[0], 10);
  const dueMonth = parseInt(parts[1], 10) - 1;
  const dueDay = parseInt(parts[2], 10);
  
  const due = new Date(dueYear, dueMonth, dueDay);
  const today = new Date();
  
  if (dueTimeStr) {
    const timeParts = dueTimeStr.split(":");
    const hour = parseInt(timeParts[0], 10) || 0;
    const min = parseInt(timeParts[1], 10) || 0;
    due.setHours(hour, min, 0, 0);
    const now = new Date();
    const diffMs = due.getTime() - now.getTime();
    
    if (diffMs < 0) {
      const absDays = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
      return {
        days: absDays,
        text: absDays > 0 ? `已逾期 ${absDays} 天` : "已超时",
        isOverdue: true,
        isToday: false,
      };
    }
    // Same day check via calendar date comparison
    const isSameDay = dueYear === now.getFullYear() && dueMonth === now.getMonth() && dueDay === now.getDate();
    if (isSameDay) {
      return {
        days: 0,
        text: `今天 ${dueTimeStr}`,
        isOverdue: false,
        isToday: true,
      };
    }
    // Future date
    const calDiff = Math.floor((new Date(dueYear, dueMonth, dueDay).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (1000 * 60 * 60 * 24));
    return {
      days: calDiff,
      text: `还剩 ${calDiff} 天`,
      isOverdue: false,
      isToday: false,
    };
  }
  
  // Legacy: date only, midnight cutoff
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  
  const diffMs = due.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return {
      days: Math.abs(diffDays),
      text: `已逾期 ${Math.abs(diffDays)} 天`,
      isOverdue: true,
      isToday: false,
    };
  } else if (diffDays === 0) {
    return {
      days: 0,
      text: "今天到期",
      isOverdue: false,
      isToday: true,
    };
  } else {
    return {
      days: diffDays,
      text: `还剩 ${diffDays} 天`,
      isOverdue: false,
      isToday: false,
    };
  }
}

/** Journal 日记/双链笔记模板与辅助函数 */
export const JOURNAL_TEMPLATES: JournalTemplate[] = [
  {
    id: "blank",
    name: "空白页",
    content: "",
  },
  {
    id: "morning",
    name: "晨间页面",
    content:
      "# ☀️ 晨间页面\n\n## 今日三件要事\n- \n- \n- \n\n## 今日心情\n\n## 感恩的一件事\n- \n",
  },
  {
    id: "review",
    name: "每日复盘",
    content:
      "# 🌙 每日复盘\n\n## 今天完成了\n- \n\n## 没做完 / 待改进\n- \n\n## 明日计划\n- \n\n## 一句话总结\n\n",
  },
  {
    id: "weekly",
    name: "周回顾",
    content:
      "# 📅 周回顾\n\n## 本周亮点\n- \n\n## 本周卡点\n- \n\n## 下周重心\n- \n\n## 想记住的链接\n- [[#灵感]] \n",
  },
  {
    id: "free",
    name: "自由记录",
    content:
      "# 📝 自由记录\n\n",
  },
];

/** 从 editor 文本提取 #标签 集合 */
export function extractJournalTags(content: string): string[] {
  const tags = new Set<string>();
  const re = /#([\p{L}\p{N}_-]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    tags.add(m[1]);
  }
  return [...tags];
}

export interface NoiseDefinition {
  id: string;
  labelKey: string;    // i18n key suffix for short label (e.g. "brown" -> s.brown)
  titleKey: string;    // i18n key suffix for hover title (e.g. "brownTitle" -> s.brownTitle)
}

export const NOISE_DEFINITIONS: NoiseDefinition[] = [
  { id: "brown", labelKey: "brown", titleKey: "brownTitle" },
  { id: "pink", labelKey: "pink", titleKey: "pinkTitle" },
  { id: "ocean", labelKey: "ocean", titleKey: "oceanTitle" },
  { id: "rain", labelKey: "rain", titleKey: "rainTitle" },
  { id: "white", labelKey: "white", titleKey: "whiteTitle" },
  { id: "fire", labelKey: "fire", titleKey: "fireTitle" },
  { id: "stream", labelKey: "stream", titleKey: "streamTitle" },
  { id: "wind", labelKey: "wind", titleKey: "windTitle" },
  { id: "bell", labelKey: "bell", titleKey: "bellTitle" },
  { id: "pendulum", labelKey: "pendulum", titleKey: "pendulumTitle" },
  { id: "ring", labelKey: "ring", titleKey: "ringTitle" },
  { id: "fan", labelKey: "fan", titleKey: "fanTitle" },
  { id: "thunder", labelKey: "thunder", titleKey: "thunderTitle" },
];

export function getVisibleNoises(): string[] {
  const stored = localStorage.getItem("tongyun_visible_noises");
  if (stored) {
    try { return JSON.parse(stored); } catch { /* fall through */ }
  }
  return NOISE_DEFINITIONS.map((n) => n.id);
}

export function setVisibleNoises(ids: string[]): void {
  localStorage.setItem("tongyun_visible_noises", JSON.stringify(ids));
}

/** AI 象限分类默认 System Prompt */
export const DEFAULT_AI_CLASSIFY_PROMPT =
  "你是一个日程管理专家。你的任务是根据任务标题和细节描述，推断并返回适合的艾森豪威尔象限类别。请只返回以下四个英文标识符之一，不要包含任何标点符号、Markdown 格式、解释或多余的空格：\n- urgent-important\n- important-not-urgent\n- urgent-not-important\n- not-urgent-not-important";


