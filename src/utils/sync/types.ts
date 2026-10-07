import type { Task, StickyNote, PomodoroLog, CountdownEvent, CustomizationConfig, JournalEntry } from "../../types";

export interface SyncData {
  version: number;
  tasks: Task[];
  completedTasks: Task[];
  stickyNotes: StickyNote[];
  pomodoroLogs: PomodoroLog[];
  countdowns: CountdownEvent[];
  customizationConfig: CustomizationConfig | null;
  journal: JournalEntry[];
}

export type SyncBackendType = "webdav" | "none";

/** Keys matching each slice of SyncData that gets its own file on WebDAV */
export type SyncCategory =
  | "tasks"
  | "completedTasks"
  | "stickyNotes"
  | "pomodoroLogs"
  | "countdowns"
  | "journal"     // daily notes + linked notes
  | "config";     // customizationConfig

export const ALL_SYNC_CATEGORIES: SyncCategory[] = [
  "tasks", "completedTasks", "stickyNotes", "pomodoroLogs",
  "countdowns", "journal", "config",
];

/** Pull 时的处理顺序：completedTasks 必须在 tasks 之前，确保 tasks 去重时已完成列表已就位 */
export const PULL_CATEGORY_ORDER: SyncCategory[] = [
  "completedTasks",
  "tasks",
  "stickyNotes",
  "pomodoroLogs",
  "countdowns",
  "journal",
  "config",
];

/** Remote filename for each category */
export const SYNC_CATEGORY_FILES: Record<SyncCategory, string> = {
  tasks: "tasks.json",
  completedTasks: "completed.json",
  stickyNotes: "notes.json",
  pomodoroLogs: "pomodoro.json",
  countdowns: "countdowns.json",
  journal: "journal.json",
  config: "config.json",
};

export interface SyncManifestEntry {
  version: number;   // timestamp of last change
  size?: number;     // byte length, informational
}

export type SyncManifest = Record<SyncCategory, SyncManifestEntry>;

export interface SyncBackendConfig {
  type: SyncBackendType;
  webdav?: { url: string; username: string; password?: string };
}

export interface SyncConflict {
  category: SyncCategory;
  fileName: string;
  remoteContent: string;
  remotePayload: unknown;
  remoteFingerprint: string | null;
  remoteManifestVersion: number;
  backupPaths: string[];
}

export interface SyncProvider {
  readonly type: SyncBackendType;
  readonly displayName: string;
  isConfigured(): boolean;
  test(): Promise<boolean>;
  push(data: SyncData, dirtyOnly?: Set<SyncCategory>): Promise<{ conflicts: SyncConflict[] } | void>;
  pull(dirtyOnly?: Set<SyncCategory>): Promise<SyncData | null>;
}

export const SYNC_APPLIED_EVENT = "tongyun-sync-applied";

export function getLocalSyncVersion(): number {
  return parseInt(localStorage.getItem("tongyun_sync_version") || "0", 10);
}

/** 本地数据变更时调用，递增版本号供冲突比较 */
export function bumpSyncVersion(): number {
  const v = Date.now();
  localStorage.setItem("tongyun_sync_version", String(v));
  return v;
}

/* ── Per-category local version tracking ── */

const CAT_VERSION_PREFIX = "tongyun_cat_ver_";

/** Get the local version stamp for a single category */
export function getLocalCategoryVersion(cat: SyncCategory): number {
  return parseInt(localStorage.getItem(CAT_VERSION_PREFIX + cat) || "0", 10);
}

/** Bump the local version stamp for one or more categories */
export function bumpCategoryVersion(...cats: SyncCategory[]): number {
  const v = Date.now();
  for (const cat of cats) {
    localStorage.setItem(CAT_VERSION_PREFIX + cat, String(v));
  }
  // Also bump global version for backward compat
  localStorage.setItem("tongyun_sync_version", String(v));
  return v;
}

/** Build the local manifest from per-category version stamps */
export function getLocalManifest(): SyncManifest {
  const m = {} as SyncManifest;
  for (const cat of ALL_SYNC_CATEGORIES) {
    m[cat] = { version: getLocalCategoryVersion(cat) };
  }
  return m;
}

const SECRET_SUFFIXES = [
  "apikey",
  "apikeys",
  "secret",
  "secrets",
  "password",
  "passwd",
  "token",
  "accesstoken",
  "refreshtoken",
];

/**
 * 判断配置字段键名是否为敏感密钥字段。
 * 针对 aiApiKey、providerApiKeys，以及去除了 '-' 和 '_' 且小写化后以指定后缀结尾的字段。
 * 注意：aiMaxTokens 以 "tokens" 结尾，不属于 secret。
 */
