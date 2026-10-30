import type { HolidayRegion } from "./utils/holiday/types";

export type TaskCategory =
  "urgent-important" | "urgent-not-important" | "important-not-urgent" | "not-urgent-not-important";

export type RepeatType = "daily" | "weekly" | "monthly" | "none";

export type TaskPriority = "high" | "medium" | "low";

export type AssigneeKind = "human" | "agent";
export type TaskRunStatus = "queued" | "running" | "done" | "failed" | "cancelled" | "blocked";
export type AgentKind = "local_runner" | "pipeline_bridge" | "manual";

export interface DomainAgent {
  id: string;
  handle: string;
  kind: AgentKind;
  enabled: boolean;
  meta?: Record<string, unknown> | string;
  updatedAt: number;
}

export interface DomainTaskDispatch {
  id: string;
  taskId: string;
  agentId: string;
  status: TaskRunStatus;
  note?: string;
  pipelineTaskId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  path: string;
  type: string;
  size: number;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  notes?: string;
  category: TaskCategory;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:mm (e.g. "14:30")
  isFavorite?: boolean;
  isPinned?: boolean;
  repeat?: string;
  /** 每月重复的锚定日（1–31）。短月钳到月末后，下一次仍回到这一天。旧数据缺失时按当前 dueDate 的日计算。 */
  repeatAnchorDay?: number;
  priority?: TaskPriority;
  subtasks?: SubTask[];
  tags?: string[];
  dependsOn?: string[]; // task IDs that must be completed first
  attachments?: Attachment[];
  journalId?: string; // 关联自某篇日记（addToTodo 时创建）
  /** 完成时刻（ms）；撤销完成时清除。旧数据可能缺失 */
  completedAt?: number;
  /** 预估番茄数（目标），可选 */
  estimatedPomodoros?: number;
  /** 精力消耗等级（昼夜潮汐匹配）：高能攻坚 / 常规平稳 / 轻量碎片 */
  energyLevel?: "high" | "medium" | "low";
  /** 任务完成时加盖的复古朱砂印章 */
  stamp?: string;
  /** 时间盒区间 (HH:mm) */
  timeBlock?: { start: string; end: string };
  /** 🌙 是否归入今晚清单 (Things 3 This Evening) */
  isEvening?: boolean;
  /** 负责人类型：自己 (human) | 本地 Agent (agent)，缺省为 human */
  assigneeKind?: AssigneeKind;
  /** 关联的本地 Agent ID（当 assigneeKind 为 agent 时非空） */
  assigneeAgentId?: string;
  /** AI 调度执行状态：queued | running | done | failed | cancelled | blocked。Agent 面板以公司库为准。 */
  runStatus?: TaskRunStatus;
  /** tongyun_pipeline.tasks.id。有它才算已经写进公司任务池。 */
  pipelineTaskId?: string;
  /** 更新时刻（ms） */
  updatedAt?: number;
}

export interface PomodoroLog {
  id: string;
  timestamp: number;
  duration: number;
  taskId?: string;
  taskTitle?: string;
}

export interface StickyNote {
  id: string;
  title?: string;
  text: string;
  color: string;
  rotate: number;
}

export interface JournalEntry {
  id: string;
  /** Wikilink target key：日记为日期 YYYY-MM-DD，笔记为标题原文（[[key]] 引用） */
  linkKey: string;
  title: string;
  content: string;
  date: string; // YYYY-MM-DD（日记 = linkKey；笔记 = 创建日期）
  isDaily: boolean; // 是否为日期日记（自动按日归档）
  templateId?: string;
  /** 当日心情 emoji（仅日记常用），如 😊 */
  mood?: string;
  aiComment?: string; // AI 生成的温柔评语
  /** 附件（图片等） */
  attachments?: Attachment[];
  /** 复古撕纸和纸胶带纹理 */
  washiTape?: string;
  /** 手帐手绘表情贴纸集合 */
  stickers?: Array<{ id: string; emoji: string; x: number; y: number }>;
  /** 复古朱砂印章 (done | great | pass | fast | super) */
  stamp?: string;
  createdAt: number;
  updatedAt: number;
}

export interface JournalTemplate {
  id: string;
  name: string;
  content: string;
}

