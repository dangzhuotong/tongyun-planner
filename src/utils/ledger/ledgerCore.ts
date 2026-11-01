import type { LedgerDirection, LedgerEntry } from "../../types";

/** 本地存储键：日历轻量记账条目（导出/导入快照同源） */
export const LEDGER_STORAGE_KEY = "tongyun_ledger_entries";

/** 记账变更广播事件：导入快照 / 跨窗口同步后由监听方刷新 */
export const LEDGER_UPDATED_EVENT = "tongyun-ledger-updated";

/** 金额上限：单笔 10 亿元，防御异常输入导致合计溢出 */
export const LEDGER_MAX_AMOUNT = 1_000_000_000;

/** 金额最小精度：分 */
const AMOUNT_PRECISION = 100;

export interface LedgerTotals {
  /** 收入合计（元） */
  income: number;
  /** 支出合计（元） */
  expense: number;
  /** 净额 = 收入 - 支出（元） */
  net: number;
  /** 未结算净额（元） */
  unsettledNet: number;
  /** 条目总数 */
  count: number;
  /** 未结算条目数 */
  unsettledCount: number;
  /** 当日是否存在条目 */
  hasEntries: boolean;
  /** 当日全部条目都已结算 */
  allSettled: boolean;
}

export const EMPTY_TOTALS: LedgerTotals = {
  income: 0,
  expense: 0,
  net: 0,
  unsettledNet: 0,
  count: 0,
  unsettledCount: 0,
  hasEntries: false,
  allSettled: false,
};

/** 金额按「分」取整，避免浮点误差累积 */
export function normalizeAmount(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  if (num > LEDGER_MAX_AMOUNT) return LEDGER_MAX_AMOUNT;
  return Math.round(num * AMOUNT_PRECISION) / AMOUNT_PRECISION;
}

function isValidDateStr(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDirection(value: unknown): value is LedgerDirection {
  return value === "in" || value === "out";
}

/**
 * 校验并规范化单条记账条目。非法条目返回 null（调用方过滤掉）。
 * 导入外部快照时必须走这里，避免脏数据污染本地。
 */
export function normalizeLedgerEntry(raw: unknown): LedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  if (!id) return null;
  if (!isValidDateStr(obj.date)) return null;
  if (!isDirection(obj.direction)) return null;

  const amount = normalizeAmount(obj.amount);
  if (amount <= 0) return null;

  const now = Date.now();
  const createdAt =
    typeof obj.createdAt === "number" && Number.isFinite(obj.createdAt) ? obj.createdAt : now;
  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : createdAt;
  const settled = obj.settled === true;
  const settledAt = settled
    ? typeof obj.settledAt === "number" && Number.isFinite(obj.settledAt)
      ? obj.settledAt
      : now
    : undefined;

  const note = typeof obj.note === "string" && obj.note.trim() ? obj.note.trim() : undefined;

  return {
    id,
    date: obj.date,
    amount,
    direction: obj.direction,
    note,
    settled,
    settledAt,
    createdAt,
    updatedAt,
  };
}

/** 规范化整个条目数组，过滤非法项 */
export function normalizeLedgerEntries(raw: unknown): LedgerEntry[] {
  if (!Array.isArray(raw)) return [];
  const result: LedgerEntry[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const entry = normalizeLedgerEntry(item);
    if (!entry) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push(entry);
  }
  return result;
}

/** 按方向取符号：收入为正，支出为负 */
export function signedAmount(entry: Pick<LedgerEntry, "amount" | "direction">): number {
  return entry.direction === "in" ? entry.amount : -entry.amount;
}

/**
 * 汇总一组记账条目。
 * @param entries 条目集合
 * @param filter 可选过滤器（按日期等维度筛选）
 */
export function summarizeLedger(
  entries: LedgerEntry[],
  filter?: (entry: LedgerEntry) => boolean,
): LedgerTotals {
  const scoped = filter ? entries.filter(filter) : entries;
  if (scoped.length === 0) return { ...EMPTY_TOTALS };

  let income = 0;
  let expense = 0;
  let unsettledNet = 0;
  let unsettledCount = 0;
  let settledCount = 0;

  for (const entry of scoped) {
    const signed = signedAmount(entry);
    if (entry.direction === "in") income += entry.amount;
    else expense += entry.amount;

    if (entry.settled) {
      settledCount += 1;
    } else {
      unsettledCount += 1;
      unsettledNet += signed;
    }
  }

  const round = (n: number) => Math.round(n * AMOUNT_PRECISION) / AMOUNT_PRECISION;

  return {
    income: round(income),
    expense: round(expense),
    net: round(income - expense),
    unsettledNet: round(unsettledNet),
    count: scoped.length,
    unsettledCount,
    hasEntries: true,
    allSettled: settledCount === scoped.length,
  };
}

/** 某一天的合计 */
export function summarizeDay(entries: LedgerEntry[], date: string): LedgerTotals {
  return summarizeLedger(entries, (entry) => entry.date === date);
}

/** 某个月（month 为 1-12）的合计 */
export function summarizeMonth(entries: LedgerEntry[], year: number, month: number): LedgerTotals {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return summarizeLedger(entries, (entry) => entry.date.startsWith(prefix));
}

/**
 * 金额展示格式化：1234.5 -> "1,234.50"，0 -> "0.00"
 */
export function formatAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return safe.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 净额展示：正数带 + 号 */
export function formatNet(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? "+" : safe < 0 ? "-" : "";
  return `${sign}${formatAmount(Math.abs(safe))}`;
}

/** 日格角标短文案：1234.5 -> "1234.5"，12000 -> "1.2万"（中文紧凑写法） */
export function formatCompactAmount(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 10000) {
    const wan = abs / 10000;
    const text = wan >= 100 ? Math.round(wan).toString() : wan.toFixed(1).replace(/\.0$/, "");
    return `${safe < 0 ? "-" : ""}${text}万`;
  }
  if (Number.isInteger(abs)) return `${safe < 0 ? "-" : ""}${abs}`;
  return `${safe < 0 ? "-" : ""}${abs.toFixed(2).replace(/0$/, "")}`;
}
