import type { Task, TaskRunStatus } from "../types";
import { applyAssigneeUpdates } from "./agentDispatch";

export const PIPELINE_WRITE_TIMEOUT_MS = 20_000;

/** 有标题、并且选中了公司名册里的人，保存才可用。 */
export function canSaveAgentDraft(title: string, assigneeId: string | null | undefined): boolean {
  return title.trim().length > 0 && Boolean((assigneeId || "").trim());
}

/**
 * 公司库写入必须在超时后失败并放开按钮。挂起的 Promise 之后再结算，不再改界面。
 */
export function withDeadline<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 把公司库回执落到本机任务上。runStatus 跟回执走，开始写成可领时仍是待跑。 */
export function applyPipelineReceipt(
  task: Task,
  receipt: { id: string; assignee?: string; runStatus: TaskRunStatus },
  now = Date.now(),
): Task {
  return applyAssigneeUpdates(task, {
    assigneeKind: "agent",
    assigneeAgentId: receipt.assignee || task.assigneeAgentId,
    runStatus: receipt.runStatus,
    pipelineTaskId: receipt.id,
    updatedAt: now,
  });
}
