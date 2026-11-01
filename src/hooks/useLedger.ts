import { useCallback, useEffect, useMemo, useState } from "react";
import type { LedgerDirection, LedgerEntry } from "../types";
import { createId } from "../utils/id";
import {
  LEDGER_UPDATED_EVENT,
  normalizeAmount,
  summarizeMonth,
  type LedgerTotals,
} from "../utils/ledger/ledgerCore";
import { loadLedgerEntries, saveLedgerEntries } from "../utils/ledger/ledgerStorage";

export interface LedgerEntryInput {
  date: string;
  amount: number | string;
  direction: LedgerDirection;
  note?: string;
  settled?: boolean;
}

export interface UseLedgerResult {
  entries: LedgerEntry[];
  /** 某个月的合计（month 为 1-12） */
  getMonthTotals: (year: number, month: number) => LedgerTotals;
  addEntry: (input: LedgerEntryInput) => LedgerEntry | null;
  removeEntry: (id: string) => void;
  toggleEntrySettled: (id: string) => void;
  /** 把某天全部条目标记为已结算 / 未结算 */
  setDaySettled: (date: string, settled: boolean) => void;
}

/**
 * 日历轻量记账状态。
 *
 * 单一数据源是 localStorage（键 tongyun_ledger_entries），SQLite 镜像由 unifiedStorage 自动完成。
 * 导入快照 / 跨窗口同步后通过 LEDGER_UPDATED_EVENT 广播，触发本地重载。
 */
export function useLedger(): UseLedgerResult {
  const [entries, setEntries] = useState<LedgerEntry[]>(() => loadLedgerEntries());

  // 外部改动（导入快照、其它窗口）后重载
  useEffect(() => {
    const handleUpdate = () => setEntries(loadLedgerEntries());
    window.addEventListener(LEDGER_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(LEDGER_UPDATED_EVENT, handleUpdate);
  }, []);

  const addEntry = useCallback((input: LedgerEntryInput): LedgerEntry | null => {
    const amount = normalizeAmount(input.amount);
    if (amount <= 0) return null;
    const now = Date.now();
    const entry: LedgerEntry = {
      id: createId("ledger"),
      date: input.date,
      amount,
      direction: input.direction,
      note: input.note?.trim() || undefined,
      settled: input.settled === true,
      settledAt: input.settled === true ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    setEntries((prev) => {
      const next = [...prev, entry];
      saveLedgerEntries(next);
      return next;
    });
    return entry;
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      if (next.length === prev.length) return prev;
      saveLedgerEntries(next);
      return next;
    });
  }, []);

  const toggleEntrySettled = useCallback((id: string) => {
    setEntries((prev) => {
      const target = prev.find((e) => e.id === id);
      if (!target) return prev;
      const now = Date.now();
      const next = prev.map((e) =>
        e.id === id
          ? {
              ...e,
              settled: !e.settled,
              settledAt: !e.settled ? now : undefined,
              updatedAt: now,
            }
          : e,
      );
      saveLedgerEntries(next);
      return next;
    });
  }, []);

  const setDaySettled = useCallback((date: string, settled: boolean) => {
    setEntries((prev) => {
      const now = Date.now();
      let changed = false;
      const next = prev.map((e) => {
        if (e.date !== date || e.settled === settled) return e;
        changed = true;
        return { ...e, settled, settledAt: settled ? now : undefined, updatedAt: now };
      });
      if (!changed) return prev;
      saveLedgerEntries(next);
      return next;
    });
  }, []);

  const getMonthTotals = useCallback(
    (year: number, month: number) => summarizeMonth(entries, year, month),
    [entries],
  );

  return useMemo(
    () => ({
      entries,
      getMonthTotals,
      addEntry,
      removeEntry,
      toggleEntrySettled,
      setDaySettled,
    }),
    [entries, getMonthTotals, addEntry, removeEntry, toggleEntrySettled, setDaySettled],
  );
}
