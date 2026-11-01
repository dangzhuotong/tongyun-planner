import type { LedgerEntry } from "../../types";
import { safeJsonParse } from "../json";
import { LEDGER_STORAGE_KEY, LEDGER_UPDATED_EVENT, normalizeLedgerEntries } from "./ledgerCore";

/** 读取本地记账条目（容错：脏数据被过滤） */
export function loadLedgerEntries(): LedgerEntry[] {
  if (typeof localStorage === "undefined") return [];
  const raw = safeJsonParse<unknown>(localStorage.getItem(LEDGER_STORAGE_KEY), []);
  return normalizeLedgerEntries(raw);
}

/** 写入本地记账条目（SQLite 镜像由 unifiedStorage 自动完成） */
export function saveLedgerEntries(entries: LedgerEntry[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
  notifyLedgerUpdated();
}

/** 广播记账变更，让日历视图与其它窗口刷新 */
export function notifyLedgerUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LEDGER_UPDATED_EVENT));
}

/**
 * 应用从外部快照/导入文件带来的记账条目。
 *
 * 语义与 aiPraise 一致：**字段缺失时不覆盖本地数据**。
 * 导入旧版本快照（没有 ledgerEntries 字段）不会清空本机已有的记账。
 *
 * @returns 是否实际写入了本地
 */
export function applyImportedLedgerEntries(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  if (!("ledgerEntries" in obj)) return false;
  if (!Array.isArray(obj.ledgerEntries)) return false;

  const entries = normalizeLedgerEntries(obj.ledgerEntries);
  if (typeof localStorage === "undefined") return false;
  localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(entries));
  notifyLedgerUpdated();
  return true;
}
