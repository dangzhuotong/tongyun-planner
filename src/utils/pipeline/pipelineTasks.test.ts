import { describe, expect, it } from "vitest";
import type { Task } from "../../types";
import { mergeCompanyRoster } from "./companyRoster";
import { publishPlannerPipelineTask } from "./pipelineGateway";
import { fixtureAgentRows, fixtureWorkerRows } from "./rosterFixture";
import {
  alignTaskWithPipeline,
  companyRosterSlug,
  createMemoryTaskGateway,
  mapPipelineTaskStatus,
  planPipelineTaskWrite,
  referenceTaskColumns,
  resolveCompanyAssigneeId,
  writePipelineTask,
  type TaskColumn,
} from "./pipelineTasks";

const NOW = 1_761_456_000_000;

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return { category: "important-not-urgent", ...partial };
}

describe("pipeline tasks follow tongyun_pipeline", () => {
  it("开始写入 assignee 与 todo，回执停在待跑", async () => {
    const gateway = createMemoryTaskGateway(referenceTaskColumns());
    const receipt = await writePipelineTask(
      gateway,
      {
        intent: "start",
        plannerTaskId: "task-1",
        title: "看名册",
        detail: "按库开工",
        assignee: "cursor-cloud",
      },
      { insertId: "3485152520443698361" },
    );

    expect(receipt.written).toBe(true);
    expect(receipt.id).toBe("3485152520443698361");
    expect(receipt.assignee).toBe("cursor-cloud");
    expect(receipt.status).toBe("todo");
    expect(receipt.runStatus).toBe("queued");
    expect(mapPipelineTaskStatus("todo")).toBe("queued");
    expect(mapPipelineTaskStatus("doing")).toBe("running");
    expect(gateway.rows[0]).toMatchObject({
      id: "3485152520443698361",
      assignee: "cursor-cloud",
      status: "todo",
      source: "planner",
      planner_task_id: "task-1",
      title: "看名册",
      detail: "按库开工",
    });
  });

  it("改派回写另一名册工人，状态放回可领", async () => {
    const gateway = createMemoryTaskGateway(referenceTaskColumns());
    const started = await writePipelineTask(
      gateway,
      {
        intent: "start",
        plannerTaskId: "task-2",
        title: "改派",
        assignee: "cursor-cloud",
      },
      { insertId: "200" },
    );
    const moved = await writePipelineTask(gateway, {
      intent: "reassign",
      plannerTaskId: "task-2",
      pipelineTaskId: started.id,
      title: "改派",
      assignee: "agy-ibz",
    });

    expect(moved.written).toBe(true);
    expect(moved.assignee).toBe("agy-ibz");
    expect(moved.status).toBe("todo");
    expect(moved.runStatus).toBe("queued");
    expect(gateway.rows).toHaveLength(1);
    expect(gateway.rows[0]?.assignee).toBe("agy-ibz");
  });

  it("库里已经 doing 时，开始不对齐成本机在跑，也不把库打回 todo", async () => {
    const gateway = createMemoryTaskGateway(referenceTaskColumns());
    gateway.rows.push({
      id: "100",
      title: "已领",
      assignee: "cursor-cloud",
      status: "doing",
      source: "planner",
      planner_task_id: "task-9",
      detail: null,
      created_at: "now",
      updated_at: "now",
    });
    const receipt = await writePipelineTask(gateway, {
      intent: "start",
      plannerTaskId: "task-9",
      pipelineTaskId: "100",
      title: "已领",
      assignee: "cursor-cloud",
    });

    expect(receipt.written).toBe(false);
    expect(receipt.runStatus).toBe("running");
    expect(gateway.rows[0]?.status).toBe("doing");
    const local = task({
      id: "task-9",
      title: "已领",
      assigneeKind: "agent",
      assigneeAgentId: "cursor-cloud",
      runStatus: "queued",
      pipelineTaskId: "100",
    });
    expect(alignTaskWithPipeline(local, receipt)?.runStatus).toBe("running");
  });

  it("完成和取消写进公司库的 status，回执跟着库走", async () => {
    const gateway = createMemoryTaskGateway(referenceTaskColumns());
    const started = await writePipelineTask(
      gateway,
      {
        intent: "start",
        plannerTaskId: "task-s",
        title: "收尾",
        assignee: "cursor-cloud",
      },
      { insertId: "300" },
    );
    const done = await writePipelineTask(gateway, {
      intent: "settle",
      plannerTaskId: "task-s",
      pipelineTaskId: started.id,
      title: "收尾",
      assignee: "cursor-cloud",
      settleAs: "done",
    });
    expect(done.status).toBe("done");
    expect(done.runStatus).toBe("done");
    const cancelled = await writePipelineTask(gateway, {
      intent: "settle",
      plannerTaskId: "task-s",
      pipelineTaskId: started.id,
      title: "收尾",
      assignee: "cursor-cloud",
      settleAs: "cancelled",
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.runStatus).toBe("cancelled");
    expect(gateway.rows).toHaveLength(1);
  });

  it("写库失败时不返回成功回执，也不带出连接串", async () => {
    const gateway = createMemoryTaskGateway(referenceTaskColumns());
    gateway.execute = async () => {
      throw new Error("mysql://user:secret@host/tongyun_pipeline denied");
    };
    await expect(
      writePipelineTask(gateway, {
        intent: "start",
        plannerTaskId: "task-3",
        title: "会失败",
        assignee: "cursor-cloud",
      }),
    ).rejects.toThrow(/^任务没有写入公司库$/);
  });

  it("没有 assignee 列、或还有必填列时，直接说明原因", () => {
    const columns = referenceTaskColumns();
    const draft = {
      intent: "start" as const,
      plannerTaskId: "task-4",
      title: "缺列",
      assignee: "cursor-cloud",
    };
    expect(() =>
      planPipelineTaskWrite(
        columns.filter((column) => column.name !== "assignee"),
        draft,
        null,
        "401",
      ),
    ).toThrow("公司库 tasks 没有 assignee 列，任务未写入");

    const withRepo: TaskColumn[] = [
      ...columns,
      {
        name: "repo",
        nullable: false,
        hasDefault: false,
        autoIncrement: false,
        columnType: "varchar(64)",
      },
    ];
    expect(() => planPipelineTaskWrite(withRepo, draft, null, "402")).toThrow(
      "公司库 tasks 还有必填列未写入：repo",
    );
  });

  it("status 不是 enum 时用 todo；enum 里没有 todo 时用库里的可领值", () => {
    const columns = referenceTaskColumns();
    const varchar = columns.map((column) =>
      column.name === "status"
        ? { ...column, columnType: "varchar(32)", hasDefault: false }
        : column,
    );
    expect(
      planPipelineTaskWrite(
        varchar,
        { intent: "start", plannerTaskId: "task-5", title: "自由状态", assignee: "cursor-cloud" },
        null,
        "501",
      ).status,
    ).toBe("todo");

    const queued = columns.map((column) =>
      column.name === "status"
        ? { ...column, columnType: "enum('queued','doing','done')" }
        : column,
    );
    expect(
      planPipelineTaskWrite(
        queued,
        { intent: "start", plannerTaskId: "task-6", title: "排队", assignee: "agy-ibz" },
        null,
        "502",
      ).status,
    ).toBe("queued");
  });

  it("新建人选必须是公司名册，本机助手不算", () => {
    const roster = mergeCompanyRoster(fixtureAgentRows(), fixtureWorkerRows(NOW), NOW);
    expect(companyRosterSlug(roster, "cursor-cloud")).toBe("cursor-cloud");
    expect(companyRosterSlug(roster, "agent_local_assistant")).toBeNull();
    expect(companyRosterSlug(roster, "agy")).toBe("agy");
    expect(resolveCompanyAssigneeId([{ id: "cursor-cloud" }, { id: "ama" }], "nope")).toBe(
      "cursor-cloud",
    );
    expect(resolveCompanyAssigneeId([{ id: "cursor-cloud" }, { id: "ama" }], "ama")).toBe("ama");
  });

  it("改回自己的卡片不会被库里的旧负责人拉回来", () => {
    const human = task({
      id: "task-h",
      title: "自己做",
      assigneeKind: "human",
      pipelineTaskId: "9",
    });
    expect(
      alignTaskWithPipeline(human, {
        id: "9",
        assignee: "cursor-cloud",
        status: "todo",
        runStatus: "queued",
      }),
    ).toBeNull();
  });

  it("没配公司库时开始失败，不会去连一个空网关", async () => {
    await expect(
      publishPlannerPipelineTask(
        {
          intent: "start",
          plannerTaskId: "task-7",
          title: "无库",
          assignee: "cursor-cloud",
        },
        {
          fixture: false,
          resolveDsn: async () => ({ dsn: null, via: "none" }),
          openGateway: async () => {
            throw new Error("should not connect");
          },
        },
      ),
    ).rejects.toThrow("未配置公司库，任务未写入 tongyun_pipeline");
  });
});