export function isSecretConfigKey(key: string): boolean {
  if (key === "aiApiKey" || key === "providerApiKeys" || key === "smtpPass") return true;
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  return SECRET_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * 从配置对象中剥离所有敏感的 API Key / Token / Password 字段。
 * 返回浅拷贝，保留 null / undefined 直通行为。
 * 密钥只保存在本机，不上传至任何云端存储（如 WebDAV），也不包含在快照导出文件中。
 */
export function sanitizeConfigForSync<T extends object | null | undefined>(config: T): T {
  if (!config || typeof config !== "object") return config;
  const sanitized = { ...config } as Record<string, unknown>;
  for (const key of Object.keys(sanitized)) {
    if (isSecretConfigKey(key)) {
      delete sanitized[key];
    }
  }
  return sanitized as T;
}

/**
 * 将传入的远端/导入配置与本地敏感密钥安全合并。
 * 远端/导入配置中的所有 secret key 会被清除，若本地存在 secret key 则将其复制回来。
 * 当本地没有时，aiApiKey 默认回退为 ""，providerApiKeys 默认回退为 {}，保持类型有效。
 */
export function withLocalSecrets<T extends object>(
  incoming: T,
  local: object | null | undefined
): T {
  const result = { ...incoming } as Record<string, unknown>;

  // 1. 移除 incoming 中所有 secret key
  for (const key of Object.keys(result)) {
    if (isSecretConfigKey(key)) {
      delete result[key];
    }
  }

  // 2. 将 local 中的 secret key（若存在）复制回来
  const localRecord = local && typeof local === "object" ? (local as Record<string, unknown>) : null;
  if (localRecord) {
    for (const key of Object.keys(localRecord)) {
      if (isSecretConfigKey(key) && localRecord[key] !== undefined) {
        result[key] = localRecord[key];
      }
    }
  }

  // 3. 保持现有默认行为：当 local 中没有时，aiApiKey 回退为空字符串，providerApiKeys 回退为空对象
  result.aiApiKey = (localRecord?.aiApiKey as string) || "";
  result.providerApiKeys = (localRecord?.providerApiKeys as Record<string, string>) || {};

  return result as T;
}

/** Extract a single category's payload from SyncData */
export function getCategoryPayload(data: SyncData, cat: SyncCategory): unknown {
  switch (cat) {
    case "tasks":          return data.tasks;
    case "completedTasks": return data.completedTasks;
    case "stickyNotes":    return data.stickyNotes;
    case "pomodoroLogs":   return data.pomodoroLogs;
    case "countdowns":     return data.countdowns;
    case "journal":        return data.journal;
    case "config":         return sanitizeConfigForSync(data.customizationConfig);
  }
}

/**
 * 判断某分类 payload 是否「空到不该盖远端」。
 * 数组：length===0；config：无对象或键值为空。
 */
export function isEffectivelyEmptyCategory(cat: SyncCategory, payload: unknown): boolean {
  if (cat === "config") {
    if (!payload || typeof payload !== "object") return true;
    return Object.keys(payload).length === 0;
  }
  return !Array.isArray(payload) || payload.length === 0;
}

/**
 * 判断 tasks 是否「全是启动示例任务」。
 * 真实任务 id 由 createId 生成（UUID / 时间戳随机串），示例任务 id 为纯短数字。
 * 开发机/换机启动会塞入示例任务，它不是空数组，需单独识别，避免盖掉远端真实数据。
 */
export function isSampleTasksOnly(payload: unknown): boolean {
  if (!Array.isArray(payload) || payload.length === 0) return false;
  return payload.every(
    (t) => t && typeof t === "object" && /^\d{1,3}$/.test(String((t as Task).id ?? ""))
  );
}

/**
 * 本地空、远端非空时禁止覆盖。
 * - config：合并时剥离敏感 Key，远端与本地配置安全合并。
 * - journal：始终保护（清空整本日记极少且高风险）。
 * - 其余数组分类（tasks/completedTasks/stickyNotes/pomodoroLogs/countdowns）：
 *   仅当「非用户主动改动」时保护。用户主动清空（isUserDirty）允许同步删除；
 *   而启动期版本戳错乱导致的空/示例本地不得盖掉远端真实数据。
 */
export function protectAgainstEmptyOverwrite(
  cat: SyncCategory,
  localPayload: unknown,
  remotePayload: unknown,
  isUserDirty = false
): { skip: boolean; mergedLocal?: unknown } {
  if (cat === "config") {
    if (!isEffectivelyEmptyCategory(cat, localPayload)) return { skip: false };
    if (isEffectivelyEmptyCategory(cat, remotePayload)) return { skip: false };
    if (localPayload && typeof localPayload === "object" && remotePayload && typeof remotePayload === "object") {
      const local = localPayload as CustomizationConfig;
      const remote = remotePayload as CustomizationConfig;
      const merged: CustomizationConfig = {
        ...remote,
        ...local,
        aiEndpoint: local.aiEndpoint || remote.aiEndpoint,
        aiModel: local.aiModel || remote.aiModel,
        aiProvider: local.aiProvider || remote.aiProvider,
      };
      return { skip: false, mergedLocal: sanitizeConfigForSync(merged) };
    }
    return { skip: true };
  }

  // 用户主动改动的分类（含主动清空）尊重本地，允许同步删除
  if (cat !== "journal" && isUserDirty) {
    return { skip: false };
  }

  // 本地「空」或「仅含启动示例任务」都视为无真实数据，不得盖远端
  const localBlank =
    isEffectivelyEmptyCategory(cat, localPayload) ||
    (cat === "tasks" && isSampleTasksOnly(localPayload));
  if (!localBlank) {
    return { skip: false };
  }
  if (isEffectivelyEmptyCategory(cat, remotePayload)) {
    return { skip: false }; // 两边都空，推不推都行
  }
  return { skip: true };
}

/**
 * 远程优先 + 本地补充 合并。
 * 核心策略：远端有的条目直接覆盖本地同 id；
 * 远端没有但本地有的条目保留（push 时自然会推上去）。
 * config 特殊处理：按字段级合并，保留本地 API Key 不被覆盖。
 */
export function mergeRemoteIntoLocal(
  cat: SyncCategory,
  remotePayload: unknown,
  localPayload: unknown
): unknown {
  if (cat === "config") {
    const remote = remotePayload ? (remotePayload as Record<string, unknown>) : null;
    const local = localPayload ? (localPayload as Record<string, unknown>) : null;
    if (!remote) return local;
    if (!local) return withLocalSecrets(remote, null);
    // config 按字段合并：远端为主，但本地 Key 优先保留
    return withLocalSecrets({ ...local, ...remote }, local);
  }

  // 数组分类：按 id 合并
  type HasId = { id: string };
  const remoteArr = (remotePayload as HasId[]) || [];
  const localArr = (localPayload as HasId[]) || [];

  const merged = new Map<string, unknown>();
  // 先放本地（保证本地独有的条目保留）
  for (const item of localArr) {
    if (item && item.id) merged.set(item.id, item);
  }
  // 远端覆盖同 id（远端优先）
  for (const item of remoteArr) {
    if (item && item.id) merged.set(item.id, item);
  }

  return Array.from(merged.values());
}

/** Apply a single category's payload into localStorage */
export function applyCategoryPayload(cat: SyncCategory, payload: unknown): void {
  switch (cat) {
    case "tasks": {
      const localCompleted = readJson<Task[]>("aero_completed_todos", "[]");
      const { tasks } = mergeCompletedPreferLocal(
        (payload as Task[]) || [],
        localCompleted,
        localCompleted
      );
      localStorage.setItem("aero_todos", JSON.stringify(tasks));
      break;
    }
    case "completedTasks": {
      const localCompleted = readJson<Task[]>("aero_completed_todos", "[]");
      const active = readJson<Task[]>("aero_todos", "[]");
      const { tasks, completedTasks } = mergeCompletedPreferLocal(
        active,
        (payload as Task[]) || [],
        localCompleted
      );
      localStorage.setItem("aero_todos", JSON.stringify(tasks));
      localStorage.setItem("aero_completed_todos", JSON.stringify(completedTasks));
      break;
    }
    case "stickyNotes":
      localStorage.setItem("aero_sticky_notes", JSON.stringify(payload));
      break;
    case "pomodoroLogs":
      localStorage.setItem("aero_pomodoro_logs", JSON.stringify(payload));
      break;
    case "countdowns":
      localStorage.setItem("tongyun_countdowns", JSON.stringify(payload));
      break;
    case "config":
      if (payload && typeof payload === "object") {
        const local = readJson<CustomizationConfig | null>("aero_customization_config", "null");
        const merged = withLocalSecrets(payload as CustomizationConfig, local);
        localStorage.setItem("aero_customization_config", JSON.stringify(merged));
      }
      break;
    case "journal":
      localStorage.setItem("tongyun_journal", JSON.stringify(payload || []));
      break;
  }
}

function readJson<T>(key: string, fallback: string): T {
  const v = localStorage.getItem(key);
  try {
    return v ? JSON.parse(v) : JSON.parse(fallback);
  } catch {
    return JSON.parse(fallback);
  }
}

/** 从活动任务列表里剔除已存在于 completed 中的任务，保证「已完成」不会重复出现在待办里 */
export function dedupeActiveTasks(tasks: Task[], completed: Task[]): Task[] {
  if (!completed || completed.length === 0) return tasks;
  const doneIds = new Set(completed.map(t => t.id));
  return tasks.filter(t => !doneIds.has(t.id));
}

/**
 * 完成态优先合并：任一侧已在 completed 的 id，最终进入 completed，并从 active 剔除。
 * 用于 pull 后交叉去重，防止远端更高 version 的 tasks.json 把已完成任务写回活动列表。
 */
export function mergeCompletedPreferLocal(
  active: Task[],
  remoteCompleted: Task[],
  localCompleted: Task[]
): { tasks: Task[]; completedTasks: Task[] } {
  const byId = new Map<string, Task>();
  for (const t of remoteCompleted || []) byId.set(t.id, t);
  for (const t of localCompleted || []) byId.set(t.id, t); // local wins on field conflicts
  const completedTasks = Array.from(byId.values());
  const tasks = dedupeActiveTasks(active || [], completedTasks);
  return { tasks, completedTasks };
}

/** 将 localStorage 中的 tasks / completed 交叉去重并写回（pull 部分更新后调用） */
export function reconcileTasksAndCompleted(): void {
  const active = readJson<Task[]>("aero_todos", "[]");
  const remoteOrLocalCompleted = readJson<Task[]>("aero_completed_todos", "[]");
  const { tasks, completedTasks } = mergeCompletedPreferLocal(
    active,
    remoteOrLocalCompleted,
    remoteOrLocalCompleted
  );
  localStorage.setItem("aero_todos", JSON.stringify(tasks));
  localStorage.setItem("aero_completed_todos", JSON.stringify(completedTasks));
}

export function getLocalSyncData(): SyncData {
  const completedTasks = readJson<Task[]>("aero_completed_todos", "[]");
  const tasks = dedupeActiveTasks(readJson<Task[]>("aero_todos", "[]"), completedTasks);
  return {
    version: getLocalSyncVersion(),
    tasks,
    completedTasks,
    stickyNotes: readJson("aero_sticky_notes", "[]"),
    pomodoroLogs: readJson("aero_pomodoro_logs", "[]"),
    countdowns: readJson("tongyun_countdowns", "[]"),
    customizationConfig: (() => {
      const v = localStorage.getItem("aero_customization_config");
      return v ? JSON.parse(v) : null;
    })(),
    journal: readJson("tongyun_journal", "[]"),
  };
}

/** 兼容旧版 WebDAV 备份格式（App.tsx 曾使用的 timestamp 字段） */
export function normalizeSyncData(raw: unknown): SyncData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.tasks)) return null;

  const version =
    typeof obj.version === "number"
      ? obj.version
      : typeof obj.timestamp === "number"
        ? obj.timestamp
        : 0;

  const completedTasks = (obj.completedTasks as Task[]) || [];
  const tasks = dedupeActiveTasks(obj.tasks as Task[], completedTasks);

  return {
    version,
    tasks,
    completedTasks,
    stickyNotes: (obj.stickyNotes as StickyNote[]) || [],
    pomodoroLogs: (obj.pomodoroLogs as PomodoroLog[]) || [],
    countdowns: (obj.countdowns as CountdownEvent[]) || [],
    customizationConfig: (obj.customizationConfig as CustomizationConfig) || null,
    journal: (obj.journal as JournalEntry[]) || [],
  };
}

