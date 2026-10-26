import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import {
  applyPipelineReceipt,
  canSaveAgentDraft,
  queuedTaskFromPipelineReceipt,
  withDeadline,
} from "./agentPanelActions";
import { partitionAgentBoard } from "./workbenchView";

const PIPELINE_ID = "5214548946653707513";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return { category: "important-not-urgent", ...partial };
}

describe("agent dispatch board", () => {
  it("save is available only with a title and a roster person", () => {
    expect(canSaveAgentDraft("  看名册  ", "cursor-cloud")).toBe(true);
    expect(canSaveAgentDraft("   ", "cursor-cloud")).toBe(false);
    expect(canSaveAgentDraft("看名册", "")).toBe(false);
    expect(canSaveAgentDraft("看名册", null)).toBe(false);
  });

  it("a claimable receipt stays queued and keeps the exact pipeline id", () => {
    const next = applyPipelineReceipt(
      task({ id: "task-1", title: "派给 Cursor" }),
      { id: PIPELINE_ID, assignee: "cursor-cloud", runStatus: "queued" },
      10,
    );
    expect(next.assigneeKind).toBe("agent");
    expect(next.assigneeAgentId).toBe("cursor-cloud");
    expect(next.runStatus).toBe("queued");
    expect(next.pipelineTaskId).toBe(PIPELINE_ID);
    expect(partitionAgentBoard([next]).queued.map((item) => item.id)).toEqual(["task-1"]);
    expect(partitionAgentBoard([next]).running).toHaveLength(0);
  });

  it("a saved dispatch is queued and shows the pipeline id", () => {
    const card = queuedTaskFromPipelineReceipt({
      plannerTaskId: "task-new",
      title: "  看名册  ",
      assignee: "cursor-cloud",
      dueDate: "2026-10-26",
      receipt: { id: PIPELINE_ID, assignee: "cursor-cloud", runStatus: "queued" },
      now: 10,
    });
    expect(card.runStatus).toBe("queued");
    expect(card.pipelineTaskId).toBe(PIPELINE_ID);
    expect(card.assigneeKind).toBe("agent");
    expect(partitionAgentBoard([card]).queued.map((item) => item.pipelineTaskId)).toEqual([
      PIPELINE_ID,
    ]);
    expect(partitionAgentBoard([card]).running).toHaveLength(0);
  });

  it("releases a hung company-database write instead of leaving the button disabled", async () => {
    await expect(withDeadline(new Promise(() => {}), 15, "写入公司库超时")).rejects.toThrow(
      "写入公司库超时",
    );
  });
});
