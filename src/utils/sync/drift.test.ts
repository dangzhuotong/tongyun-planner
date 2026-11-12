import { describe, expect, it } from "vitest";
import { reconcileFingerprintDrift } from "./drift";

const day = (
  id: string,
  date: string,
  content: string,
  updatedAt: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  linkKey: date,
  title: date,
  content,
  date,
  isDaily: true,
  createdAt: updatedAt,
  updatedAt,
  ...extra,
});

describe("reconcileFingerprintDrift", () => {
  it("aligns identical journal JSON when only the server timestamp changed", () => {
    const local = [day("j1", "2026-11-07", "同一篇", 10)];
    const remote = [day("j1", "2026-11-07", "同一篇", 10)];
    expect(reconcileFingerprintDrift("journal", local, remote).action).toBe("align");
  });

  it("keeps a local-only day and does not ask the user to pick a side", () => {
    const local = [day("j8", "2026-11-08", "新的一天", 20), day("j7", "2026-11-07", "同一篇", 11)];
    const remote = [day("j7", "2026-11-07", "同一篇", 10)];
    const decision = reconcileFingerprintDrift("journal", local, remote);
    expect(decision.action).toBe("upload");
    if (decision.action !== "upload") return;
    const payload = decision.payload as { id: string; date: string; updatedAt: number }[];
    expect(payload.map((entry) => entry.date).sort()).toEqual(["2026-11-07", "2026-11-08"]);
    expect(payload.find((entry) => entry.id === "j7")?.updatedAt).toBe(11);
  });

  it("conflicts when the same entry differs outside the body", () => {
    const local = [
      day("j8", "2026-11-08", "新的一天", 20),
      day("j7", "2026-11-07", "同一篇", 11, { stamp: "local" }),
    ];
    const remote = [day("j7", "2026-11-07", "同一篇", 10, { stamp: "remote" })];
    const decision = reconcileFingerprintDrift("journal", local, remote);
    expect(decision.action).toBe("conflict");
  });

  it("still conflicts when the same entry's text differs", () => {
    const local = [day("j7", "2026-11-07", "本机改过", 20)];
    const remote = [day("j7", "2026-11-07", "云端改过", 21)];
    expect(reconcileFingerprintDrift("journal", local, remote).action).toBe("conflict");
  });

  it("does not auto-merge non-journal categories when the payload differs", () => {
    expect(reconcileFingerprintDrift("tasks", [{ id: "a" }], [{ id: "b" }]).action).toBe(
      "conflict",
    );
  });

  it("aligns a non-journal payload when only key order differs", () => {
    expect(
      reconcileFingerprintDrift("tasks", [{ id: "a", title: "x" }], [{ title: "x", id: "a" }])
        .action,
    ).toBe("align");
  });
});
