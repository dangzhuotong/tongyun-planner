import type { Task } from "../types";

export interface TaskSourceCollection {
  tasks?: Task[];
  completed?: Task[];
}

/**
 * 计算任务信息完整度分数，用于冲突合并时倾向选择字段更充实的数据源。
 */
export function getTaskCompletenessScore(task: Task): number {
  let score = 0;
  if (task.title && task.title.trim().length > 0) score += 1;
  if (task.description && task.description.trim().length > 0) score += 2;
  if (task.notes && task.notes.trim().length > 0) score += 2;
  if (task.category) score += 1;
  if (task.dueDate) score += 2;
  if (task.dueTime) score += 1;
  if (task.priority) score += 1;
  if (task.assigneeKind === "agent") score += 3;
  if (task.assigneeAgentId) score += 3;
  if (task.runStatus) score += 3;
  if (task.subtasks && task.subtasks.length > 0) score += 2;
  if (task.tags && task.tags.length > 0) score += 1;
  if (task.dependsOn && task.dependsOn.length > 0) score += 1;
  if (task.attachments && task.attachments.length > 0) score += 1;
  if (task.completedAt != null) score += 1;
  if (task.timeBlock) score += 1;
  if (task.stamp) score += 1;
  return score;
}

/**
 * 合并具有相同 id 的两个任务副本：
 * 冲突时取较新 / 较完整（保留 assigneeKind / assigneeAgentId / runStatus 等核心调度字段）。
 */
export function mergeTwoTasks(a: Task, b: Task): Task {
  if (a === b) return a;
  const timeA = a.updatedAt || 0;
  const timeB = b.updatedAt || 0;
  const scoreA = getTaskCompletenessScore(a);
  const scoreB = getTaskCompletenessScore(b);

  let base: Task;
  let other: Task;

  if (timeA !== timeB) {
    if (timeA > timeB) {
      // a 较新；若 b 完整度显著超出且包含 agent 调度信息，优先以 b 为底座
      if (scoreB > scoreA + 3) {
        base = b;
        other = a;
      } else {
        base = a;
        other = b;
      }
    } else {
      if (scoreA > scoreB + 3) {
        base = a;
        other = b;
      } else {
        base = b;
        other = a;
      }
    }
  } else {
    if (scoreA >= scoreB) {
      base = a;
      other = b;
    } else {
      base = b;
      other = a;
    }
  }

  const merged: Task = { ...base };

  // 补齐标题：空则补；较新源有标题时采用较新标题（完整度底座可能是旧源）
  if (!merged.title && other.title) {
    merged.title = other.title;
  } else if (
    other.title &&
    (other.updatedAt || 0) > (base.updatedAt || 0) &&
    other.title !== merged.title
  ) {
    merged.title = other.title;
  }

  // 补齐文本与日期
  if (!merged.description && other.description) merged.description = other.description;
  if (!merged.notes && other.notes) merged.notes = other.notes;
  if (!merged.dueDate && other.dueDate) merged.dueDate = other.dueDate;
  if (!merged.dueTime && other.dueTime) merged.dueTime = other.dueTime;
  if (
    (!merged.priority || merged.priority === "medium") &&
    other.priority &&
    other.priority !== "medium"
  ) {
    merged.priority = other.priority;
  }
  if (!merged.category && other.category) merged.category = other.category;

  // Agent 调度字段：任一侧有 agent 关键信息则保留并提升，不被空值冲掉
  const hasAgentInfoOther = Boolean(
    other.assigneeKind === "agent" || other.assigneeAgentId || other.runStatus,
  );
  const hasAgentInfoBase = Boolean(
    merged.assigneeKind === "agent" || merged.assigneeAgentId || merged.runStatus,
  );

  if (hasAgentInfoOther && !hasAgentInfoBase) {
    merged.assigneeKind = other.assigneeKind || "agent";
    if (other.assigneeAgentId) merged.assigneeAgentId = other.assigneeAgentId;
    if (other.runStatus) merged.runStatus = other.runStatus;
  } else {
    if (!merged.assigneeKind && other.assigneeKind) merged.assigneeKind = other.assigneeKind;
    if (!merged.assigneeAgentId && other.assigneeAgentId)
      merged.assigneeAgentId = other.assigneeAgentId;
    if (!merged.runStatus && other.runStatus) merged.runStatus = other.runStatus;
  }

  if (
    other.pipelineTaskId &&
    !merged.pipelineTaskId &&
    (other.updatedAt || 0) > (merged.updatedAt || 0)
  ) {
    merged.pipelineTaskId = other.pipelineTaskId;
  }

  // 若关联了 Agent 或具有非取消的 runStatus，确保 assigneeKind 为 agent
  if (
    !merged.assigneeKind &&
    (merged.assigneeAgentId || (merged.runStatus && merged.runStatus !== "cancelled"))
  ) {
    merged.assigneeKind = "agent";
  }

  // 补齐子任务与标签关联
  if (
    (!merged.subtasks || merged.subtasks.length === 0) &&
    other.subtasks &&
    other.subtasks.length > 0
  ) {
    merged.subtasks = other.subtasks;
  }
  if ((!merged.tags || merged.tags.length === 0) && other.tags && other.tags.length > 0) {
    merged.tags = other.tags;
  }
  if (
    (!merged.dependsOn || merged.dependsOn.length === 0) &&
    other.dependsOn &&
    other.dependsOn.length > 0
  ) {
    merged.dependsOn = other.dependsOn;
  }
  if (
    (!merged.attachments || merged.attachments.length === 0) &&
    other.attachments &&
    other.attachments.length > 0
  ) {
    merged.attachments = other.attachments;
  }

  // 补齐其他属性
  if (merged.completedAt == null && other.completedAt != null) {
    merged.completedAt = other.completedAt;
  }
  if (merged.repeat == null && other.repeat != null) merged.repeat = other.repeat;
  if (merged.repeatAnchorDay == null && other.repeatAnchorDay != null) {
    merged.repeatAnchorDay = other.repeatAnchorDay;
  }
  if (!merged.energyLevel && other.energyLevel) merged.energyLevel = other.energyLevel;
  if (merged.estimatedPomodoros == null && other.estimatedPomodoros != null) {
    merged.estimatedPomodoros = other.estimatedPomodoros;
  }
  if (!merged.stamp && other.stamp) merged.stamp = other.stamp;
  if (!merged.timeBlock && other.timeBlock) merged.timeBlock = other.timeBlock;
  if (!merged.journalId && other.journalId) merged.journalId = other.journalId;

  const maxUpdated = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  if (maxUpdated > 0) merged.updatedAt = maxUpdated;

  return merged;
}

