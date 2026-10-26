import { describe, expect, it, vi } from "vitest";
import type { DomainAgent } from "../../types";
import {
  buildAgentDispatchedTask,
  mineCardTasks,
  partitionAgentBoard,
  resolveDefaultAgentId,
} from "../workbenchView";
import {
  type PipelineGateway,
  describeHeartbeat,
  formatHeartbeat,
  formatRosterOption,
  mergeCompanyRoster,
  parsePipelineDsnFromHomeFiles,
  queryCompanyRoster,
  resolvePipelineDsn,
  rewriteDatabaseName,
  selectVisibleRoster,
  submitRequirement,
} from "./companyRoster";
import { fetchCompanyRoster } from "./pipelineGateway";
import { fixtureAgentRows, fixtureWorkerRows } from "./rosterFixture";

const NOW = 1_761_456_000_000;

const localAssistant: DomainAgent = {
  id: "agent_local_assistant",
  handle: "本地助手",
  kind: "manual",
  enabled: true,
  updatedAt: 1,
};

function gatewayFrom(rows: { agents: unknown[]; workers: unknown[] }): PipelineGateway {
  return {
    async select(sql) {
      if (sql.includes("FROM agents")) return rows.agents;
      if (sql.includes("FROM workers")) return rows.workers;
      return [];
    },
    async execute() {
      return { rowsAffected: 1 };
    },
  };
}

describe("company roster merge", () => {
  it("合并 active agents 与 enabled workers，cursor-cloud 没有 agents 行也要出现", () => {
    const entries = mergeCompanyRoster(fixtureAgentRows(), fixtureWorkerRows(NOW), NOW);
    const ids = entries.map((entry) => entry.id);
    expect(ids).toContain("cursor-cloud");
    expect(ids).toContain("ama");
    expect(ids).toContain("adang");
    expect(ids).not.toContain("retired-bot");
    expect(entries.find((entry) => entry.slug === "agy")?.id).toBe("agy");
    expect(entries.some((entry) => entry.handle === "阿衡" && entry.source === "company")).toBe(
      false,
    );

    const cursor = entries.find((entry) => entry.id === "cursor-cloud");
    expect(cursor?.handle).toBe("Cursor");
    expect(cursor?.source).toBe("company");
    expect(cursor?.online).toBe(true);
    expect(formatHeartbeat({ online: true, tone: cursor!.tone, ageMs: cursor!.ageMs })).toBe(
      "在线 · 12秒前",
    );
    expect(entries[0]?.id).toBe("cursor-cloud");

    const ama = entries.find((entry) => entry.id === "ama");
    expect(ama?.online).toBe(true);
    expect(ama?.machine).toBe("mac-studio");
    expect(formatHeartbeat({ online: true, tone: "online", ageMs: ama!.ageMs })).toBe(
      "在线 · 1分钟前",
    );

    const adang = entries.find((entry) => entry.id === "adang");
    expect(adang?.online).toBe(false);
    expect(formatHeartbeat({ online: false, tone: adang!.tone, ageMs: adang!.ageMs })).toBe(
      "离线 · 2小时前",
    );
  });

  it("同一 assignee 取最新心跳，别名命中 agents 行时不重复造人", () => {
    const entries = mergeCompanyRoster(
      fixtureAgentRows(),
      [
        {
          assignee: "ama",
          status: "offline",
          enabled: 1,
          last_seen_at: NOW - 60 * 60 * 1000,
          machine: "old",
        },
        {
          assignee: "阿码",
          status: "online",
          enabled: 1,
          last_seen_at: NOW - 8_000,
          machine: "new",
        },
      ],
      NOW,
    );
    expect(entries.filter((entry) => entry.slug === "ama" || entry.id === "阿码")).toHaveLength(1);
    expect(entries.find((entry) => entry.id === "ama")?.machine).toBe("new");
    expect(entries.find((entry) => entry.id === "ama")?.online).toBe(true);
  });

  it("无心跳与强制离线", () => {
    expect(describeHeartbeat(null, null, NOW)).toEqual({
      online: false,
      tone: "none",
      ageMs: null,
    });
    expect(formatHeartbeat(describeHeartbeat(null, null, NOW), "en")).toBe("no heartbeat");
    const forced = describeHeartbeat(NOW - 1_000, "offline", NOW);
    expect(forced.online).toBe(false);
    expect(forced.tone).toBe("offline");
  });
});

