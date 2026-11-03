import { describe, expect, it } from "vitest";
import type { Task } from "../../../types";
import { groupTasksByDueDate, splitDayTasks } from "../dayTasks";

const task = (overrides: Partial<Task>): Task => ({
  id: "t",
  title: "标题",
  category: "not-urgent-not-important",
  ...overrides,
});

describe("groupTasksByDueDate", () => {
  it("按任务日期分组，没有 dueDate 的任务不属于任何一天", () => {
    const map = groupTasksByDueDate([
      task({ id: "a", dueDate: "2026-11-02" }),
      task({ id: "b", dueDate: "2026-11-02" }),
      task({ id: "c", dueDate: "2026-11-03" }),
      task({ id: "d" }),
    ]);
    expect(Object.keys(map)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(map["2026-11-02"].map((t) => t.id)).toEqual(["a", "b"]);
    expect(map["2026-11-03"].map((t) => t.id)).toEqual(["c"]);
  });

  it("容忍非数组入参，不抛异常", () => {
    expect(groupTasksByDueDate(undefined as unknown as Task[])).toEqual({});
  });
});

describe("splitDayTasks", () => {
  it("已完成任务按任务日期归属，不按完成时间", () => {
    // 11-02 到期的任务在 11-03 才勾完
    const late = task({
      id: "late",
      dueDate: "2026-11-02",
      completedAt: ts("2026-11-03", "09:00"),
    });
    const completed = groupTasksByDueDate([late]);
    expect(splitDayTasks({}, completed, "2026-11-02").completed.map((t) => t.id)).toEqual(["late"]);
    expect(splitDayTasks({}, completed, "2026-11-03").hasAny).toBe(false);
  });

  it("已完成排在未完成之后由调用方保证，这里只提供两个分组", () => {
    const pending = groupTasksByDueDate([task({ id: "p", dueDate: "2026-11-02" })]);
    const completed = groupTasksByDueDate([
      task({ id: "c", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "08:00") }),
    ]);
    const groups = splitDayTasks(pending, completed, "2026-11-02");
    expect(groups.pending.map((t) => t.id)).toEqual(["p"]);
    expect(groups.completed.map((t) => t.id)).toEqual(["c"]);
    expect(groups.hasAny).toBe(true);
  });

  it("当天全部完成时 hasAny 仍为真，全部清空才为空状态", () => {
    const completed = groupTasksByDueDate([
      task({ id: "c", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "08:00") }),
    ]);
    expect(splitDayTasks({}, completed, "2026-11-02").hasAny).toBe(true);
    expect(splitDayTasks({}, {}, "2026-11-02").hasAny).toBe(false);
  });

  it("已完成按完成时间从早到晚，缺失时间的历史数据排在最前", () => {
    const completed = groupTasksByDueDate([
      task({ id: "noTime", dueDate: "2026-11-02" }),
      task({ id: "later", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "15:30") }),
      task({ id: "earlier", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "09:10") }),
    ]);
    expect(splitDayTasks({}, completed, "2026-11-02").completed.map((t) => t.id)).toEqual([
      "noTime",
      "earlier",
      "later",
    ]);
  });

  it("撤销完成后任务回到同一天的未完成分组，不会跳到别的日期", () => {
    const done = task({ id: "x", dueDate: "2026-11-02", completedAt: ts("2026-11-03", "20:00") });
    const undone = { ...done } as Task;
    delete undone.completedAt;

    const asCompleted = splitDayTasks({}, groupTasksByDueDate([done]), "2026-11-02");
    const asPending = splitDayTasks(groupTasksByDueDate([undone]), {}, "2026-11-02");

    expect(asCompleted.completed).toHaveLength(1);
    expect(asCompleted.pending).toHaveLength(0);
    expect(asPending.pending).toHaveLength(1);
    expect(asPending.completed).toHaveLength(0);
  });

  it("不修改传入的分组结果", () => {
    const completed = groupTasksByDueDate([
      task({ id: "b", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "15:30") }),
      task({ id: "a", dueDate: "2026-11-02", completedAt: ts("2026-11-02", "09:10") }),
    ]);
    splitDayTasks({}, completed, "2026-11-02");
    expect(completed["2026-11-02"].map((t) => t.id)).toEqual(["b", "a"]);
  });
});

function ts(day: string, time: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}
