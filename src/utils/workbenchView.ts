import type { Task, TaskRunStatus } from "../types";

export type WorkSurface = "mine" | "agent";

export const WORK_SURFACE_STORAGE_KEY = "tongyun_work_surface";
export const LAST_DISPATCHED_AGENT_KEY = "tongyun_last_dispatched_agent";

export type AgentColumnId = "queued" | "running" | "settled";

/**
 * 决定派活时默认选中的 Agent：
 * 1. 唯一启用时直接默认该 agent。
 * 2. 否则优先选上次派活记录（若仍在启用中）。
 * 3. 兜底选首个启用 agent。
 */
export function resolveDefaultAgentId(
  enabledAgents: { id: string }[],
  lastDispatchedId?: string | null,
): string | undefined {
  if (!enabledAgents || enabledAgents.length === 0) return undefined;
  if (enabledAgents.length === 1) return enabledAgents[0].id;
  if (lastDispatchedId && enabledAgents.some((a) => a.id === lastDispatchedId)) {
    return lastDispatchedId;
  }
  return enabledAgents[0].id;
}

/**
 * 在 Agent 面板直接新建派活任务结构：
 * assigneeKind=agent, runStatus=queued
 */
export function buildAgentDispatchedTask(params: {
  id: string;
  title: string;
  agentId: string;
  category?: Task["category"];
  dueDate?: string;
  dueTime?: string;
  priority?: Task["priority"];
}): Task {
  return {
    id: params.id,
    title: params.title.trim(),
    category: params.category || "important-not-urgent",
    dueDate: params.dueDate,
    dueTime: params.dueTime,
    priority: params.priority,
    assigneeKind: "agent",
    assigneeAgentId: params.agentId,
    runStatus: "queued",
  };
}

export interface MinePartition {
  /** 我的全尺寸卡片：纯 human（或已取消派单）。 */
  cards: Task[];
  /** 已派出的 Agent 任务。只在 Agent 面板可见，「我的」各视图不再渲染。 */
  dispatched: Task[];
}

export interface AgentBoard {
  queued: Task[];
  running: Task[];
  settled: Task[];
}

const DISPATCH_RANK: Record<string, number> = {
  queued: 0,
  running: 1,
  failed: 2,
  done: 3,
};

/** 顶栏上次选择。缺省与非法值都回到「我的」。 */
export function readWorkSurface(): WorkSurface {
  if (typeof localStorage === "undefined") return "mine";
  try {
    return localStorage.getItem(WORK_SURFACE_STORAGE_KEY) === "agent" ? "agent" : "mine";
  } catch {
    return "mine";
  }
}

/** 没有派给 Agent 的任务。未设 assigneeKind 且无 Agent 关联视为自己。 */
export function isPureHumanTask(task: Task): boolean {
  if (task.assigneeKind === "agent") return false;
  if (
    !task.assigneeKind &&
    (Boolean(task.assigneeAgentId) || (Boolean(task.runStatus) && task.runStatus !== "cancelled"))
  ) {
    return false;
  }
  return true;
}

/** 仍属于 Agent 面板的任务。含 runStatus=blocked 等非取消的 Agent 待办。取消派单后回到「我的」。 */
export function isDispatchedAgentTask(task: Task): boolean {
  const isAgent =
    task.assigneeKind === "agent" ||
    (!task.assigneeKind &&
      (Boolean(task.assigneeAgentId) ||
        (Boolean(task.runStatus) && task.runStatus !== "cancelled")));
  return isAgent && task.runStatus !== "cancelled";
}

export function describeRunStatus(
  status: TaskRunStatus | undefined,
): "queued" | "running" | "done" | "failed" {
  if (status === "running" || status === "done" || status === "failed") return status;
  return "queued";
}

export function agentColumnFor(task: Task): AgentColumnId | null {
  if (!isDispatchedAgentTask(task)) return null;
  const status = describeRunStatus(task.runStatus);
  if (status === "running") return "running";
  if (status === "done" || status === "failed") return "settled";
  return "queued";
}

/** 各状态下面板上可点的下一步。改完用同一份任务数组重分栏，本机立刻换列。 */
export function runActionsFor(status: TaskRunStatus | undefined): TaskRunStatus[] {
  const key = describeRunStatus(status);
  if (key === "queued") return ["running", "done", "failed"];
  if (key === "running") return ["done", "failed"];
  return ["queued"];
}

export function partitionMineTasks(tasks: Task[]): MinePartition {
  const cards: Task[] = [];
  const dispatched: Task[] = [];
  for (const task of tasks) {
    if (isDispatchedAgentTask(task)) dispatched.push(task);
    else cards.push(task);
  }
  dispatched.sort(
    (a, b) =>
      (DISPATCH_RANK[describeRunStatus(a.runStatus)] ?? 9) -
      (DISPATCH_RANK[describeRunStatus(b.runStatus)] ?? 9),
  );
  return { cards, dispatched };
}

export function mineCardTasks(tasks: Task[]): Task[] {
  return partitionMineTasks(tasks).cards;
}

export function partitionAgentBoard(tasks: Task[], agentId?: string): AgentBoard {
  const board: AgentBoard = { queued: [], running: [], settled: [] };
  for (const task of tasks) {
    if (isPureHumanTask(task)) continue;
    if (agentId && task.assigneeAgentId !== agentId) continue;
    const column = agentColumnFor(task);
    if (column) board[column].push(task);
  }
  return board;
}
