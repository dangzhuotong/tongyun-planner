import { describe, expect, it } from "vitest";
import type { Task, TaskRunStatus } from "../types";
import { applyAssigneeUpdates } from "./agentDispatch";
import {
  agentColumnFor,
  isPureHumanTask,
  mineCardTasks,
  partitionAgentBoard,
  partitionMineTasks,
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
});
