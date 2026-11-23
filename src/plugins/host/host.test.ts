import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PluginErrorBoundary } from "./PluginErrorBoundary";
import { ALL_SYNC_CATEGORIES } from "../../utils/sync/types";
import { builtinPlugins } from "../builtins";
import { NEWS_PLUGIN_ID, NEWS_STORAGE_KEYS } from "../news/manifest";
import { isCoreStorageKey } from "./coreKeys";
import { errorMessage } from "./boundaryState";
import { PluginHost } from "./registry";
import { readEnabledMap } from "./state";
import { PLUGIN_STATE_KEY, type KeyValueStore, type TongyunPlugin } from "./types";
import type { JournalEntry } from "../../types";

function memoryStore(
  initial?: Record<string, string>,
): KeyValueStore & { snapshot(): Record<string, string> } {
  const data = { ...(initial ?? {}) };
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
    snapshot: () => ({ ...data }),
  };
}

function fixture(overrides: Partial<TongyunPlugin> = {}): TongyunPlugin {
  const { manifest, ...rest } = overrides;
  return {
    manifest: {
      id: "org.tongyun.fixture",
      name: "测试插件",
      description: "只在测试里登记",
      version: "0.0.1",
      apiVersion: 1,
      defaultEnabled: true,
      permissions: ["storage:read", "storage:write", "commands:register"],
      storageKeys: ["tongyun_fixture_note"],
      ...manifest,
    },
    sidebar: { label: "测试插件", icon: "puzzle" },
    commands: [{ id: "fixture.ping", label: "测试命令", keywords: "fixture", run: () => {} }],
    ...rest,
  };
}

