import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  syncFullSchemaWithRemote,
  getRemoteDsn,
  setRemoteDsn,
  setRemoteDatabaseOverrideForTesting,
  assertSecretsSafeForSync,
  LAST_REMOTE_SYNC_TIME_KEY,
  SYNC_TABLES_WHITELIST,
} from "./remoteDbSync";
import { setDatabaseOverrideForTesting } from "../../data/domainDatabase";
import { writeSyncSecretsPassphrase, setSyncSecretsOptIn } from "./syncSecretsPref";

// 构造通用的 In-Memory Mock Database 供 SQLite 和 MySQL 模拟使用
function createMockDb() {
  const tables: Record<string, any[]> = {
    tasks: [],
    journal_entries: [],
    pomodoro_logs: [],
    habits: [],
    agents: [],
    task_dispatch: [],
    sticky_notes: [],
    countdowns: [],
    timeblocks: [],
    user_prefs: [],
    sync_state: [],
    sync_outbox: [],
  };

  return {
    tables,
    async execute(sql: string, params?: any[]): Promise<any> {
      const trimmed = sql.trim().toUpperCase();
      if (
        trimmed.startsWith("BEGIN") ||
        trimmed.startsWith("COMMIT") ||
        trimmed.startsWith("ROLLBACK")
      ) {
        return { rowsAffected: 0 };
      }

      if (sql.includes("DELETE FROM sync_outbox")) {
        const count = tables.sync_outbox.length;
        tables.sync_outbox = [];
        return { rowsAffected: count };
      }

      // tasks
      if (sql.includes("INSERT INTO tasks") || sql.includes("INSERT OR REPLACE INTO tasks")) {
        const id = params?.[0];
        tables.tasks = tables.tasks.filter((t) => t.id !== id);
        tables.tasks.push({
          id,
          title: params?.[1],
          description: params?.[2],
          notes: params?.[3],
          category: params?.[4],
          due_date: params?.[5],
          due_time: params?.[6],
          is_favorite: params?.[7],
          is_pinned: params?.[8],
          repeat_rule: params?.[9],
          repeat_anchor_day: params?.[10],
          priority: params?.[11],
          energy_level: params?.[12],
          estimated_pomodoros: params?.[13],
          journal_id: params?.[14],
          completed_at: params?.[15],
          assignee_kind: params?.[16],
          assignee_agent_id: params?.[17],
          run_status: params?.[18],
          stamp: params?.[19],
          time_block_start: params?.[20],
          time_block_end: params?.[21],
          payload_json: params?.[22],
          device_id: params?.[23],
          updated_at: params?.[24] || Date.now(),
          deleted_at: params?.[25] ?? null,
        });
        return { rowsAffected: 1 };
      }

      // journal_entries
      if (
        sql.includes("INSERT INTO journal_entries") ||
        sql.includes("INSERT OR REPLACE INTO journal_entries")
      ) {
        const id = params?.[0] !== undefined ? String(params[0]) : String(Date.now());
        tables.journal_entries = tables.journal_entries.filter((j) => String(j.id) !== id);
        tables.journal_entries.push({
          id,
          day: params?.[1],
          title: params?.[2],
          body: params?.[3],
          meta_json: params?.[4],
          link_key: params?.[5],
          entry_date: params?.[6],
          is_daily: params?.[7],
          mood: params?.[8],
          ai_comment: params?.[9],
          template_id: params?.[10],
          washi_tape: params?.[11],
          stamp: params?.[12],
          stickers_json: params?.[13],
          created_at: params?.[14],
          updated_at: Date.now(),
          deleted_at: null,
        });
        return { rowsAffected: 1 };
      }

      // user_prefs
      if (
        sql.includes("INSERT INTO user_prefs") ||
        sql.includes("INSERT OR REPLACE INTO user_prefs")
      ) {
        tables.user_prefs = [
          {
            id: 1,
            locale: params?.[0],
            nickname: params?.[1],
            pomodoro_minutes: params?.[2],
            prefs_json: params?.[3],
            updated_at: params?.[4] || Date.now(),
          },
        ];
        return { rowsAffected: 1 };
      }

      // habits
      if (sql.includes("INSERT INTO habits") || sql.includes("INSERT OR REPLACE INTO habits")) {
        const id = params?.[0];
        tables.habits = tables.habits.filter((h) => h.id !== id);
        tables.habits.push({
          id,
          name: params?.[1],
          emoji: params?.[2],
          meta_json: params?.[3],
          updated_at: params?.[4] || Date.now(),
          deleted_at: params?.[5] ?? null,
        });
        return { rowsAffected: 1 };
      }

      // sticky_notes
      if (
        sql.includes("INSERT INTO sticky_notes") ||
        sql.includes("INSERT OR REPLACE INTO sticky_notes")
      ) {
        const id = params?.[0];
        tables.sticky_notes = tables.sticky_notes.filter((s) => s.id !== id);
        tables.sticky_notes.push({
          id,
          title: params?.[1],
          body: params?.[2],
          color: params?.[3],
          rotate: params?.[4],
          meta_json: params?.[5],
          updated_at: params?.[6] || Date.now(),
          deleted_at: params?.[7] ?? null,
        });
        return { rowsAffected: 1 };
      }

      // pomodoro_logs
      if (
        sql.includes("INSERT INTO pomodoro_logs") ||
        sql.includes("INSERT OR REPLACE INTO pomodoro_logs")
      ) {
        const id = params?.[0];
        tables.pomodoro_logs = tables.pomodoro_logs.filter((p) => p.id !== id);
        tables.pomodoro_logs.push({
          id,
          timestamp: params?.[1] || Date.now(),
          duration: params?.[2] || 25,
          duration_sec:
            typeof params?.[2] === "number" && params[2] > 60
              ? params[2]
              : (params?.[2] || 25) * 60,
          task_id: params?.[3] ?? null,
          task_title: params?.[4] ?? null,
          created_at: params?.[5] || Date.now(),
          occurred_at: params?.[1] || Date.now(),
          deleted_at: params?.[6] ?? null,
          data: params?.[7] ?? null,
          meta_json: params?.[5] ?? null,
        });
        return { rowsAffected: 1 };
      }

      // agents
      if (sql.includes("INSERT INTO agents") || sql.includes("INSERT OR REPLACE INTO agents")) {
        const isLocal = sql.includes("INSERT OR REPLACE INTO agents");
        const handle = isLocal ? params?.[1] : params?.[0];
        tables.agents = tables.agents.filter((a) => a.handle !== handle);
        tables.agents.push({
          id: isLocal ? params?.[0] : `agent_${handle}`,
          handle,
          kind: isLocal ? params?.[2] : params?.[1],
          enabled: isLocal ? params?.[3] : params?.[2],
          meta: isLocal ? params?.[4] : params?.[3],
          meta_json: isLocal ? params?.[4] : params?.[3],
          updated_at: Date.now(),
        });
        return { rowsAffected: 1 };
      }

      // task_dispatch
      if (
        sql.includes("INSERT INTO task_dispatch") ||
        sql.includes("INSERT OR REPLACE INTO task_dispatch")
      ) {
        const isLocal = sql.includes("INSERT OR REPLACE INTO task_dispatch");
        const id = isLocal ? params?.[0] : String(Date.now());
        tables.task_dispatch = tables.task_dispatch.filter((d) => d.id !== id);
        tables.task_dispatch.push({
          id,
          task_id: isLocal ? params?.[1] : params?.[0],
          planner_task_id: isLocal ? params?.[1] : params?.[0],
          agent_id: isLocal ? params?.[2] : params?.[1],
          status: isLocal ? params?.[3] : params?.[2],
          pipeline_task_id: isLocal ? params?.[5] : params?.[3],
          note: isLocal ? params?.[4] : params?.[4],
          created_at: Date.now(),
          updated_at: Date.now(),
        });
        return { rowsAffected: 1 };
      }

      // countdowns
      if (
        sql.includes("INSERT INTO countdowns") ||
        sql.includes("INSERT OR REPLACE INTO countdowns")
      ) {
        const id = params?.[0];
        tables.countdowns = tables.countdowns.filter((c) => c.id !== id);
        tables.countdowns.push({
          id,
          title: params?.[1],
          target_date: params?.[2],
          emoji: params?.[3],
          color: params?.[4],
          is_lunar: params?.[5],
          updated_at: params?.[6] || Date.now(),
          data: params?.[8],
          meta_json: params?.[6],
        });
        return { rowsAffected: 1 };
      }

      // timeblocks
      if (
        sql.includes("INSERT INTO timeblocks") ||
        sql.includes("INSERT OR REPLACE INTO timeblocks")
      ) {
        const id = params?.[0];
        tables.timeblocks = tables.timeblocks.filter((b) => b.id !== id);
        tables.timeblocks.push({
          id,
          date: params?.[1],
          day: params?.[1],
          start_time: params?.[2],
          end_time: params?.[3],
          task_id: params?.[4],
          title: params?.[5],
          color: params?.[6],
          updated_at: params?.[7] || Date.now(),
          data: params?.[9],
          meta_json: params?.[7],
        });
        return { rowsAffected: 1 };
      }

      // sync_state
      if (
        sql.includes("INSERT INTO sync_state") ||
        sql.includes("INSERT OR REPLACE INTO sync_state")
      ) {
        tables.sync_state.push({
          entity: params?.[0] || "all",
          version: params?.[1] || Date.now(),
          updated_at: Date.now(),
        });
        return { rowsAffected: 1 };
      }

      return { rowsAffected: 1 };
    },

    async select<T = any>(sql: string, params?: any[]): Promise<T[]> {
      if (sql.includes("SELECT 1")) return [{ 1: 1 }] as any;
      if (sql.includes("FROM tasks")) {
        const minUpdated = params?.[0] || 0;
        return tables.tasks.filter((t) => (t.updated_at || 0) >= minUpdated) as any;
      }
      if (sql.includes("FROM journal_entries")) {
        return tables.journal_entries as any;
      }
      if (sql.includes("FROM habits")) {
        return tables.habits as any;
      }
      if (sql.includes("FROM sticky_notes")) {
        return tables.sticky_notes as any;
      }
      if (sql.includes("FROM user_prefs")) {
        return tables.user_prefs as any;
      }
      if (sql.includes("FROM countdowns")) {
        return tables.countdowns as any;
      }
      if (sql.includes("FROM timeblocks")) {
        return tables.timeblocks as any;
      }
      if (sql.includes("FROM pomodoro_logs")) {
        return tables.pomodoro_logs as any;
      }
      if (sql.includes("FROM agents")) {
        return tables.agents as any;
      }
      if (sql.includes("FROM task_dispatch")) {
        return tables.task_dispatch as any;
      }
      if (sql.includes("FROM sync_state")) {
        return tables.sync_state as any;
      }
      if (sql.includes("FROM sync_outbox")) {
        return tables.sync_outbox as any;
      }
      return [] as any;
    },
  };
}

