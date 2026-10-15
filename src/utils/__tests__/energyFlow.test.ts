import { describe, expect, it } from "vitest";
import {
  getCurrentEnergyZone,
  inferTaskEnergyLevel,
  groupTasksByEnergyZones,
} from "../energyFlow";
import type { Task } from "../../types";

describe("energyFlow utility", () => {
  it("determines correct energy zone based on time of day", () => {
    // 09:15 -> peak
    const morning = new Date(2026, 9, 15, 9, 15);
    expect(getCurrentEnergyZone(morning).id).toBe("peak");

    // 12:00 -> break
    const lunch = new Date(2026, 9, 15, 12, 0);
    expect(getCurrentEnergyZone(lunch).id).toBe("break");

    // 14:00 -> trough
    const afternoon = new Date(2026, 9, 15, 14, 0);
    expect(getCurrentEnergyZone(afternoon).id).toBe("trough");

    // 16:45 -> rebound
    const evening = new Date(2026, 9, 15, 16, 45);
    expect(getCurrentEnergyZone(evening).id).toBe("rebound");
  });

  it("infers energy level correctly with custom and fallback category rules", () => {
    const explicitHigh: Task = {
      id: "t1",
      title: "攻坚重活",
      category: "not-urgent-not-important",
      energyLevel: "high",
    };
    expect(inferTaskEnergyLevel(explicitHigh)).toBe("high");

    const urgentImportant: Task = {
      id: "t2",
      title: "核心紧急",
      category: "urgent-important",
    };
    expect(inferTaskEnergyLevel(urgentImportant)).toBe("high");

    const importantNotUrgent: Task = {
      id: "t3",
      title: "长期复盘",
      category: "important-not-urgent",
    };
    expect(inferTaskEnergyLevel(importantNotUrgent)).toBe("medium");

    const trivialTask: Task = {
      id: "t4",
      title: "发发传真",
      category: "not-urgent-not-important",
    };
    expect(inferTaskEnergyLevel(trivialTask)).toBe("low");
  });

  it("groups tasks into appropriate energy zones", () => {
    const tasks: Task[] = [
      { id: "1", title: "重大难点", category: "urgent-important" }, // high -> peak
      { id: "2", title: "规划方案", category: "important-not-urgent" }, // medium -> rebound
      { id: "3", title: "琐事回复", category: "urgent-not-important" }, // low -> trough
    ];

    const grouped = groupTasksByEnergyZones(tasks);
    expect(grouped.peak.map((t) => t.id)).toEqual(["1"]);
    expect(grouped.rebound.map((t) => t.id)).toEqual(["2"]);
    expect(grouped.trough.map((t) => t.id)).toEqual(["3"]);
  });
});
