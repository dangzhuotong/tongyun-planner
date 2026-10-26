import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { getTaskCompletenessScore, mergeTwoTasks, mergeTaskSources } from "./taskMerge";

function makeTask(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "urgent-important",
    ...partial,
  };
}

describe("taskMerge: mergeTwoTasks & mergeTaskSources", () => {
  it("getTaskCompletenessScore accounts for agent, dates, and content richness", () => {
    const basic = makeTask({ id: "1", title: "简单任务" });
    const full = makeTask({
      id: "2",
      title: "完整 Agent 任务",
      description: "任务详情描述",
      notes: "备忘笔记",
      dueDate: "2026-10-26",
      dueTime: "14:00",
      priority: "high",
      assigneeKind: "agent",
      assigneeAgentId: "agent_runner",
      runStatus: "queued",
      subtasks: [{ id: "s1", title: "子项", completed: false }],
      tags: ["dev"],
    });

    expect(getTaskCompletenessScore(full)).toBeGreaterThan(getTaskCompletenessScore(basic) + 10);
  });

  it("mergeTwoTasks: 冲突时保留较新与较完整字段（含 agent 调度信息）", () => {
    const fromTasksTable = makeTask({
      id: "t1",
      title: "待办 A",
      updatedAt: 1000,
    });

    const fromDomainTasks = makeTask({
      id: "t1",
      title: "待办 A（完整）",
      description: "包含详细规格",
      assigneeKind: "agent",
      assigneeAgentId: "agy-mac",
      runStatus: "blocked",
      updatedAt: 2000,
    });

    const merged = mergeTwoTasks(fromTasksTable, fromDomainTasks);
    expect(merged.id).toBe("t1");
    expect(merged.title).toBe("待办 A（完整）");
    expect(merged.description).toBe("包含详细规格");
    expect(merged.assigneeKind).toBe("agent");
    expect(merged.assigneeAgentId).toBe("agy-mac");
    expect(merged.runStatus).toBe("blocked");
    expect(merged.updatedAt).toBe(2000);
  });

  it("mergeTwoTasks: 即使旧源的 agent 字段在较新空壳中缺失，也不丢失 agent 信息", () => {
    const oldRichAgent = makeTask({
      id: "t2",
      title: "旧端同步任务",
      description: "规格完整",
      assigneeKind: "agent",
      assigneeAgentId: "agy-mac",
      runStatus: "queued",
      updatedAt: 1000,
    });

    const newHollowTask = makeTask({
      id: "t2",
      title: "旧端同步任务（仅标题被更新）",
      updatedAt: 1500,
    });

    const merged = mergeTwoTasks(oldRichAgent, newHollowTask);
    expect(merged.title).toBe("旧端同步任务（仅标题被更新）");
    expect(merged.description).toBe("规格完整");
    expect(merged.assigneeKind).toBe("agent");
    expect(merged.assigneeAgentId).toBe("agy-mac");
    expect(merged.runStatus).toBe("queued");
  });

  it("mergeTaskSources: 合并三源（tasks 表、domain_tasks、localStorage），按 id 去重取全量", () => {
    const tasksTable = {
      tasks: [makeTask({ id: "t_human_1", title: "人类任务 1", updatedAt: 100 })],
      completed: [],
    };

    const domainTasksTable = {
      tasks: [
        makeTask({
          id: "t_human_1",
          title: "人类任务 1",
          notes: "来自 domain_tasks 的笔记",
          updatedAt: 200,
        }),
        makeTask({
          id: "t_agent_1",
          title: "Agent 任务 1",
          assigneeKind: "agent",
          assigneeAgentId: "agy-mac",
          runStatus: "blocked",
          updatedAt: 300,
        }),
      ],
      completed: [
        makeTask({
          id: "t_done_1",
          title: "已完成待办",
          completedAt: 150,
          updatedAt: 150,
        }),
      ],
    };

    const localStore = {
      tasks: [
        makeTask({
          id: "t_local_1",
          title: "本地待办",
          updatedAt: 400,
        }),
      ],
      completed: [],
    };

    const result = mergeTaskSources(tasksTable, domainTasksTable, localStore);

    expect(result.tasks).toHaveLength(3);
    expect(result.completed).toHaveLength(1);

    const ids = result.tasks.map((t) => t.id).sort();
    expect(ids).toEqual(["t_agent_1", "t_human_1", "t_local_1"]);

    const human1 = result.tasks.find((t) => t.id === "t_human_1")!;
    expect(human1.notes).toBe("来自 domain_tasks 的笔记");

    const agent1 = result.tasks.find((t) => t.id === "t_agent_1")!;
    expect(agent1.assigneeKind).toBe("agent");
    expect(agent1.runStatus).toBe("blocked");

    const done1 = result.completed.find((t) => t.id === "t_done_1")!;
    expect(done1.completedAt).toBe(150);
  });

  it("mergeTaskSources: 稀疏 tasks 1 行不得盖掉 domain/local 多行；合并后再 save 应保留全量 id", () => {
    const sparseTasksTable = {
      tasks: [makeTask({ id: "only_one", title: "稀疏壳", updatedAt: 999 })],
      completed: [],
    };
    const richDomain = {
      tasks: [
        makeTask({
          id: "only_one",
          title: "稀疏壳",
          description: "domain 补全",
          updatedAt: 500,
        }),
        makeTask({
          id: "agent_open",
          title: "Agent 派单",
          assigneeKind: "agent",
          assigneeAgentId: "agy-mac",
          runStatus: "queued",
          updatedAt: 600,
        }),
        makeTask({ id: "human_open", title: "人类待办", updatedAt: 700 }),
      ],
      completed: [],
    };
    const richLocal = {
      tasks: [
        makeTask({ id: "local_open", title: "本地待办", updatedAt: 800 }),
        makeTask({
          id: "agent_blocked",
          title: "阻塞派单",
          assigneeKind: "agent",
          assigneeAgentId: "agy-mac",
          runStatus: "blocked",
          updatedAt: 850,
        }),
      ],
      completed: [
        makeTask({
          id: "done_local",
          title: "本地已完成",
          completedAt: 400,
          updatedAt: 400,
        }),
      ],
    };

    const merged = mergeTaskSources(sparseTasksTable, richDomain, richLocal);
    const openIds = merged.tasks.map((t) => t.id).sort();
    expect(openIds).toEqual([
      "agent_blocked",
      "agent_open",
      "human_open",
      "local_open",
      "only_one",
    ]);
    expect(merged.completed.map((t) => t.id)).toEqual(["done_local"]);

    // 模拟 hydrate 后 saveAll 的 desired 快照：必须是合并全量，而非稀疏 1 行
    const desiredIds = new Set([
      ...merged.tasks.map((t) => t.id),
      ...merged.completed.map((t) => t.id),
    ]);
    expect(desiredIds.size).toBe(6);
    expect(desiredIds.has("agent_blocked")).toBe(true);
    expect(desiredIds.has("local_open")).toBe(true);
    expect(desiredIds.has("done_local")).toBe(true);

    const onlyOne = merged.tasks.find((t) => t.id === "only_one")!;
    expect(onlyOne.description).toBe("domain 补全");
  });
});
