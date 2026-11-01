import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildSnapshotPayload } from "../localSnapshots";
import { applyImportedLedgerEntries, loadLedgerEntries } from "../../ledger/ledgerStorage";
import { LEDGER_STORAGE_KEY } from "../../ledger/ledgerCore";

class LocalStorageMock {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

const LEDGER_SAMPLE = [
  {
    id: "ledger-1",
    date: "2026-11-01",
    amount: 25.5,
    direction: "out" as const,
    note: "午饭",
    settled: false,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: "ledger-2",
    date: "2026-11-01",
    amount: 100,
    direction: "in" as const,
    note: "转账",
    settled: true,
    settledAt: 2,
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: "ledger-3",
    date: "2026-11-02",
    amount: 12,
    direction: "out" as const,
    settled: false,
    createdAt: 3,
    updatedAt: 3,
  },
];

describe("日历轻量记账 · 导出/导入往返", () => {
  beforeEach(() => {
    (globalThis as any).localStorage = new LocalStorageMock();
  });

  it("导出快照包含记账条目", () => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(LEDGER_SAMPLE));
    localStorage.setItem("aero_todos", JSON.stringify([{ id: "t1", title: "写周报" }]));

    const payload = buildSnapshotPayload();

    expect(payload.ledgerEntries).toHaveLength(3);
    expect((payload.ledgerEntries as any[])[0].note).toBe("午饭");
    expect((payload.ledgerEntries as any[])[1].settled).toBe(true);
  });

  it("导出再导入后记账数据不丢", () => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(LEDGER_SAMPLE));
    localStorage.setItem("aero_todos", JSON.stringify([{ id: "t1", title: "写周报" }]));

    // 导出
    const payload = buildSnapshotPayload();
    const exportedJson = JSON.stringify(payload);

    // 模拟换机：清空本地后从导出的 JSON 恢复
    localStorage.clear();
    expect(loadLedgerEntries()).toEqual([]);

    // 导入
    const raw = JSON.parse(exportedJson);
    const applied = applyImportedLedgerEntries(raw);
    expect(applied).toBe(true);

    const restored = loadLedgerEntries();
    expect(restored).toHaveLength(3);
    expect(restored[0].amount).toBe(25.5);
    expect(restored[0].direction).toBe("out");
    expect(restored[0].note).toBe("午饭");
    expect(restored[0].settled).toBe(false);
    expect(restored[1].settled).toBe(true);
    expect(restored[2].date).toBe("2026-11-02");
  });

  it("导入的脏数据被过滤，不污染本地", () => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(LEDGER_SAMPLE));

    const applied = applyImportedLedgerEntries({
      ledgerEntries: [
        ...LEDGER_SAMPLE,
        { id: "bad", date: "x", amount: 5, direction: "out" },
        { id: "bad2", date: "2026-11-03", amount: -1, direction: "out" },
        { id: "bad3", date: "2026-11-03", amount: 5, direction: "???" },
      ],
    });

    expect(applied).toBe(true);
    expect(loadLedgerEntries()).toHaveLength(3);
  });

  it("快照里没有记账字段时不清空本地已有数据", () => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(LEDGER_SAMPLE));

    // 旧版本快照：没有 ledgerEntries 字段
    const applied = applyImportedLedgerEntries({ tasks: [], version: 1 });

    expect(applied).toBe(false);
    expect(loadLedgerEntries()).toHaveLength(3);
  });

  it("ledgerEntries 不是数组时视为无效，不写本地", () => {
    localStorage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(LEDGER_SAMPLE));

    const applied = applyImportedLedgerEntries({ ledgerEntries: "oops" });

    expect(applied).toBe(false);
    expect(loadLedgerEntries()).toHaveLength(3);
  });

  it("导入后广播更新事件，日历视图据此刷新", () => {
    // vitest 默认 node 环境没有 window，这里补一个最小事件总线桩
    const listeners: Record<string, Array<(e: unknown) => void>> = {};
    const fakeWindow = {
      addEventListener: (type: string, cb: (e: unknown) => void) => {
        (listeners[type] ||= []).push(cb);
      },
      removeEventListener: (type: string, cb: (e: unknown) => void) => {
        listeners[type] = (listeners[type] || []).filter((fn) => fn !== cb);
      },
      dispatchEvent: (event: { type: string }) => {
        (listeners[event.type] || []).forEach((fn) => fn(event));
        return true;
      },
    };
    vi.stubGlobal("window", fakeWindow);

    const handler = vi.fn();
    window.addEventListener("tongyun-ledger-updated", handler);

    applyImportedLedgerEntries({ ledgerEntries: LEDGER_SAMPLE });

    expect(handler).toHaveBeenCalledTimes(1);
    window.removeEventListener("tongyun-ledger-updated", handler);
    vi.unstubAllGlobals();
  });
});
