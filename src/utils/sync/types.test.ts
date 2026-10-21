import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isSecretConfigKey,
  sanitizeConfigForSync,
  withLocalSecrets,
  dedupeActiveTasks,
  mergeCompletedPreferLocal,
  normalizeSyncData,
  getLocalSyncData,
  applySyncData,
  applyCategoryPayload,
  isEffectivelyEmptyCategory,
  isSampleTasksOnly,
  protectAgainstEmptyOverwrite,
  mergeRemoteIntoLocal,
  getLocalCategoryVersion,
  bumpCategoryVersion,
  getLocalManifest,
  getLocalSyncVersion,
  bumpSyncVersion,
  getCategoryPayload,
  type SyncData,
} from "./types";
import type { Task, CustomizationConfig } from "../../types";

describe("sync types & pure core logic", () => {
  const mockStore: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    const storageMock = {
      getItem: (key: string) => mockStore[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStore[key] = String(value);
      },
      removeItem: (key: string) => {
        delete mockStore[key];
      },
      clear: () => {
        for (const k of Object.keys(mockStore)) delete mockStore[k];
      },
      get length() {
        return Object.keys(mockStore).length;
      },
      key: (i: number) => Object.keys(mockStore)[i] ?? null,
    };
    vi.stubGlobal("localStorage", storageMock);
  });

  describe("isSecretConfigKey", () => {
    it("should identify sensitive secret keys correctly", () => {
      expect(isSecretConfigKey("aiApiKey")).toBe(true);
      expect(isSecretConfigKey("providerApiKeys")).toBe(true);
      expect(isSecretConfigKey("smtpPass")).toBe(true);
      expect(isSecretConfigKey("openai_api_key")).toBe(true);
      expect(isSecretConfigKey("userPassword")).toBe(true);
      expect(isSecretConfigKey("access_token")).toBe(true);
    });

    it("should not flag non-secret keys", () => {
      expect(isSecretConfigKey("syncSecrets")).toBe(false);
      expect(isSecretConfigKey("encryptedSecrets")).toBe(false);
      expect(isSecretConfigKey("aiMaxTokens")).toBe(false);
      expect(isSecretConfigKey("aiModel")).toBe(false);
      expect(isSecretConfigKey("cardBackground")).toBe(false);
    });
  });

  describe("sanitizeConfigForSync", () => {
    it("should strip all sensitive keys and local passphrase metadata", () => {
      const config: any = {
        aiProvider: "openai",
        aiApiKey: "sk-secret-123",
        providerApiKeys: { openai: "sk-secret-123" },
        smtpPass: "pass123",
        aiModel: "gpt-4o",
        encryptedSecrets: "cipher",
        syncSecretsPassphrase: "local",
        secretsPassphrase: "local",
      };

      const sanitized = sanitizeConfigForSync(config);
      expect(sanitized.aiModel).toBe("gpt-4o");
      expect(sanitized.aiProvider).toBe("openai");
      expect(sanitized.aiApiKey).toBeUndefined();
      expect(sanitized.providerApiKeys).toBeUndefined();
      expect(sanitized.smtpPass).toBeUndefined();
      expect(sanitized.encryptedSecrets).toBeUndefined();
      expect(sanitized.syncSecretsPassphrase).toBeUndefined();
      expect(sanitized.secretsPassphrase).toBeUndefined();
    });

    it("should preserve null and undefined unchanged", () => {
      expect(sanitizeConfigForSync(null)).toBeNull();
      expect(sanitizeConfigForSync(undefined)).toBeUndefined();
    });
  });

  describe("withLocalSecrets", () => {
    it("should strip secrets from incoming remote and restore local secrets", () => {
      const incoming: any = {
        aiProvider: "deepseek",
        aiApiKey: "malicious-remote-key",
        aiModel: "deepseek-chat",
      };

      const local: any = {
        aiApiKey: "trusted-local-key",
        providerApiKeys: { deepseek: "trusted-deepseek-key" },
        smtpPass: "local-smtp-pass",
      };

      const merged = withLocalSecrets(incoming, local);
      expect(merged.aiProvider).toBe("deepseek");
      expect(merged.aiModel).toBe("deepseek-chat");
      expect(merged.aiApiKey).toBe("trusted-local-key");
      expect(merged.providerApiKeys).toEqual({ deepseek: "trusted-deepseek-key" });
      expect(merged.smtpPass).toBe("local-smtp-pass");
    });

    it("should provide empty defaults when local has no keys", () => {
      const incoming = { aiProvider: "openai", aiModel: "gpt-4o" } as any;
      const merged = withLocalSecrets(incoming, null);
      expect(merged.aiApiKey).toBe("");
      expect(merged.providerApiKeys).toEqual({});
    });
  });

  describe("dedupeActiveTasks & mergeCompletedPreferLocal", () => {
    it("should remove active tasks that are present in completed tasks", () => {
      const active: Task[] = [
        { id: "1", title: "Active 1", category: "urgent-important" },
        { id: "2", title: "Active 2", category: "urgent-important" },
      ];
      const completed: Task[] = [{ id: "2", title: "Completed 2", category: "urgent-important" }];

      const deduped = dedupeActiveTasks(active, completed);
      expect(deduped.map((t) => t.id)).toEqual(["1"]);
    });

    it("should merge completed tasks with local winning on conflict", () => {
      const active: Task[] = [
        { id: "1", title: "Active 1", category: "urgent-important" },
        { id: "2", title: "Active 2", category: "urgent-important" },
      ];
      const remoteCompleted: Task[] = [
        { id: "2", title: "Remote Completed 2", category: "urgent-important" },
        { id: "3", title: "Remote Completed 3", category: "urgent-important" },
      ];
      const localCompleted: Task[] = [
        { id: "2", title: "Local Completed 2", category: "urgent-important" },
      ];

      const res = mergeCompletedPreferLocal(active, remoteCompleted, localCompleted);
      expect(res.tasks.map((t) => t.id)).toEqual(["1"]);
      expect(res.completedTasks.find((t) => t.id === "2")?.title).toBe("Local Completed 2");
      expect(res.completedTasks.find((t) => t.id === "3")?.title).toBe("Remote Completed 3");
    });
  });

  describe("normalizeSyncData", () => {
    it("should normalize valid raw sync payload and fallback timestamp to version", () => {
      const raw = {
        timestamp: 1720000000000,
        tasks: [{ id: "1", title: "Task 1", category: "urgent-important" }],
        stickyNotes: [],
      };

      const normalized = normalizeSyncData(raw);
      expect(normalized).not.toBeNull();
      expect(normalized?.version).toBe(1720000000000);
      expect(normalized?.tasks.length).toBe(1);
      expect(normalized?.journal).toEqual([]);
    });

    it("should return null for invalid or non-object payloads", () => {
      expect(normalizeSyncData(null)).toBeNull();
      expect(normalizeSyncData("invalid")).toBeNull();
      expect(normalizeSyncData({})).toBeNull(); // tasks is not array
    });

    it("should drop dirty repeatAnchorDay from active and completed tasks", () => {
      const normalized = normalizeSyncData({
        tasks: [
          {
            id: "a",
            title: "Daily",
            category: "urgent-important",
            repeat: "daily",
            repeatAnchorDay: 31,
          },
          {
            id: "b",
            title: "Monthly",
            category: "urgent-important",
            repeat: "monthly",
            repeatAnchorDay: 31,
          },
        ],
        completedTasks: [
          {
            id: "c",
            title: "Weekly",
            category: "urgent-important",
            repeat: "weekly",
            repeatAnchorDay: 15,
          },
        ],
      });

      expect(normalized).not.toBeNull();
      expect("repeatAnchorDay" in normalized!.tasks[0]).toBe(false);
      expect(normalized!.tasks[1].repeatAnchorDay).toBe(31);
      expect("repeatAnchorDay" in normalized!.completedTasks[0]).toBe(false);
    });

    it("rewrites a monthly anchor that does not match a mid-month due date", () => {
      const normalized = normalizeSyncData({
        tasks: [
          {
            id: "m",
            title: "Rent",
            category: "urgent-important",
            dueDate: "2026-03-10",
            repeat: "monthly",
            repeatAnchorDay: 31,
          },
          {
            id: "e",
            title: "Month end",
            category: "urgent-important",
            dueDate: "2026-02-28",
            repeat: "monthly",
            repeatAnchorDay: 31,
          },
        ],
      });

      expect(normalized).not.toBeNull();
      expect(normalized!.tasks[0].repeatAnchorDay).toBe(10);
      expect(normalized!.tasks[1].repeatAnchorDay).toBe(31);
    });
  });

  describe("applying sync payloads", () => {
    it("should sanitize stale anchors when a whole object lands", () => {
      mockStore["aero_completed_todos"] = JSON.stringify([
        {
          id: "c",
          title: "Local Weekly",
          category: "urgent-important",
          repeat: "weekly",
          repeatAnchorDay: 15,
        },
      ]);

      applySyncData({
        version: 1,
        tasks: [
          {
            id: "a",
            title: "Remote Daily",
            category: "urgent-important",
            repeat: "daily",
            repeatAnchorDay: 31,
          },
        ],
        completedTasks: [],
        stickyNotes: [],
        pomodoroLogs: [],
        countdowns: [],
        customizationConfig: null,
        journal: [],
      });

      const tasks = JSON.parse(mockStore["aero_todos"]);
      const completed = JSON.parse(mockStore["aero_completed_todos"]);
      expect("repeatAnchorDay" in tasks[0]).toBe(false);
      expect("repeatAnchorDay" in completed[0]).toBe(false);
    });

    it("should sanitize stale anchors in a per-category payload", () => {
      applyCategoryPayload("tasks", [
        {
          id: "a",
          title: "Remote Daily",
          category: "urgent-important",
          repeat: "daily",
          repeatAnchorDay: 31,
        },
      ]);

      const tasks = JSON.parse(mockStore["aero_todos"]);
      expect(tasks[0].repeat).toBe("daily");
      expect("repeatAnchorDay" in tasks[0]).toBe(false);
    });

    it("reads local tasks with a contradictory monthly anchor already rewritten", () => {
      mockStore["aero_todos"] = JSON.stringify([
        {
          id: "m",
          title: "Rent",
          category: "urgent-important",
          dueDate: "2026-03-10",
          repeat: "monthly",
          repeatAnchorDay: 31,
        },
      ]);
      mockStore["aero_completed_todos"] = JSON.stringify([
        {
          id: "e",
          title: "Clamped",
          category: "urgent-important",
          dueDate: "2026-04-30",
          repeat: "monthly",
          repeatAnchorDay: 31,
        },
      ]);

      const data = getLocalSyncData();
      expect(data.tasks[0].repeatAnchorDay).toBe(10);
      expect(data.completedTasks[0].repeatAnchorDay).toBe(31);
    });
  });

  describe("isEffectivelyEmptyCategory", () => {
    it("should check config emptiness", () => {
      expect(isEffectivelyEmptyCategory("config", null)).toBe(true);
      expect(isEffectivelyEmptyCategory("config", {})).toBe(true);
      expect(isEffectivelyEmptyCategory("config", { theme: "light" })).toBe(false);
    });

    it("should check array categories emptiness", () => {
      expect(isEffectivelyEmptyCategory("tasks", [])).toBe(true);
      expect(isEffectivelyEmptyCategory("tasks", null)).toBe(true);
      expect(isEffectivelyEmptyCategory("tasks", [{ id: "1" }])).toBe(false);
      expect(isEffectivelyEmptyCategory("journal", [])).toBe(true);
    });
  });

  describe("isSampleTasksOnly", () => {
    it("should return true when all task IDs are 1-3 digits", () => {
      const samples = [{ id: "1" }, { id: "2" }, { id: "100" }];
      expect(isSampleTasksOnly(samples)).toBe(true);
    });

    it("should return false when real user IDs or empty array", () => {
      expect(isSampleTasksOnly([])).toBe(false);
      expect(isSampleTasksOnly([{ id: "k3x8p2a" }, { id: "1" }])).toBe(false);
      expect(isSampleTasksOnly([{ id: "task-12345" }])).toBe(false);
    });
  });

  describe("protectAgainstEmptyOverwrite", () => {
    it("should protect journal from being overwritten by empty local", () => {
      const res = protectAgainstEmptyOverwrite("journal", [], [{ id: "j1" }], true);
      expect(res.skip).toBe(true);
    });

    it("should allow user-dirty deletion for other categories", () => {
      const res = protectAgainstEmptyOverwrite("tasks", [], [{ id: "t1" }], true);
      expect(res.skip).toBe(false);
    });

    it("should protect remote tasks when local has only startup sample tasks", () => {
      const samples = [{ id: "1" }, { id: "2" }];
      const remote = [{ id: "user-real-task" }];
      const res = protectAgainstEmptyOverwrite("tasks", samples, remote, false);
      expect(res.skip).toBe(true);
    });

    it("should merge config safely without skipping when both local and remote have data", () => {
      const local: CustomizationConfig = {
        aiProvider: "openai",
        aiModel: "gpt-4o",
      } as any;
      const remote: CustomizationConfig = {
        aiProvider: "deepseek",
        aiEndpoint: "https://api.deepseek.com",
      } as any;
      const res = protectAgainstEmptyOverwrite("config", local, remote, false);
      expect(res.skip).toBe(false);
    });
  });

  describe("mergeRemoteIntoLocal", () => {
    it("should merge arrays by ID with remote taking precedence and local preserved", () => {
      const local = [
        { id: "1", title: "Local only" },
        { id: "2", title: "Local version" },
      ];
      const remote = [
        { id: "2", title: "Remote version" },
        { id: "3", title: "Remote only" },
      ];

      const merged = mergeRemoteIntoLocal("stickyNotes", remote, local) as Array<{
        id: string;
        title: string;
      }>;
      expect(merged.length).toBe(3);
      expect(merged.find((item) => item.id === "1")?.title).toBe("Local only");
      expect(merged.find((item) => item.id === "2")?.title).toBe("Remote version");
      expect(merged.find((item) => item.id === "3")?.title).toBe("Remote only");
    });
  });

  describe("versioning helpers", () => {
    it("should bump and retrieve category versions and manifest", () => {
      expect(getLocalCategoryVersion("tasks")).toBe(0);
      expect(getLocalSyncVersion()).toBe(0);

      const ts = bumpCategoryVersion("tasks", "completedTasks");
      expect(getLocalCategoryVersion("tasks")).toBe(ts);
      expect(getLocalCategoryVersion("completedTasks")).toBe(ts);
      expect(getLocalCategoryVersion("stickyNotes")).toBe(0);

      const manifest = getLocalManifest();
      expect(manifest.tasks.version).toBe(ts);
      expect(manifest.completedTasks.version).toBe(ts);
      expect(manifest.stickyNotes.version).toBe(0);

      const globalTs = bumpSyncVersion();
      expect(getLocalSyncVersion()).toBe(globalTs);
    });
  });

  describe("getCategoryPayload", () => {
    it("should extract each corresponding category from SyncData and sanitize config", () => {
      const syncData: SyncData = {
        version: 12345,
        tasks: [{ id: "t1", title: "Task 1", category: "urgent-important" }],
        completedTasks: [{ id: "c1", title: "Done 1", category: "urgent-important" }],
        stickyNotes: [{ id: "n1", text: "Note", color: "tea", rotate: 0 }],
        pomodoroLogs: [{ id: "p1", timestamp: 1000, duration: 1500 }],
        countdowns: [{ id: "cd1", title: "Holiday", targetDate: "2026-12-25" }],
        customizationConfig: {
          qColors: {
            "urgent-important": "",
            "important-not-urgent": "",
            "urgent-not-important": "",
            "not-urgent-not-important": "",
          },
          cardBackground: "white",
          pinType: "pin",
          aiApiKey: "sensitive-secret-key",
          aiModel: "gpt-4o",
        },
        journal: [
          {
            id: "j1",
            linkKey: "2026-10-15",
            title: "2026-10-15",
            content: "Journal text",
            date: "2026-10-15",
            isDaily: true,
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      };

      expect(getCategoryPayload(syncData, "tasks")).toEqual(syncData.tasks);
      expect(getCategoryPayload(syncData, "completedTasks")).toEqual(syncData.completedTasks);
      expect(getCategoryPayload(syncData, "stickyNotes")).toEqual(syncData.stickyNotes);
      expect(getCategoryPayload(syncData, "pomodoroLogs")).toEqual(syncData.pomodoroLogs);
      expect(getCategoryPayload(syncData, "countdowns")).toEqual(syncData.countdowns);
      expect(getCategoryPayload(syncData, "journal")).toEqual(syncData.journal);

      const configPayload = getCategoryPayload(syncData, "config") as any;
      expect(configPayload.aiModel).toBe("gpt-4o");
      expect(configPayload.aiApiKey).toBeUndefined(); // Stripped by sanitizeConfigForSync
    });
  });
});