describe("pipeline DSN", () => {
  it("~/.tongyun 的 pipeline DSN 优先于个人库，个人库改连 tongyun_pipeline", () => {
    const personal = "mysql://user:p%40ss@db.example:4000/tongyun_personal?ssl=true";
    expect(rewriteDatabaseName(personal, "tongyun_pipeline")).toBe(
      "mysql://user:p%40ss@db.example:4000/tongyun_pipeline?ssl=true",
    );
    expect(resolvePipelineDsn({ remoteDsn: personal })).toEqual({
      dsn: "mysql://user:p%40ss@db.example:4000/tongyun_pipeline?ssl=true",
      via: "remote-sibling",
    });
    expect(
      resolvePipelineDsn({
        homeDsn: "mysql://pipe:secret@db.example:4000/tongyun_pipeline",
        remoteDsn: personal,
      }).via,
    ).toBe("home");
    expect(resolvePipelineDsn({})).toEqual({ dsn: null, via: "none" });
  });

  it("只认 pipeline 字段，config.json 里的个人 dsn 不当公司库", () => {
    expect(
      parsePipelineDsnFromHomeFiles({
        "pipeline.dsn": "# comment\nmysql://from:file@host:4000/tongyun_pipeline\n",
        "config.json": JSON.stringify({ dsn: "mysql://other:x@host:4000/tongyun_personal" }),
      }).pipelineDsn,
    ).toBe("mysql://from:file@host:4000/tongyun_pipeline");

    expect(
      parsePipelineDsnFromHomeFiles({
        "config.json": JSON.stringify({
          dsn: "mysql://personal:x@host:4000/tongyun_personal",
          pipeline_dsn: "mysql://pipe:x@host:4000/tongyun_pipeline",
          token: "do-not-use",
        }),
        ".env": "PIPELINE_DSN=mysql://env:x@host:4000/tongyun_pipeline\nUNRELATED=secret",
      }).pipelineDsn,
    ).toBe("mysql://pipe:x@host:4000/tongyun_pipeline");

    const fromEnv = parsePipelineDsnFromHomeFiles({
      ".env": 'export TONGYUN_REMOTE_DSN="mysql://user:x@host:4000/tongyun_personal"\n',
    });
    expect(fromEnv.pipelineDsn).toBeNull();
    expect(resolvePipelineDsn({ remoteDsn: fromEnv.remoteDsn }).via).toBe("remote-sibling");
  });
});

describe("visible roster follows the database", () => {
  it("DSN 可读时名册来自库，含 Cursor，不含本机静态登记", async () => {
    const written: unknown[] = [];
    const loaded = await fetchCompanyRoster({
      now: NOW,
      fixture: false,
      loadLocal: async () => [localAssistant],
      readCache: () => null,
      writeCache: (file) => written.push(file),
      resolveDsn: async () => ({
        dsn: "mysql://user:pass@host:4000/tongyun_pipeline",
        via: "remote",
      }),
      openGateway: async () =>
        gatewayFrom({ agents: fixtureAgentRows(), workers: fixtureWorkerRows(NOW) }),
    });
    expect(loaded.via).toBe("pipeline");
    expect(loaded.entries.some((entry) => entry.id === "cursor-cloud")).toBe(true);
    expect(loaded.entries.some((entry) => entry.id === "agent_local_assistant")).toBe(false);
    expect(written).toHaveLength(1);
  });

  it("DSN 已配置但库不可达时，不用本机登记顶上", async () => {
    const loaded = await fetchCompanyRoster({
      now: NOW,
      fixture: false,
      loadLocal: async () => [localAssistant],
      readCache: () => null,
      resolveDsn: async () => ({
        dsn: "mysql://user:pass@host:4000/tongyun_personal",
        via: "remote-sibling",
      }),
      openGateway: async () => null,
    });
    expect(loaded.via).toBe("unavailable");
    expect(loaded.entries).toEqual([]);
    expect(loaded.dsnConfigured).toBe(true);
  });

  it("刷新失败时用公司库缓存，仍然不是本机登记", () => {
    const cached = mergeCompanyRoster(fixtureAgentRows(), fixtureWorkerRows(NOW), NOW);
    const picked = selectVisibleRoster({
      dsnConfigured: true,
      company: null,
      companyCache: cached,
      localFallback: [
        {
          id: "agent_local_assistant",
          handle: "本地助手",
          slug: "agent_local_assistant",
          kind: "manual",
          enabled: true,
          source: "local",
          online: false,
          tone: "none",
          ageMs: null,
          lastSeenAt: null,
          sortOrder: 1000,
          updatedAt: 1,
        },
      ],
    });
    expect(picked.via).toBe("cache");
    expect(picked.entries.some((entry) => entry.id === "cursor-cloud")).toBe(true);
    expect(picked.entries.some((entry) => entry.handle === "本地助手")).toBe(false);
  });

  it("没配 DSN 且没有公司缓存时，才用本机离线兜底", async () => {
    const loaded = await fetchCompanyRoster({
      now: NOW,
      fixture: false,
      loadLocal: async () => [localAssistant],
      readCache: () => null,
      resolveDsn: async () => ({ dsn: null, via: "none" }),
      openGateway: async () => {
        throw new Error("should not connect");
      },
    });
    expect(loaded.via).toBe("local");
    expect(loaded.entries.map((entry) => entry.handle)).toEqual(["本地助手"]);
  });
});

