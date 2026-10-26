import { describe, expect, it } from "vitest";
import type { Task, TaskRunStatus } from "../types";
import { applyAssigneeUpdates } from "./agentDispatch";
import {
  agentColumnFor,
  buildAgentDispatchedTask,
  isDispatchedAgentTask,
  isPureHumanTask,
  mineCardTasks,
  partitionAgentBoard,
  partitionMineTasks,
  resolveDefaultAgentId,
  runActionsFor,
} from "./workbenchView";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    category: "important-not-urgent",
    ...partial,
  };
}

const human = task({ id: "h1", title: "自己写信" });
const unset = task({ id: "h2", title: "未指定负责人" });
const queued = task({
  id: "a1",
  title: "起草周报",
  assigneeKind: "agent",
  assigneeAgentId: "agent_local_assistant",
  runStatus: "queued",
});
const running = task({
  id: "a2",
  title: "跑测试",
  assigneeKind: "agent",
  assigneeAgentId: "agent_other",
  runStatus: "running",
});
const done = task({
  id: "a3",
  title: "已跑完的整理",
  assigneeKind: "agent",
  assigneeAgentId: "agent_local_assistant",
  runStatus: "done",
});
const failed = task({
  id: "a4",
  title: "失败的同步",
  assigneeKind: "agent",
  assigneeAgentId: "agent_local_assistant",
  runStatus: "failed",
});