describe("Remote Database Full Schema Sync (PRD remote-all + full-schema)", () => {
  let localDb: ReturnType<typeof createMockDb>;
  let remoteDb: ReturnType<typeof createMockDb>;
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

    localDb = createMockDb();
    remoteDb = createMockDb();
    setDatabaseOverrideForTesting(localDb as any);
    setRemoteDatabaseOverrideForTesting(null);
  });

  it("验收标准 1: 无 DSN 仅本机 SQLite，直接跳过远端同步", async () => {
    // 确保没有配置 DSN
    expect(getRemoteDsn()).toBeNull();

    // 本地写入任务
    localDb.tables.tasks.push({
      id: "task-offline-1",
      title: "本地纯离线任务",
      category: "urgent-important",
      updated_at: Date.now(),
    });

    const stats = await syncFullSchemaWithRemote();
    expect(stats.pushed).toBe(0);
    expect(stats.pulled).toBe(0);
    // 远端保持为空
    expect(remoteDb.tables.tasks.length).toBe(0);
    // 本地数据完好
    expect(localDb.tables.tasks.length).toBe(1);
  });

  it("验收标准 2: 配 DSN 后 full-schema 业务表推远端并可拉回", async () => {
    setRemoteDsn("mysql://user:pass@host:4000/tongyun_personal");
    expect(getRemoteDsn()).toContain("tongyun_personal");
    setRemoteDatabaseOverrideForTesting(remoteDb as any);

    // 1. 本地准备待办、日记、习惯、便签
    const now = Date.now();
    localDb.tables.tasks.push({
      id: "task-100",
      title: "测试远端待办同步",
      category: "urgent-important",
      priority: "high",
      subtasks_json: JSON.stringify([{ id: "sub-1", title: "子任务1", completed: false }]),
      tags_json: JSON.stringify(["研发", "P0"]),
      updated_at: now,
    });

    localDb.tables.journal_entries.push({
      id: "1729000000000",
      title: "晴朗秋日手帐",
      body: "今天将全量领域表推向远端 TiDB",
      entry_date: "2026-10-25",
      is_daily: 1,
      mood: "😊",
      updated_at: now,
    });

    localDb.tables.habits.push({
      id: "habit-1",
      name: "早起晨跑",
      emoji: "🏃",
      done_today: 1,
      streak: 5,
      updated_at: now,
    });

    localDb.tables.sticky_notes.push({
      id: "note-1",
      title: "灵感便利贴",
      text: "架构极简，拒绝 KV",
      color: "#FEF08A",
      updated_at: now,
    });

    // 2. 执行 Full-Schema 同步（Push 本地数据到远端）
    const pushStats = await syncFullSchemaWithRemote();
    expect(pushStats.pushed).toBeGreaterThanOrEqual(4);

    // 验证远端已成功存入各业务表
    expect(remoteDb.tables.tasks.find((t) => t.id === "task-100")).toBeDefined();
    expect(remoteDb.tables.tasks.find((t) => t.id === "task-100")?.title).toBe("测试远端待办同步");
    expect(remoteDb.tables.journal_entries.length).toBe(1);
    expect(remoteDb.tables.journal_entries[0].title).toBe("晴朗秋日手帐");
    expect(remoteDb.tables.habits.length).toBe(1);
    expect(remoteDb.tables.sticky_notes.length).toBe(1);

    // 3. 验证 Pull（新设备或清空本地后从远端拉回）
    const freshLocalDb = createMockDb();
    setDatabaseOverrideForTesting(freshLocalDb as any);
    localStorage.removeItem(LAST_REMOTE_SYNC_TIME_KEY); // 模拟首次拉取

    const pullStats = await syncFullSchemaWithRemote();
    expect(pullStats.pulled).toBeGreaterThanOrEqual(1);
    // 验证新本地数据库已被远端数据追平
    expect(freshLocalDb.tables.tasks.find((t) => t.id === "task-100")).toBeDefined();
    expect(freshLocalDb.tables.tasks.find((t) => t.id === "task-100")?.title).toBe(
      "测试远端待办同步",
    );
    expect(
      freshLocalDb.tables.journal_entries.find((j) => j.title === "晴朗秋日手帐"),
    ).toBeDefined();
    expect(freshLocalDb.tables.habits.find((h) => h.id === "habit-1")).toBeDefined();
    expect(freshLocalDb.tables.sticky_notes.find((n) => n.id === "note-1")).toBeDefined();
  });

  it("验收标准 3: 机密无口令拒明文（检测到敏感密钥且无口令时严禁明文推入远端）", async () => {
    setRemoteDsn("mysql://user:pass@host:4000/tongyun_personal");
    setRemoteDatabaseOverrideForTesting(remoteDb as any);

    // 1. 用户开启了机密同步，且配置了敏感密钥，但未设置主密码口令
    setSyncSecretsOptIn(true);
    writeSyncSecretsPassphrase(""); // 无口令

    const sensitiveConfig = {
      aiApiKey: "sk-proj-supersecretkey123456789",
      providerApiKeys: {
        openai: "sk-openai-key-secret",
        anthropic: "sk-ant-key-secret",
      },
    };

    // 校验函数必须直接抛出异常阻止
    expect(() => assertSecretsSafeForSync(sensitiveConfig)).toThrow(
      "机密无口令拒明文：未设置同步主密码，禁止上传敏感凭据",
    );

    // 放入本地 user_prefs，触发 syncFullSchemaWithRemote 同样必须被拒绝抛错
    localDb.tables.user_prefs = [
      {
        id: 1,
        locale: "zh-CN",
        nickname: "测试用户",
        customization_json: JSON.stringify(sensitiveConfig),
        updated_at: Date.now(),
      },
    ];

    await expect(syncFullSchemaWithRemote()).rejects.toThrow("机密无口令拒明文");
    // 远端绝对没有写入未加密的敏感密钥
    expect(remoteDb.tables.user_prefs.length).toBe(0);

    // 2. 当设置了口令后，敏感机密被加密，允许安全同步
    writeSyncSecretsPassphrase("MySecurePassphrase!2026");
    expect(() => assertSecretsSafeForSync(sensitiveConfig)).not.toThrow();

    await syncFullSchemaWithRemote();
    expect(remoteDb.tables.user_prefs.length).toBe(1);
    const remotePrefsJson = JSON.parse(remoteDb.tables.user_prefs[0].prefs_json);
    const remoteCustom = JSON.parse(remotePrefsJson.customization_json);

    // 核心安全断言：远端库绝无明文 API Key！
    expect(remoteCustom.aiApiKey).toBeUndefined();
    expect(remoteCustom.providerApiKeys).toBeUndefined();
    // 只有加密 envelope
    expect(remoteCustom.encryptedSecrets).toBeDefined();
    expect(remoteCustom.encryptedSecrets.kdf).toBe("PBKDF2-SHA256");
    expect(remoteCustom.encryptedSecrets.ciphertext).toBeDefined();
  });

  it("验收标准 2 延展: 断网本机可写、上线追平", async () => {
    setRemoteDsn("mysql://user:pass@host:4000/tongyun_personal");
    setRemoteDatabaseOverrideForTesting(remoteDb as any);

    // 1. 模拟断网：navigator.onLine = false
    const originalNavigator = (globalThis as any).navigator;
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      configurable: true,
    });

    // 断网时，用户在本地照常创建新任务和日记
    localDb.tables.tasks.push({
      id: "task-offline-writable",
      title: "断网离线时创建的任务",
      category: "urgent-important",
      updated_at: Date.now(),
    });

    // 尝试同步时检测到离线，抛出带有 isOffline 的错误或平滑降级，绝不损坏本地数据
    await expect(syncFullSchemaWithRemote()).rejects.toThrow("网络已断开（离线模式）");
    expect(localDb.tables.tasks.find((t) => t.id === "task-offline-writable")).toBeDefined();
    expect(remoteDb.tables.tasks.length).toBe(0);

    // 2. 模拟网络恢复上线：navigator.onLine = true
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: true },
      configurable: true,
    });

    // 上线追平：调用同步
    const catchupStats = await syncFullSchemaWithRemote();
    expect(catchupStats.pushed).toBeGreaterThanOrEqual(1);

    // 远端追平断网期间写入的数据
    expect(remoteDb.tables.tasks.find((t) => t.id === "task-offline-writable")).toBeDefined();
    expect(remoteDb.tables.tasks.find((t) => t.id === "task-offline-writable")?.title).toBe(
      "断网离线时创建的任务",
    );

    // 恢复 navigator
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("验收标准 4: full-schema 12 张白名单全表覆盖与状态统计", async () => {
    setRemoteDsn("mysql://user:pass@host:4000/tongyun_personal");
    setRemoteDatabaseOverrideForTesting(remoteDb as any);

    // 校验白名单完整包含 12 张业务与同步表
    expect(SYNC_TABLES_WHITELIST).toEqual([
      "tasks",
      "journal_entries",
      "pomodoro_logs",
      "habits",
      "agents",
      "task_dispatch",
      "sticky_notes",
      "countdowns",
      "timeblocks",
      "user_prefs",
      "sync_state",
      "sync_outbox",
    ]);

    const now = Date.now();
    localDb.tables.pomodoro_logs.push({
      id: "pomo-1",
      timestamp: now,
      duration: 25,
      task_id: "task-100",
      task_title: "深度专注",
      created_at: now,
    });
    localDb.tables.agents.push({
      id: "agent-1",
      handle: "assistant_bot",
      kind: "ai",
      enabled: 1,
      meta: "{}",
    });
    localDb.tables.task_dispatch.push({
      id: "dispatch-1",
      task_id: "task-100",
      agent_id: "agent-1",
      status: "assigned",
      created_at: now,
      updated_at: now,
    });
    localDb.tables.countdowns.push({
      id: "cd-1",
      title: "产品发布倒计时",
      target_date: "2026-12-31",
      emoji: "🚀",
      updated_at: now,
    });
    localDb.tables.timeblocks.push({
      id: "tb-1",
      date: "2026-10-26",
      start_time: "09:00",
      end_time: "10:00",
      title: "晨间规划",
      color: "#4D7C5D",
      updated_at: now,
    });
    localDb.tables.sync_outbox.push({
      id: "out-1",
      entity: "tasks",
      entity_id: "task-100",
      op: "INSERT",
      created_at: now,
    });

    const pushStats = await syncFullSchemaWithRemote();
    expect(pushStats.tables.pomodoro_logs.pushed).toBe(1);
    expect(pushStats.tables.agents.pushed).toBe(1);
    expect(pushStats.tables.task_dispatch.pushed).toBe(1);
    expect(pushStats.tables.countdowns.pushed).toBe(1);
    expect(pushStats.tables.timeblocks.pushed).toBe(1);
    expect(pushStats.tables.sync_outbox.pushed).toBe(1);
    // 出件箱在同步完成后被清空
    expect(localDb.tables.sync_outbox.length).toBe(0);

    // 验证远端存在对应数据
    expect(remoteDb.tables.pomodoro_logs.find((p) => p.id === "pomo-1")).toBeDefined();
    expect(remoteDb.tables.agents.find((a) => a.handle === "assistant_bot")).toBeDefined();
    expect(remoteDb.tables.task_dispatch.length).toBeGreaterThanOrEqual(1);

    // 新设备从远端拉回
    const freshDb = createMockDb();
    setDatabaseOverrideForTesting(freshDb as any);
    localStorage.removeItem(LAST_REMOTE_SYNC_TIME_KEY);

    const pullStats = await syncFullSchemaWithRemote();
    expect(pullStats.tables.pomodoro_logs.pulled).toBeGreaterThanOrEqual(1);
    expect(pullStats.tables.agents.pulled).toBeGreaterThanOrEqual(1);
    expect(pullStats.tables.task_dispatch.pulled).toBeGreaterThanOrEqual(1);
    expect(pullStats.tables.countdowns.pulled).toBeGreaterThanOrEqual(1);
    expect(pullStats.tables.timeblocks.pulled).toBeGreaterThanOrEqual(1);

    expect(freshDb.tables.pomodoro_logs.find((p) => p.id === "pomo-1")).toBeDefined();
    expect(freshDb.tables.agents.find((a) => a.handle === "assistant_bot")).toBeDefined();
    expect(freshDb.tables.countdowns.find((c) => c.id === "cd-1")).toBeDefined();
    expect(freshDb.tables.timeblocks.find((b) => b.id === "tb-1")).toBeDefined();
  });

  it("连不上远端时整次失败，user_prefs 单表失败则不打断", async () => {
    setRemoteDsn("mysql://user:pass@host:4000/tongyun_personal");
    setRemoteDatabaseOverrideForTesting(null);
    await expect(syncFullSchemaWithRemote()).rejects.toThrow("无法连接到远端数据库");
    expect(localStorage.getItem(LAST_REMOTE_SYNC_TIME_KEY)).toBeNull();

    setRemoteDatabaseOverrideForTesting(remoteDb as any);
    localDb.tables.user_prefs = [
      {
        id: 1,
        locale: "zh-CN",
        nickname: "测试用户",
        customization_json: JSON.stringify({ theme: "paper" }),
        updated_at: Date.now(),
      },
    ];
    localDb.tables.tasks.push({
      id: "task-prefs-fail",
      title: "prefs 失败仍要推任务",
      category: "urgent-important",
      updated_at: Date.now(),
    });
    const originalExecute = remoteDb.execute.bind(remoteDb);
    remoteDb.execute = async (sql: string, params?: any[]) => {
      if (sql.includes("INSERT INTO user_prefs")) {
        throw new Error("Unknown column 'prefs_json' in 'field list'");
      }
      return originalExecute(sql, params);
    };

    const stats = await syncFullSchemaWithRemote();
    expect(stats.tables.tasks.pushed).toBeGreaterThanOrEqual(1);
    expect(stats.tables.user_prefs.pushed).toBe(0);
    expect(remoteDb.tables.user_prefs).toHaveLength(0);
    expect(remoteDb.tables.tasks.find((task) => task.id === "task-prefs-fail")).toBeDefined();
    expect(localStorage.getItem(LAST_REMOTE_SYNC_TIME_KEY)).toBeTruthy();
  });
});