describe("plugin host", () => {
  it("缺省启用资讯，坏 JSON 也回到默认开", () => {
    const store = memoryStore();
    const host = new PluginHost(store);
    host.load(builtinPlugins);
    expect(host.record(NEWS_PLUGIN_ID)?.status).toBe("enabled");
    expect(host.sidebarItems().map((item) => item.pluginId)).toEqual([NEWS_PLUGIN_ID]);

    const broken = memoryStore({ [PLUGIN_STATE_KEY]: "{not json" });
    const again = new PluginHost(broken);
    again.load(builtinPlugins);
    expect(again.record(NEWS_PLUGIN_ID)?.status).toBe("enabled");
    expect(readEnabledMap("{")).toEqual({});
    expect(readEnabledMap(JSON.stringify({ [NEWS_PLUGIN_ID]: { enabled: "no" } }))).toEqual({});
  });

  it("停用写入启停表，重启后仍关闭，且不删资讯键、不改日记", () => {
    const journal: JournalEntry[] = [
      {
        id: "j1",
        linkKey: "day",
        title: "今天",
        content: "原文还在",
        date: "2026-11-23",
        isDaily: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const before = JSON.stringify(journal);
    const store = memoryStore({
      tongyun_news_bookmarks: '[{"title":"旧收藏"}]',
      tongyun_enabled_plugins: JSON.stringify(["pipeline"]),
    });
    const host = new PluginHost(store);
    host.load(builtinPlugins);
    host.setEnabled(NEWS_PLUGIN_ID, false);
    expect(host.record(NEWS_PLUGIN_ID)?.status).toBe("disabled");
    expect(host.sidebarItems()).toEqual([]);
    expect(store.getItem("tongyun_news_bookmarks")).toBe('[{"title":"旧收藏"}]');
    expect(store.getItem("tongyun_enabled_plugins")).toContain("pipeline");
    expect(JSON.parse(store.getItem(PLUGIN_STATE_KEY) || "{}")).toEqual({
      [NEWS_PLUGIN_ID]: { enabled: false },
    });
    expect(JSON.stringify(journal)).toBe(before);
    const keys = Object.keys(store.snapshot());
    expect(keys).toContain(PLUGIN_STATE_KEY);
    expect(keys).not.toContain("tongyun_journal");

    const restarted = new PluginHost(store);
    restarted.load(builtinPlugins);
    expect(restarted.record(NEWS_PLUGIN_ID)?.status).toBe("disabled");
    expect(restarted.sidebarItems()).toEqual([]);
    expect(store.getItem("tongyun_news_bookmarks")).toContain("旧收藏");
  });

  it("生产数组只有资讯；再 load 一个 fixture 不必改宿主", () => {
    expect(builtinPlugins.map((plugin) => plugin.manifest.id)).toEqual([NEWS_PLUGIN_ID]);
    const store = memoryStore();
    const host = new PluginHost(store);
    const extra = fixture();
    host.load([...builtinPlugins, extra]);
    expect(host.list().map((row) => row.plugin.manifest.id)).toEqual([
      NEWS_PLUGIN_ID,
      "org.tongyun.fixture",
    ]);
    expect(host.sidebarItems().map((item) => item.label)).toEqual(["朝花夕拾", "测试插件"]);
    expect(host.commands().map((command) => command.label)).toEqual(["测试命令"]);
    host.setEnabled("org.tongyun.fixture", false);
    expect(host.sidebarItems().map((item) => item.pluginId)).toEqual([NEWS_PLUGIN_ID]);
    expect(host.commands()).toEqual([]);
    expect(host.record(NEWS_PLUGIN_ID)?.status).toBe("enabled");
  });

  it("没有 commands:register 的命令进不了面板", () => {
    const host = new PluginHost(memoryStore());
    host.load([
      fixture({
        manifest: {
          ...fixture().manifest,
          permissions: ["storage:read"],
        },
      }),
    ]);
    expect(host.commands()).toEqual([]);
  });

  it("拒绝核心键、未知权限、重复 id 和不兼容的 apiVersion，且不调用 activate", () => {
    const activate = vi.fn();
    const badCore = fixture({
      manifest: {
        ...fixture().manifest,
        id: "org.tongyun.badcore",
        storageKeys: ["tongyun_journal"],
      },
      activate,
    });
    const badPerm = fixture({
      manifest: {
        ...fixture().manifest,
        id: "org.tongyun.badperm",
        permissions: ["sql:exec" as never],
      },
      activate,
    });
    const oldApi = fixture({
      manifest: { ...fixture().manifest, id: "org.tongyun.old", apiVersion: 2 },
      activate,
    });
    const first = fixture();
    const dup = fixture();
    const host = new PluginHost(memoryStore());
    host.load([badCore, badPerm, oldApi, first, dup]);
    expect(host.record("org.tongyun.badcore")?.status).toBe("invalid");
    expect(host.record("org.tongyun.badperm")?.status).toBe("invalid");
    expect(host.record("org.tongyun.old")?.status).toBe("incompatible");
    expect(host.record("org.tongyun.fixture")?.status).toBe("enabled");
    const fixtures = host.list().filter((row) => row.plugin.manifest.id === "org.tongyun.fixture");
    expect(fixtures[fixtures.length - 1]?.status).toBe("invalid");
    expect(activate).not.toHaveBeenCalled();
    expect(host.sidebarItems().map((item) => item.pluginId)).toEqual(["org.tongyun.fixture"]);
  });

  it("ctx.storage 拒绝核心键和未声明权限，停用后不能再写", () => {
    const store = memoryStore({ tongyun_journal: "日记原文" });
    const host = new PluginHost(store);
    host.load([fixture()]);
    const ctx = host.contextFor("org.tongyun.fixture");
    expect(() => ctx.storage.set("tongyun_journal", "[]")).toThrow(/不能访问键/);
    expect(store.getItem("tongyun_journal")).toBe("日记原文");
    ctx.storage.set("tongyun_fixture_note", "ok");
    expect(store.getItem("tongyun_fixture_note")).toBe("ok");

    const readOnly = fixture({
      manifest: {
        ...fixture().manifest,
        id: "org.tongyun.readonly",
        permissions: ["storage:read"],
        storageKeys: ["tongyun_fixture_note"],
      },
      sidebar: undefined,
      commands: [],
    });
    const store2 = memoryStore({ tongyun_fixture_note: "kept" });
    const host2 = new PluginHost(store2);
    host2.load([readOnly]);
    const ctx2 = host2.contextFor("org.tongyun.readonly");
    expect(ctx2.storage.get("tongyun_fixture_note")).toBe("kept");
    expect(() => ctx2.storage.set("tongyun_fixture_note", "x")).toThrow(/storage:write/);
    expect(store2.getItem("tongyun_fixture_note")).toBe("kept");

    host.setEnabled("org.tongyun.fixture", false);
    expect(() => ctx.storage.set("tongyun_fixture_note", "later")).toThrow(/未启用/);
    expect(store.getItem("tongyun_fixture_note")).toBe("ok");
  });

  it("saveJournal 只在声明了 journal:write 时注入，停用不调用它", () => {
    const saveJournal = vi.fn();
    const saveTask = vi.fn();
    const host = new PluginHost(memoryStore());
    host.setBridges({ saveTask, saveJournal, config: {} as never });
    host.load([fixture(), ...builtinPlugins]);
    expect(host.viewApi("org.tongyun.fixture")?.saveJournal).toBeUndefined();
    expect(host.viewApi("org.tongyun.fixture")?.saveTask).toBeUndefined();
    expect(host.viewApi(NEWS_PLUGIN_ID)?.saveJournal).toBe(saveJournal);
    expect(host.viewApi(NEWS_PLUGIN_ID)?.saveTask).toBe(saveTask);
    host.setEnabled(NEWS_PLUGIN_ID, false);
    expect(host.viewApi(NEWS_PLUGIN_ID)).toBeNull();
    expect(saveJournal).not.toHaveBeenCalled();
    expect(saveTask).not.toHaveBeenCalled();
  });

  it("activate 失败只标记自己，deactivate 抛错仍卸下入口", () => {
    const cleaned = { value: false };
    const boom = fixture({
      manifest: { ...fixture().manifest, id: "org.tongyun.boom" },
      activate() {
        throw new Error("启动失败");
      },
    });
    const messy = fixture({
      manifest: { ...fixture().manifest, id: "org.tongyun.messy", defaultEnabled: true },
      sidebar: { label: "会停用", icon: "puzzle" },
      commands: [],
      activate() {
        cleaned.value = false;
      },
      deactivate() {
        cleaned.value = true;
        throw new Error("清理时出错");
      },
    });
    const host = new PluginHost(memoryStore());
    host.load([boom, messy]);
    expect(host.record("org.tongyun.boom")?.status).toBe("failed");
    expect(host.record("org.tongyun.boom")?.reason).toBe("启动失败");
    expect(host.record("org.tongyun.messy")?.status).toBe("enabled");
    expect(host.sidebarItems().map((item) => item.pluginId)).toEqual(["org.tongyun.messy"]);
    host.setEnabled("org.tongyun.messy", false);
    expect(cleaned.value).toBe(true);
    expect(host.record("org.tongyun.messy")?.status).toBe("disabled");
    expect(host.sidebarItems()).toEqual([]);
    host.retry("org.tongyun.boom");
    expect(host.record("org.tongyun.boom")?.status).toBe("failed");
  });

  it("视图异常进入错误边界后只卸下该插件的入口", () => {
    const host = new PluginHost(memoryStore());
    host.load([fixture(), ...builtinPlugins]);
    const boundary = new PluginErrorBoundary({
      pluginName: "测试插件",
      onFail: (message) => host.markFailed("org.tongyun.fixture", message),
      children: null,
    });
    boundary.state = PluginErrorBoundary.getDerivedStateFromError(new Error("渲染出错"));
    boundary.componentDidCatch(new Error("渲染出错"));
    const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
    expect(html).toContain("测试插件 无法显示");
    expect(html).toContain("渲染出错");
    expect(host.record("org.tongyun.fixture")?.status).toBe("failed");
    expect(host.sidebarItems().map((item) => item.pluginId)).toEqual([NEWS_PLUGIN_ID]);
    expect(host.record(NEWS_PLUGIN_ID)?.status).toBe("enabled");
  });

  it("视图失败后该插件不再贡献入口", () => {
    const host = new PluginHost(memoryStore());
    host.load([fixture()]);
    host.markFailed("org.tongyun.fixture", "渲染出错");
    expect(host.record("org.tongyun.fixture")?.status).toBe("failed");
    expect(host.sidebarItems()).toEqual([]);
    expect(errorMessage(new Error("渲染出错"))).toBe("渲染出错");
  });

  it("资讯键不碰核心存储，同步分类仍是原来的七类", () => {
    for (const key of NEWS_STORAGE_KEYS) expect(isCoreStorageKey(key)).toBe(false);
    expect(isCoreStorageKey("tongyun_journal")).toBe(true);
    expect([...ALL_SYNC_CATEGORIES]).toEqual([
      "tasks",
      "completedTasks",
      "stickyNotes",
      "pomodoroLogs",
      "countdowns",
      "journal",
      "config",
    ]);
    expect(ALL_SYNC_CATEGORIES).not.toContain("plugins");
  });

  it("未知旧 id 不会变成插件", () => {
    const store = memoryStore({
      [PLUGIN_STATE_KEY]: JSON.stringify({ pipeline: { enabled: true } }),
      tongyun_enabled_plugins: '["pipeline"]',
    });
    const host = new PluginHost(store);
    host.load(builtinPlugins);
    expect(host.list().map((row) => row.plugin.manifest.id)).toEqual([NEWS_PLUGIN_ID]);
    expect(host.record("pipeline")).toBeUndefined();
  });
});
