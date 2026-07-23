export type TaskCategory =
  | "urgent-important"
  | "urgent-not-important"
  | "important-not-urgent"
  | "not-urgent-not-important";

export type RepeatType = "daily" | "weekly" | "monthly" | "none" | string;

export type TaskPriority = "high" | "medium" | "low";

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
  repeat?: RepeatType;
  priority?: TaskPriority;
  subtasks?: SubTask[];
  tags?: string[];
  dependsOn?: string[];  // task IDs that must be completed first
  attachments?: Attachment[];
  journalId?: string;    // 关联自某篇日记（addToTodo 时创建）
  /** 完成时刻（ms）；撤销完成时清除。旧数据可能缺失 */
  completedAt?: number;
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
  content: string;       // markdown 源文，支持 [[双向链接]] 与 #标签
  date: string;          // YYYY-MM-DD（日记 = linkKey；笔记 = 创建日期）
  isDaily: boolean;      // 是否为日期日记（自动按日归档）
  templateId?: string;
  /** 当日心情 emoji（仅日记常用），如 😊 */
  mood?: string;
  aiComment?: string;    // AI 生成的温柔评语
  createdAt: number;
  updatedAt: number;
}

export interface JournalTemplate {
  id: string;
  name: string;
  content: string;
}

export type AlertSoundType = "beep" | "cuckoo" | "meow" | "chime" | "ding" | "phone" | "marimba" | "bells" | "alarm";

export type AppTab = "home" | "matrix" | "list" | "calendar" | "notes" | "analytics" | "completed" | "countdown" | "settings" | "tasks" | "focus" | "archive" | "news" | "gantt" | "journal" | "memory";

export interface CountdownEvent {
  id: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  emoji?: string;
  color?: string;
  isLunar?: boolean;   // 是否为农历生日/农历倒计时
}

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
  aiProvider?: "openai" | "anthropic";
  aiApiKey?: string;
  aiEndpoint?: string;
  aiModel?: string;
  aiAutoCategorize?: boolean;
  journalCommentPrompt?: string; // 暖评自定义系统提示词（留空则用内置默认）
  enableAutoBackup?: boolean;
  syncInterval?: number; // seconds: 15, 30, 60, 300, 900, 1800, 3600, 0(manual)
}

export interface TimeBlock {
  id: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:mm
  endTime: string;     // HH:mm
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