export type AlertSoundType =
  "beep" | "cuckoo" | "meow" | "chime" | "ding" | "phone" | "marimba" | "bells" | "alarm";

export type AppTab =
  | "home"
  | "matrix"
  | "list"
  | "calendar"
  | "notes"
  | "analytics"
  | "completed"
  | "countdown"
  | "settings"
  | "tasks"
  | "focus"
  | "archive"
  | "news"
  | "gantt"
  | "journal"
  | "memory"
  | `plugin:${string}`;

export interface CountdownEvent {
  id: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  emoji?: string;
  color?: string;
  isLunar?: boolean; // 是否为农历生日/农历倒计时
}

export interface HabitItem {
  id: string;
  name: string;
  emoji: string;
  /** 今天是否已打卡（本地判定，跨天自动清除） */
  doneToday: boolean;
  /** 连续完成天数（不含今天） */
  streak: number;
  /** 最后打卡日期 YYYY-MM-DD */
  lastDoneDate?: string;
}

/** 默认习惯模板 */
export const DEFAULT_HABITS: Omit<HabitItem, "id" | "doneToday" | "streak">[] = [
  { name: "锻炼", emoji: "💪" },
  { name: "阅读", emoji: "📖" },
  { name: "冥想", emoji: "🧘" },
  { name: "早睡", emoji: "🌙" },
  { name: "喝水", emoji: "💧" },
];

export type Locale = "zh-CN" | "en";

export type WidgetView = "card" | "list" | "add" | "timer" | "notes";

export interface CustomizationConfig {
  qColors: {
    "urgent-important": string;
    "important-not-urgent": string;
    "urgent-not-important": string;
    "not-urgent-not-important": string;
  };
  cardBackground: "white" | "grid" | "lined" | "watercolor" | "doodle";
  pinType: "pin" | "tape" | "clip" | "heart" | "smiley";
  interfaceGlass?: "light" | "matte" | "solid";
  watercolorStyle?: "oasis" | "aurora" | "sunny" | "none";
  fontFamily?: "sans" | "rounded" | "serif";

  // Sunset Night Mode settings
  enableSunsetMode?: boolean;
  sunsetStartHour?: number;
  sunsetEndHour?: number;
  sunsetWarmth?: number; // 0 to 100

  // Celebration mode
  enableCelebration?: boolean;

  // Locale
  locale?: Locale;

  // Weather
  weatherCity?: string;

  // Theme preference
  darkMode?: "light" | "dark" | "auto";

  // AI Agent settings
  aiProvider?: "openai" | "anthropic" | "opencode" | "deepseek" | "ollama";
  providerApiKeys?: Record<string, string>; // 每个 Provider 独立的 API Key
  aiApiKey?: string; // 保留兼容旧版
  aiEndpoint?: string;
  aiModel?: string;
  aiAutoCategorize?: boolean;
  aiTemperature?: number; // 0-2, default 0.3
  aiMaxTokens?: number; // default 4096
  journalCommentPrompt?: string; // 暖评自定义系统提示词（留空则用内置默认）
  enableAutoBackup?: boolean;
  syncInterval?: number; // seconds: 15, 30, 60, 300, 900, 1800, 3600, 0(manual)
  /**
   * Opt-in sync of API keys and other secrets. Off by default.
   * When true, secrets are encrypted with a device-local passphrase before upload.
   * The passphrase is never stored in this object.
   */
  syncSecrets?: boolean;
  /** 日历是否显示中国法定节假日与调休补班标记（默认为 true） */
  calendarShowHolidays?: boolean;
  /** 日历节假日地区（cn=中国内地内置年表，hk=中国香港官方 iCal），默认为 cn */
  calendarHolidayRegion?: HolidayRegion;
  /** 自定义 iCal (.ics) 日历订阅地址（用于覆盖或补充节假日） */
  calendarIcalUrl?: string;
}

export interface TimeBlock {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  taskId?: string;
  title: string;
  color: string;
}

export interface WebDavConfig {
  url: string;
  username: string;
  password?: string;
}

export interface EmailConfig {
  smtpProvider: "qq" | "163" | "gmail" | "custom";
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  recipientEmail: string;
  enableRemindBefore: boolean;
  remindBeforeMinutes: number;
  enableDailyDigest: boolean;
  digestHour: number;
  digestMinute: number;
}