/**
 * 跨数据源合并待办：
 * 合并 tasks 表、domain_tasks 表、localStorage (aero_todos/aero_completed_todos)。
 * 按 id 聚合去重，冲突取较新/较完整，确保人类与 Agent 待办无遗漏。
 */
export function mergeTaskSources(...sources: (TaskSourceCollection | null | undefined)[]): {
  tasks: Task[];
  completed: Task[];
} {
  const activeMap = new Map<string, Task>();
  const completedMap = new Map<string, Task>();

  for (const source of sources) {
    if (!source) continue;

    if (source.tasks) {
      for (const task of source.tasks) {
        if (!task || !task.id) continue;
        if (task.completedAt) {
          const prev = completedMap.get(task.id);
          completedMap.set(task.id, prev ? mergeTwoTasks(prev, task) : task);
        } else {
          const prev = activeMap.get(task.id);
          activeMap.set(task.id, prev ? mergeTwoTasks(prev, task) : task);
        }
      }
    }

    if (source.completed) {
      for (const task of source.completed) {
        if (!task || !task.id) continue;
        const prev = completedMap.get(task.id);
        completedMap.set(task.id, prev ? mergeTwoTasks(prev, task) : task);
      }
    }
  }

  // 解决活动与完成列表之间的重复项：以较新操作优先，若已完成无更新则以完成为准
  for (const [id, activeTask] of activeMap.entries()) {
    const completedTask = completedMap.get(id);
    if (!completedTask) continue;

    const merged = mergeTwoTasks(completedTask, activeTask);
    const activeTime = activeTask.updatedAt || 0;
    const completedTime = completedTask.completedAt || completedTask.updatedAt || 0;

    if (activeTime > completedTime) {
      delete merged.completedAt;
      activeMap.set(id, merged);
      completedMap.delete(id);
    } else {
      if (!merged.completedAt) merged.completedAt = completedTime || Date.now();
      completedMap.set(id, merged);
      activeMap.delete(id);
    }
  }

  return {
    tasks: Array.from(activeMap.values()),
    completed: Array.from(completedMap.values()),
  };
}
