import { describe, expect, it } from "vitest";
import { parseQuickCaptureInput } from "../quickCapture";

describe("quickCapture natural language parsing", () => {
  it("parses sticky note prefix // and memo:", () => {
    const res1 = parseQuickCaptureInput("// 突然想到今晚要买面包");
    expect(res1.type).toBe("note");
    expect(res1.content).toBe("突然想到今晚要买面包");

    const res2 = parseQuickCaptureInput("memo: 记一个电话号码 13800000000");
    expect(res2.type).toBe("note");
    expect(res2.content).toBe("记一个电话号码 13800000000");
  });

  it("parses journal snippet prefix .. and diary:", () => {
    const res1 = parseQuickCaptureInput(".. 今天窗外的阳光特别好");
    expect(res1.type).toBe("journal");
    expect(res1.content).toBe("今天窗外的阳光特别好");

    const res2 = parseQuickCaptureInput("日记: 跑完 5 公里，心旷神怡");
    expect(res2.type).toBe("journal");
    expect(res2.content).toBe("跑完 5 公里，心旷神怡");
  });

  it("parses task with tags, priority and due date", () => {
    const res = parseQuickCaptureInput(
      "明天上午开产品评审会 #工作 #敏捷 !重要 @今天",
      "2026-10-15",
    );
    expect(res.type).toBe("task");
    expect(res.content).toBe("明天上午开产品评审会");
    expect(res.tags).toEqual(["工作", "敏捷"]);
    expect(res.category).toBe("important-not-urgent");
    expect(res.dueDate).toBe("2026-10-15");
  });

  it("resolves @明天 from the provided local day", () => {
    const res = parseQuickCaptureInput("交周报 @明天", "2026-10-27");
    expect(res.dueDate).toBe("2026-10-28");
  });

  it("handles empty or simple input gracefully", () => {
    const empty = parseQuickCaptureInput("   ");
    expect(empty.type).toBe("task");
    expect(empty.content).toBe("");

    const simple = parseQuickCaptureInput("喝水");
    expect(simple.type).toBe("task");
    expect(simple.content).toBe("喝水");
    expect(simple.category).toBe("urgent-important");
  });
});
