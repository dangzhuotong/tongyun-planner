import { describe, it, expect, beforeEach, vi } from "vitest";
import { agentRepository, dispatchRepository } from "./repositories";
import type { DomainAgent } from "../types";

describe("Agent & Dispatch Repositories", () => {
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

  describe("AgentRepository (P-AA-04 CRUD & Disabled Filter)", () => {
    it("loads default agent when local storage is empty", async () => {
      const agents = await agentRepository.load();
      expect(agents.length).toBeGreaterThanOrEqual(1);
      expect(agents[0].handle).toBe("本地助手");
      expect(agents[0].kind).toBe("manual");
      expect(agents[0].enabled).toBe(true);
    });

    it("can create, update, and delete an agent", async () => {
      const newAgent: DomainAgent = {
        id: "agent_test_1",
        handle: "测试助手",
        kind: "manual",
        enabled: true,
        meta: {},
        updatedAt: Date.now(),
      };
      await agentRepository.save(newAgent);
      let agents = await agentRepository.load();
      expect(agents.some((a) => a.id === "agent_test_1" && a.handle === "测试助手")).toBe(true);

      // Update handle
      const updatedAgent = { ...newAgent, handle: "测试助手-改" };
      await agentRepository.save(updatedAgent);
      agents = await agentRepository.load();
      expect(agents.find((a) => a.id === "agent_test_1")?.handle).toBe("测试助手-改");

      // Delete agent
      await agentRepository.delete("agent_test_1");
      agents = await agentRepository.load();
      expect(agents.some((a) => a.id === "agent_test_1")).toBe(false);
    });

    it("filters out disabled agents in getEnabled() (P-AA-04 禁用后不能新派)", async () => {
      const disabledAgent: DomainAgent = {
        id: "agent_disabled_1",
        handle: "停用助手",
        kind: "local_runner",
        enabled: false,
        meta: {},
        updatedAt: Date.now(),
      };
      await agentRepository.save(disabledAgent);

      const all = await agentRepository.load();
      expect(all.some((a) => a.id === "agent_disabled_1")).toBe(true);

      const enabled = await agentRepository.getEnabled();
      expect(enabled.some((a) => a.id === "agent_disabled_1")).toBe(false);
    });
  });

  describe("DispatchRepository (P-AA-02, P-AA-03, P-AA-04)", () => {
    it("records a new queued dispatch for a task (P-AA-02)", async () => {
      const disp = await dispatchRepository.recordDispatch(
        "task_123",
        "agent_local_assistant",
        "queued",
      );
      expect(disp.taskId).toBe("task_123");
      expect(disp.agentId).toBe("agent_local_assistant");
      expect(disp.status).toBe("queued");

      const fetched = await dispatchRepository.getDispatchForTask("task_123");
      expect(fetched?.status).toBe("queued");
    });

    it("cancels an active dispatch when task is reassigned (P-AA-03)", async () => {
      await dispatchRepository.recordDispatch("task_456", "agent_local_assistant", "queued");
      let current = await dispatchRepository.getDispatchForTask("task_456");
      expect(current?.status).toBe("queued");

      await dispatchRepository.cancelDispatch("task_456");
      current = await dispatchRepository.getDispatchForTask("task_456");
      expect(current?.status).toBe("cancelled");
    });

    it("updates dispatch status to done when manually marked (P-AA-04 标记已跑)", async () => {
      await dispatchRepository.recordDispatch("task_789", "agent_local_assistant", "queued");
      await dispatchRepository.updateStatus("task_789", "done");

      const current = await dispatchRepository.getDispatchForTask("task_789");
      expect(current?.status).toBe("done");
    });
  });
});
