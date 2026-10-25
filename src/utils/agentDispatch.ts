import type { Task, TaskRunStatus } from "../types";
import { dispatchRepository } from "../data/repositories";

/**
 * Handle state transitions for assignee and run status, updating SQLite / local dispatch records accordingly.
 */
export function applyAssigneeUpdates(task: Task, updates: Partial<Task>): Task {
  const next: Task = { ...task, ...updates };

  if (updates.assigneeKind === "human" || ("assigneeKind" in updates && !updates.assigneeKind)) {
    next.assigneeKind = "human";
    delete next.assigneeAgentId;
    delete next.runStatus;
    dispatchRepository.cancelDispatch(task.id);
  } else if (updates.assigneeKind === "agent") {
    const targetAgentId = updates.assigneeAgentId || task.assigneeAgentId;
    if (targetAgentId) {
      next.assigneeKind = "agent";
      next.assigneeAgentId = targetAgentId;
      const targetStatus: TaskRunStatus = updates.runStatus || task.runStatus || "queued";
      next.runStatus = targetStatus;
      dispatchRepository.recordDispatch(task.id, targetAgentId, targetStatus);
    } else {
      next.assigneeKind = "human";
      delete next.assigneeAgentId;
      delete next.runStatus;
      dispatchRepository.cancelDispatch(task.id);
    }
  } else if (
    updates.runStatus &&
    (next.assigneeKind === "agent" || task.assigneeKind === "agent")
  ) {
    next.runStatus = updates.runStatus;
    dispatchRepository.updateStatus(task.id, updates.runStatus);
  }

  return next;
}
