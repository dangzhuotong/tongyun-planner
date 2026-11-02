import { describe, it, expect, beforeEach, vi } from "vitest";
import { getLocalDateString } from "../date";
import type { PomodoroLog } from "../../types";

describe("widget pomodoro log & focus statistics sync", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  it("calculates today's pomodoros and focus minutes correctly from logs", () => {
    const todayStr = getLocalDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const logs: PomodoroLog[] = [
      {
        id: "pomo-1",
        timestamp: Date.now(),
        duration: 25,
        taskId: "task-1",
        taskTitle: "任务1",
      },
      {
        id: "pomo-2",
        timestamp: Date.now() - 3600 * 1000,
        duration: 30,
        taskId: "task-2",
        taskTitle: "任务2",
      },
      {
        id: "pomo-break",
        timestamp: Date.now() - 1800 * 1000,
        duration: 5,
        taskId: "break-micro",
        taskTitle: "休息",
      },
      {
        id: "pomo-yesterday",
        timestamp: yesterday.getTime(),
        duration: 25,
        taskId: "task-3",
        taskTitle: "昨天任务",
      },
    ];

    const todayLogs = logs.filter((log) => {
      const logDate = getLocalDateString(new Date(log.timestamp));
      return logDate === todayStr && !log.taskId?.startsWith("break");
    });

    const todayPomodoros = todayLogs.length;
    const todayFocusMinutes = todayLogs.reduce((acc, log) => acc + log.duration, 0);

    expect(todayPomodoros).toBe(2);
    expect(todayFocusMinutes).toBe(55);
  });

  it("correctly syncs and deduplicates logs across window sync events", () => {
    let currentLogs: PomodoroLog[] = [];

    const handleAddPomodoroLog = (log: PomodoroLog) => {
      currentLogs = [log, ...currentLogs.filter((l) => l.id !== log.id)];
      localStorage.setItem("aero_pomodoro_logs", JSON.stringify(currentLogs));
    };

    const newLog1: PomodoroLog = {
      id: "log-abc",
      timestamp: Date.now(),
      duration: 25,
      taskId: "task-focus",
      taskTitle: "专注中",
    };

    handleAddPomodoroLog(newLog1);
    expect(currentLogs.length).toBe(1);
    expect(currentLogs[0].id).toBe("log-abc");

    // Receiving duplicate log from broadcast does not double count
    handleAddPomodoroLog(newLog1);
    expect(currentLogs.length).toBe(1);

    // New second log appends and updates localStorage
    const newLog2: PomodoroLog = {
      id: "log-def",
      timestamp: Date.now(),
      duration: 15,
      taskId: "task-focus-2",
      taskTitle: "第二个专注",
    };
    handleAddPomodoroLog(newLog2);
    expect(currentLogs.length).toBe(2);

    const stored = JSON.parse(localStorage.getItem("aero_pomodoro_logs") || "[]");
    expect(stored.length).toBe(2);
    expect(stored[0].id).toBe("log-def");
  });
});