describe("workbench view P-AP-01～03", () => {
  it("P-AP-01: Agent 分栏看不到纯 human，我的卡片堆不包含 queued", () => {
    const all = [human, unset, queued, running, done, failed];
    const mine = partitionMineTasks(all);
    const board = partitionAgentBoard(all);

    expect(mine.cards.map((item) => item.id)).toEqual(["h1", "h2"]);
    expect(mine.cards.every(isPureHumanTask)).toBe(true);
    expect(mine.dispatched.map((item) => item.id)).toContain("a1");
    expect(mineCardTasks(all).some((item) => item.runStatus === "queued")).toBe(false);

    const visible = [...board.queued, ...board.running, ...board.settled];
    expect(visible.every((item) => !isPureHumanTask(item))).toBe(true);
    expect(visible.map((item) => item.id)).not.toContain("h1");
    expect(visible.map((item) => item.id)).not.toContain("h2");
  });

  it("P-AP-02: queued / running / done|failed 分列，改状态后立刻换列", () => {
    const all = [human, queued, running, done, failed];
    const board = partitionAgentBoard(all);

    expect(board.queued.map((item) => item.id)).toEqual(["a1"]);
    expect(board.running.map((item) => item.id)).toEqual(["a2"]);
    expect(board.settled.map((item) => item.id).sort()).toEqual(["a3", "a4"]);
    expect(agentColumnFor(done)).toBe("settled");
    expect(agentColumnFor(failed)).toBe("settled");
    expect(agentColumnFor(human)).toBeNull();

    const advance = (items: Task[], id: string, runStatus: TaskRunStatus) =>
      items.map((item) => (item.id === id ? applyAssigneeUpdates(item, { runStatus }) : item));

    const started = advance(all, "a1", "running");
    expect(partitionAgentBoard(started).queued.map((item) => item.id)).toEqual([]);
    expect(partitionAgentBoard(started).running.map((item) => item.id)).toEqual(["a1", "a2"]);

    const finished = advance(started, "a1", "done");
    expect(partitionAgentBoard(finished).running.map((item) => item.id)).toEqual(["a2"]);
    expect(partitionAgentBoard(finished).settled.map((item) => item.id)).toContain("a1");

    const broke = advance(all, "a2", "failed");
    expect(partitionAgentBoard(broke).running).toHaveLength(0);
    expect(partitionAgentBoard(broke).settled.map((item) => item.id)).toContain("a2");

    const requeued = applyAssigneeUpdates(done, {
      assigneeKind: "agent",
      assigneeAgentId: done.assigneeAgentId,
      runStatus: "queued",
    });
    expect(requeued.runStatus).toBe("queued");
    expect(partitionAgentBoard([requeued]).queued.map((item) => item.id)).toEqual(["a3"]);
    expect(partitionAgentBoard([requeued]).settled).toHaveLength(0);

    expect(runActionsFor("queued")).toEqual(["running", "done", "failed"]);
    expect(runActionsFor("running")).toEqual(["done", "failed"]);
    expect(runActionsFor("done")).toEqual(["queued"]);
    expect(runActionsFor("failed")).toEqual(["queued"]);
    expect(runActionsFor(undefined)).toEqual(["running", "done", "failed"]);
  });

  it("P-AP-03: 从我的派给 Agent 后进入待跑，我的侧只留灰入口", () => {
    const mineTask = task({ id: "letter", title: "给朋友写信" });
    const assigned = applyAssigneeUpdates(mineTask, {
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });
    const all = [human, assigned];
    const mine = partitionMineTasks(all);
    const board = partitionAgentBoard(all);

    expect(assigned.runStatus).toBe("queued");
    expect(mine.cards.map((item) => item.id)).toEqual(["h1"]);
    expect(mine.dispatched.map((item) => item.id)).toEqual(["letter"]);
    expect(board.queued.map((item) => item.id)).toEqual(["letter"]);
    expect(board.running).toHaveLength(0);
    expect(board.settled).toHaveLength(0);

    const returned = applyAssigneeUpdates(assigned, { assigneeKind: "human" });
    const after = partitionMineTasks([human, returned]);
    expect(after.cards.map((item) => item.id)).toEqual(["h1", "letter"]);
    expect(after.dispatched).toHaveLength(0);
    expect(partitionAgentBoard([human, returned]).queued).toHaveLength(0);
  });

  it("未写 runStatus 的 Agent 任务按待跑处理，取消派单回到我的卡片", () => {
    const fresh = task({
      id: "fresh",
      title: "刚派出去",
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });
    const cancelled = task({
      id: "cancel",
      title: "已取消",
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
      runStatus: "cancelled",
    });
    const mine = partitionMineTasks([fresh, cancelled, human]);
    expect(mine.dispatched.map((item) => item.id)).toEqual(["fresh"]);
    expect(mine.cards.map((item) => item.id)).toEqual(["cancel", "h1"]);
    expect(partitionAgentBoard([fresh, cancelled, human]).queued.map((item) => item.id)).toEqual([
      "fresh",
    ]);
  });

  it("按 agent 筛选时不带上别人的任务，也不带上 human", () => {
    const board = partitionAgentBoard([human, queued, running, done], "agent_local_assistant");
    expect(board.queued.map((item) => item.id)).toEqual(["a1"]);
    expect(board.running).toHaveLength(0);
    expect(board.settled.map((item) => item.id)).toEqual(["a3"]);
  });

  it("runStatus=blocked 不丢出 Agent 面板（至少当 queued）", () => {
    const blockedTask = task({
      id: "a_blocked",
      title: "阻塞的调研",
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
      runStatus: "blocked",
    });
    const all = [human, blockedTask];
    const board = partitionAgentBoard(all);
    expect(agentColumnFor(blockedTask)).toBe("queued");
    expect(board.queued.map((item) => item.id)).toContain("a_blocked");
    expect(mineCardTasks(all).map((item) => item.id)).toEqual(["h1"]);
  });

  describe("Agent 面板新建派活（#2619865960106024055）", () => {
    it("resolveDefaultAgentId: 唯一启用或默认上次优先，失效回退首个", () => {
      // 1. 无启用 agent 返回 undefined
      expect(resolveDefaultAgentId([])).toBeUndefined();

      // 2. 唯一启用 agent 时直接默认该 agent
      const single = [{ id: "agent_solo" }];
      expect(resolveDefaultAgentId(single)).toBe("agent_solo");
      expect(resolveDefaultAgentId(single, "agent_other")).toBe("agent_solo");

      // 3. 多个 agent 且有上次派活记录且有效时，默认上次选择
      const multiple = [
        { id: "agent_runner_1" },
        { id: "agent_runner_2" },
        { id: "agent_runner_3" },
      ];
      expect(resolveDefaultAgentId(multiple, "agent_runner_2")).toBe("agent_runner_2");

      // 4. 上次派活记录失效（已不在 enabled 列表）时，兜底选首个启用 agent
      expect(resolveDefaultAgentId(multiple, "agent_deleted")).toBe("agent_runner_1");
      expect(resolveDefaultAgentId(multiple, null)).toBe("agent_runner_1");
    });

    it("buildAgentDispatchedTask: 新建任务 assigneeKind=agent、runStatus=queued", () => {
      const dispatched = buildAgentDispatchedTask({
        id: "dispatch_01",
        title: "直接派给 Agent 的新任务",
        agentId: "agent_local_assistant",
      });

      expect(dispatched.id).toBe("dispatch_01");
      expect(dispatched.title).toBe("直接派给 Agent 的新任务");
      expect(dispatched.assigneeKind).toBe("agent");
      expect(dispatched.assigneeAgentId).toBe("agent_local_assistant");
      expect(dispatched.runStatus).toBe("queued");
      expect(dispatched.category).toBe("important-not-urgent");
    });

    it("面板新建派活：待跑可见，且「我的」不堆这条（进入灰入口而不占主卡片）", () => {
      const existingMine = task({ id: "my_task", title: "我的日常待办" });
      const newDispatched = buildAgentDispatchedTask({
        id: "dispatch_02",
        title: "分析最新数据报告",
        agentId: "agent_local_assistant",
      });

      const allTasks = [existingMine, newDispatched];

      // 1. Agent 面板待跑可见
      const board = partitionAgentBoard(allTasks);
      expect(board.queued.map((t) => t.id)).toContain("dispatch_02");
      expect(agentColumnFor(newDispatched)).toBe("queued");

      // 2. 「我的」主卡片堆（mine.cards）零包含，不堆到四象限
      const mine = partitionMineTasks(allTasks);
      expect(mine.cards.map((t) => t.id)).toEqual(["my_task"]);
      expect(mineCardTasks(allTasks).map((t) => t.id)).toEqual(["my_task"]);
      expect(mineCardTasks(allTasks).some((t) => t.id === "dispatch_02")).toBe(false);

      // 3. 「我的」侧按规则进入 dispatched 灰入口
      expect(mine.dispatched.map((t) => t.id)).toEqual(["dispatch_02"]);
      expect(isPureHumanTask(newDispatched)).toBe(false);
      expect(isDispatchedAgentTask(newDispatched)).toBe(true);
    });
  });
});
