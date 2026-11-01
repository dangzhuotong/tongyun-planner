import { describe, it, expect } from "vitest";
import type { LedgerEntry } from "../../../types";
import {
  EMPTY_TOTALS,
  formatAmount,
  formatCompactAmount,
  formatNet,
  normalizeAmount,
  normalizeLedgerEntries,
  signedAmount,
  summarizeDay,
  summarizeLedger,
  summarizeMonth,
} from "../ledgerCore";

function entry(partial: Partial<LedgerEntry> & { id: string; date: string }): LedgerEntry {
  return {
    amount: 10,
    direction: "out",
    settled: false,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  };
}

describe("ledgerCore · 金额归一化", () => {
  it("把金额按分取整，消除浮点误差", () => {
    expect(normalizeAmount(0.1 + 0.2)).toBe(0.3);
    expect(normalizeAmount(12.345)).toBe(12.35);
    expect(normalizeAmount("8.5")).toBe(8.5);
  });

  it("拒绝非正数与非法值", () => {
    expect(normalizeAmount(0)).toBe(0);
    expect(normalizeAmount(-5)).toBe(0);
    expect(normalizeAmount("abc")).toBe(0);
    expect(normalizeAmount(NaN)).toBe(0);
    expect(normalizeAmount(undefined)).toBe(0);
  });

  it("封顶防止异常超大值", () => {
    expect(normalizeAmount(1e12)).toBe(1_000_000_000);
  });
});

describe("ledgerCore · 条目规范化", () => {
  it("保留合法条目并剔除非法条目", () => {
    const result = normalizeLedgerEntries([
      entry({ id: "a", date: "2026-11-01", amount: 25.5, direction: "out" }),
      { id: "", date: "2026-11-01", amount: 10, direction: "out" },
      { id: "b", date: "not-a-date", amount: 10, direction: "out" },
      { id: "c", date: "2026-11-01", amount: 10, direction: "sideways" },
      { id: "d", date: "2026-11-01", amount: 0, direction: "out" },
      null,
      "garbage",
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
    expect(result[0].amount).toBe(25.5);
  });

  it("去重相同 id", () => {
    const result = normalizeLedgerEntries([
      entry({ id: "a", date: "2026-11-01", amount: 10 }),
      entry({ id: "a", date: "2026-11-02", amount: 20 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-11-01");
  });

  it("非数组输入返回空数组", () => {
    expect(normalizeLedgerEntries(null)).toEqual([]);
    expect(normalizeLedgerEntries({})).toEqual([]);
    expect(normalizeLedgerEntries("nope")).toEqual([]);
  });

  it("备注为空串时归一化为 undefined", () => {
    const [e] = normalizeLedgerEntries([entry({ id: "a", date: "2026-11-01", note: "  " })]);
    expect(e.note).toBeUndefined();
  });

  it("已结算条目补齐 settledAt", () => {
    const [e] = normalizeLedgerEntries([entry({ id: "a", date: "2026-11-01", settled: true })]);
    expect(e.settled).toBe(true);
    expect(typeof e.settledAt).toBe("number");
  });

  it("未结算条目不写入 settledAt", () => {
    const [e] = normalizeLedgerEntries([entry({ id: "a", date: "2026-11-01" })]);
    expect(e.settled).toBe(false);
    expect(e.settledAt).toBeUndefined();
  });
});

describe("ledgerCore · 合计统计", () => {
  const entries = [
    entry({ id: "1", date: "2026-11-01", amount: 30, direction: "out" }),
    entry({ id: "2", date: "2026-11-01", amount: 50, direction: "in", settled: true }),
    entry({ id: "3", date: "2026-11-02", amount: 12.5, direction: "out" }),
    entry({ id: "4", date: "2026-11-02", amount: 7.5, direction: "in" }),
  ];

  it("空集合返回全零", () => {
    expect(summarizeLedger([])).toEqual(EMPTY_TOTALS);
  });

  it("按方向分别累计收入与支出", () => {
    const t = summarizeLedger(entries);
    expect(t.income).toBe(57.5);
    expect(t.expense).toBe(42.5);
    expect(t.net).toBe(15);
    expect(t.count).toBe(4);
  });

  it("未结算净额只统计未结算条目", () => {
    const t = summarizeLedger(entries);
    // 未结算：#1 支 30、#3 支 12.5、#4 收 7.5 → -30 -12.5 + 7.5 = -35
    expect(t.unsettledCount).toBe(3);
    expect(t.unsettledNet).toBe(-35);
  });

  it("全部已结算时 allSettled 为真", () => {
    const allSettled = entries.map((e) => ({ ...e, settled: true }));
    expect(summarizeLedger(allSettled).allSettled).toBe(true);
    expect(summarizeLedger(allSettled).unsettledCount).toBe(0);
  });

  it("按日期筛选只统计当日", () => {
    const t = summarizeDay(entries, "2026-11-01");
    expect(t.count).toBe(2);
    expect(t.expense).toBe(30);
    expect(t.income).toBe(50);
    expect(t.net).toBe(20);
  });

  it("不存在���日期返回空合计", () => {
    const t = summarizeDay(entries, "2026-12-31");
    expect(t.hasEntries).toBe(false);
    expect(t.count).toBe(0);
    expect(t.net).toBe(0);
  });

  it("按月份筛选只统计该月", () => {
    const t = summarizeMonth(entries, 2026, 11);
    expect(t.count).toBe(4);
    const dec = summarizeMonth(entries, 2026, 12);
    expect(dec.hasEntries).toBe(false);
  });

  it("跨年月份前缀正确", () => {
    const jan = summarizeMonth([entry({ id: "x", date: "2027-01-05", amount: 9 })], 2027, 1);
    expect(jan.expense).toBe(9);
  });

  it("signedAmount 收入为正支出为负", () => {
    expect(signedAmount({ amount: 10, direction: "in" })).toBe(10);
    expect(signedAmount({ amount: 10, direction: "out" })).toBe(-10);
  });
});

describe("ledgerCore · 金额展示", () => {
  it("formatAmount 固定两位小数并加千分位", () => {
    expect(formatAmount(1234.5)).toBe("1,234.50");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(NaN)).toBe("0.00");
  });

  it("formatNet 带符号", () => {
    expect(formatNet(12.5)).toBe("+12.50");
    expect(formatNet(-12.5)).toBe("-12.50");
    expect(formatNet(0)).toBe("0.00");
  });

  it("formatCompactAmount 万位压缩", () => {
    expect(formatCompactAmount(1234.5)).toBe("1234.5");
    expect(formatCompactAmount(12000)).toBe("1.2万");
    expect(formatCompactAmount(123456)).toBe("12.3万");
    expect(formatCompactAmount(-12000)).toBe("-1.2万");
  });
});
