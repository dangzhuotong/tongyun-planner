import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyAssigneeUpdates } from "./agentDispatch";
import { dispatchRepository } from "../data/repositories";
import type { Task } from "../types";

describe("applyAssigneeUpdates & State Transitions", () => {
  let mockStore: Record<string, string> = {};

  beforeEach(() => {
    mockStore = {};
    const storageMock = {
      getItem: (k: string) => mockStore[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStore[k] = String(v);
      },
      removeItem: (k: string) => {
        delete mockStore[k];
      },
      clear: () => {
        mockStore = {};
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  const baseTask: Task = {
    id: "task_unit_1",
    title: "撰写开发规格文档",
    category: "important-not-urgent",
  };

  it("P-AA-01 & P-AA-02: Assigning to agent sets kind, agentId, and queued status", async () => {
    const updated = applyAssigneeUpdates(baseTask, {
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });

    expect(updated.assigneeKind).toBe("agent");
    expect(updated.assigneeAgentId).toBe("agent_local_assistant");
    expect(updated.runStatus).toBe("queued");

    const dispatch = await dispatchRepository.getDispatchForTask(baseTask.id);
    expect(dispatch).not.toBeNull();
    expect(dispatch?.status).toBe("queued");
    expect(dispatch?.agentId).toBe("agent_local_assistant");
  });

  it("P-AA-03: Reassigning to human ('改回自己') cancels dispatch and clears agent fields", async () => {
    // Step 1: Assign to agent
    const assignedTask = applyAssigneeUpdates(baseTask, {
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });
    expect(assignedTask.runStatus).toBe("queued");

    // Step 2: One-click reassign to human
    const humanTask = applyAssigneeUpdates(assignedTask, {
      assigneeKind: "human",
    });

    expect(humanTask.assigneeKind).toBe("human");
    expect(humanTask.assigneeAgentId).toBeUndefined();
    expect(humanTask.runStatus).toBeUndefined();

    // Verify dispatch is cancelled
    const dispatch = await dispatchRepository.getDispatchForTask(baseTask.id);
    expect(dispatch?.status).toBe("cancelled");
  });

  it("P-AA-04: Manually advancing runStatus to done updates task and dispatch", async () => {
    const assignedTask = applyAssigneeUpdates(baseTask, {
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });

    const doneTask = applyAssigneeUpdates(assignedTask, {
      runStatus: "done",
    });

    expect(doneTask.runStatus).toBe("done");

    const dispatch = await dispatchRepository.getDispatchForTask(baseTask.id);
    expect(dispatch?.status).toBe("done");
  });

  it("P-AA-04: Manually advancing runStatus to failed updates task and dispatch", async () => {
    const assignedTask = applyAssigneeUpdates(baseTask, {
      assigneeKind: "agent",
      assigneeAgentId: "agent_local_assistant",
    });

    const failedTask = applyAssigneeUpdates(assignedTask, {
      runStatus: "failed",
    });

    expect(failedTask.runStatus).toBe("failed");

    const dispatch = await dispatchRepository.getDispatchForTask(baseTask.id);
    expect(dispatch?.status).toBe("failed");
  });
});