describe("requirements and #45 dispatch", () => {
  it("提交 requirement 返回可核对的 id", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const gateway: PipelineGateway = {
      async execute(sql, params) {
        calls.push({ sql, params });
        return { rowsAffected: 1, lastInsertId: String(params?.[0]) };
      },
      async select(_sql, params) {
        return [{ id: String(params?.[0]) }];
      },
    };
    const receipt = await submitRequirement(
      gateway,
      { title: " 名册要含 Cursor ", detail: "面板下拉", priority: "p1", productId: "planner" },
      NOW,
    );
    expect(receipt.id.startsWith(String(NOW))).toBe(true);
    expect(receipt.id).toMatch(/^\d{19}$/);
    expect(calls[0]?.sql).toContain("INSERT INTO requirements");
    expect(calls[0]?.params?.slice(0, 7)).toEqual([
      receipt.id,
      "名册要含 Cursor",
      "面板下拉",
      "planner",
      "planner",
      "open",
      "p1",
    ]);
    await expect(submitRequirement(gateway, { title: "  " })).rejects.toThrow("标题不能为空");
  });

  it("库不可达时不假装入库", async () => {
    const gateway: PipelineGateway = {
      async select() {
        return [];
      },
      async execute() {
        throw new Error("mysql://user:secret@host/tongyun_pipeline denied");
      },
    };
    await expect(submitRequirement(gateway, { title: "写进库" }, NOW)).rejects.toThrow(
      /^需求没有写入公司库$/,
    );
  });

  it("query 失败两侧都空时返回 null，而不是本机名单", async () => {
    const result = await queryCompanyRoster({
      async select() {
        throw new Error("no such table");
      },
      async execute() {
        return { rowsAffected: 0 };
      },
    });
    expect(result).toBeNull();
  });

  it("派活人选来自名册，#45 快捷新建仍把任务放进待跑且不进「我的」", () => {
    const entries = mergeCompanyRoster(fixtureAgentRows(), fixtureWorkerRows(NOW), NOW);
    const enabled = entries.filter((entry) => entry.enabled);
    expect(resolveDefaultAgentId(enabled, "cursor-cloud")).toBe("cursor-cloud");
    expect(resolveDefaultAgentId(enabled, "agent_local_assistant")).toBe(enabled[0]?.id);
    const task = buildAgentDispatchedTask({
      id: "dispatch-1",
      title: "让 Cursor 看名册",
      agentId: "cursor-cloud",
    });
    expect(partitionAgentBoard([task], "cursor-cloud").queued.map((item) => item.id)).toEqual([
      "dispatch-1",
    ]);
    expect(mineCardTasks([task])).toHaveLength(0);
    expect(
      formatRosterOption(
        entries.find((entry) => entry.id === "cursor-cloud")!,
        {
          withHeartbeat: true,
          style: "assignee",
        },
      ),
    ).toContain("cursor-cloud");
    expect(
      formatRosterOption(
        entries.find((entry) => entry.id === "cursor-cloud")!,
        {
          withHeartbeat: true,
        },
      ),
    ).toContain("在线");
  });
});

describe("requirement id does not leak through logs", () => {
  it("console 不会在解析 DSN 时被调用", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    resolvePipelineDsn({ remoteDsn: "mysql://user:supersecret@host:4000/app" });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