export function applySyncData(data: SyncData): void {
  const localCompleted = readJson<Task[]>("aero_completed_todos", "[]");
  const { tasks, completedTasks } = mergeCompletedPreferLocal(
    data.tasks,
    data.completedTasks || [],
    localCompleted
  );
  localStorage.setItem("aero_todos", JSON.stringify(tasks));
  localStorage.setItem("aero_completed_todos", JSON.stringify(completedTasks));
  localStorage.setItem("aero_sticky_notes", JSON.stringify(data.stickyNotes));
  localStorage.setItem("aero_pomodoro_logs", JSON.stringify(data.pomodoroLogs));
  localStorage.setItem("tongyun_countdowns", JSON.stringify(data.countdowns));
  if (data.customizationConfig) {
    const local = readJson<CustomizationConfig | null>("aero_customization_config", "null");
    const merged = withLocalSecrets(data.customizationConfig, local);
    localStorage.setItem("aero_customization_config", JSON.stringify(merged));
  }
  localStorage.setItem("tongyun_journal", JSON.stringify(data.journal || []));
  localStorage.setItem("tongyun_sync_version", String(data.version));
  localStorage.setItem("tongyun_last_updated", String(Date.now()));

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, {
      detail: { ...data, tasks, completedTasks },
    }));
  }
}
