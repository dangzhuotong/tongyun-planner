import { invoke } from "@tauri-apps/api/core";
import { getLocalSyncData, sanitizeConfigForSync } from "./types";
import { safeJsonParse } from "../json";

/** 自动每日快照保留的最大天数 */
export const DAILY_SNAPSHOT_KEEP = 14;
/** 同步冲突备份（backups/conflicts）不做按天轮转，只限制总数，避免长期堆积 */
export const CONFLICT_BACKUP_KEEP = 100;

/** 快照元数据条目 */
export interface DailySnapshotItem {
  name: string;
  size: number;
  modifiedMs: number;
}

/** 检测当前是否处于 Tauri 桌面端运行环境 */
const isTauri = (): boolean =>
  typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

/**
 * 根据传入的本地时间生成快照文件名。
 * 格式："tongyun-daily-YYYY-MM-DD.json"（本地日期，补零纯函数）
 */
export function dailySnapshotFileName(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `tongyun-daily-${year}-${month}-${day}.json`;
}

/**
 * 构建快照数据 Payload（手动“导出快照”与每日快照共用；每日快照额外带 snapshotType: "daily"）。
 * 安全底线：严禁包含任何敏感密钥（通过 sanitizeConfigForSync 彻底剥离）。
 */
export function buildSnapshotPayload(now = new Date(), snapshotType?: "daily"): Record<string, unknown> {
  const sync = getLocalSyncData();
  return {
    ...sync,
    customizationConfig: sanitizeConfigForSync(sync.customizationConfig),
    aiPraise: safeJsonParse<string[]>(
      typeof localStorage !== "undefined" ? localStorage.getItem("tongyun_ai_praise") : null,
      []
    ),
    exportedAt: now.toISOString(),
    ...(snapshotType ? { snapshotType } : {}),
  };
}

/**
 * 确保当日已保存一份本地自动快照。
 * - 仅在 Tauri 桌面端运行（否则返回 null）
 * - 若当日已有快照记录（通过 localStorage 标记），则跳过返回 null
 * - 若用户数据完全为空（待办、已完成、便签、番茄钟、倒计时、日记均为空），则跳过返回 null
 * - 成功写入后自动保留最近 14 天（local_backup_prune），更新标记并返回绝对文件路径
 * - 绝对不向外抛出异常（内部 catch 记录警告后返回 null）
 */
export async function ensureDailySnapshot(now = new Date()): Promise<string | null> {
  if (!isTauri()) return null;

  try {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const todayStr = `${year}-${month}-${day}`;

    // 检查今日是否已备份过
    if (typeof localStorage !== "undefined") {
      const lastSnapshot = localStorage.getItem("tongyun_last_daily_snapshot");
      if (lastSnapshot === todayStr) {
        return null;
      }
    }

    // 检查用户数据是否全空（6 维主要数据分类均为空时跳过）
    const syncData = getLocalSyncData();
    const hasUserData =
      (syncData.tasks && syncData.tasks.length > 0) ||
      (syncData.completedTasks && syncData.completedTasks.length > 0) ||
      (syncData.stickyNotes && syncData.stickyNotes.length > 0) ||
      (syncData.pomodoroLogs && syncData.pomodoroLogs.length > 0) ||
      (syncData.countdowns && syncData.countdowns.length > 0) ||
      (syncData.journal && syncData.journal.length > 0);

    if (!hasUserData) {
      return null;
    }

    const fileName = dailySnapshotFileName(now);
    const payload = buildSnapshotPayload(now, "daily");
    const content = JSON.stringify(payload, null, 2);

    // 写入本地备份
    const filePath = await invoke<string>("local_backup_write", {
      kind: "daily",
      fileName,
      content,
    });

    // 修剪历史快照，保留最近 14 天
    await invoke<number>("local_backup_prune", {
      kind: "daily",
      keep: DAILY_SNAPSHOT_KEEP,
    });
    await invoke<number>("local_backup_prune", {
      kind: "conflicts",
      keep: CONFLICT_BACKUP_KEEP,
    }).catch(() => 0);

    // 记录今日备份标记
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("tongyun_last_daily_snapshot", todayStr);
    }

    return filePath;
  } catch (err) {
    console.warn("[localSnapshots] ensureDailySnapshot error:", err);
    return null;
  }
}

/** 获取每日快照列表（按修改时间倒序排列，非 Tauri 环境返回空数组） */
export async function listDailySnapshots(): Promise<DailySnapshotItem[]> {
  if (!isTauri()) return [];
  try {
    return await invoke<DailySnapshotItem[]>("local_backup_list", {
      kind: "daily",
    });
  } catch (err) {
    console.warn("[localSnapshots] listDailySnapshots error:", err);
    return [];
  }
}

/** 读取指定每日快照文件的 JSON 字符串（非 Tauri 环境返回 null） */
export async function readDailySnapshot(name: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("local_backup_read", {
      kind: "daily",
      fileName: name,
    });
  } catch (err) {
    console.warn("[localSnapshots] readDailySnapshot error:", err);
    return null;
  }
}

/** 获取本地备份根目录绝对路径（非 Tauri 环境返回 null） */
export async function getBackupDir(): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<string>("local_backup_dir");
  } catch (err) {
    console.warn("[localSnapshots] getBackupDir error:", err);
    return null;
  }
}
