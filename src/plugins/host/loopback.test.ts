import { describe, expect, it, vi } from "vitest";
import { extraPlugins } from "../extra";
import { builtinPlugins } from "../builtins";
import { NEWS_PLUGIN_ID } from "../news/manifest";
import { PluginHost } from "./registry";
import { assertLoopbackGet } from "./loopback";
import type { KeyValueStore, TongyunPlugin } from "./types";

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

describe("loopback read", () => {
  it("公开额外插件列表为空，生产注册表仍只有资讯", () => {
    expect(extraPlugins).toEqual([]);
    expect(builtinPlugins.map((plugin) => plugin.manifest.id)).toEqual([NEWS_PLUGIN_ID]);
  });

  it("拒绝公网、缺端口、查询串里的令牌，以及未声明的路径", () => {
    const rules = [{ origin: "http://127.0.0.1:9", pathPrefix: "/api/v1/projects" }];
    expect(() => assertLoopbackGet("https://example.com/api/v1/projects", rules)).toThrow(
      /loopback_rejected/,
    );
    expect(() => assertLoopbackGet("http://127.0.0.1/api/v1/projects", rules)).toThrow(
      /loopback_rejected/,
    );
    expect(() => assertLoopbackGet("http://127.0.0.1:9/api/v1/projects?token=abc", rules)).toThrow(
      /loopback_rejected/,
    );
    expect(() => assertLoopbackGet("http://127.0.0.1:9/api/v1/auth/login", rules)).toThrow(
      /loopback_rejected/,
    );
    expect(() => assertLoopbackGet("http://127.0.0.1:9/api/v1/projects-extra", rules)).toThrow(
      /loopback_rejected/,
    );
    expect(() =>
      assertLoopbackGet("http://127.0.0.1:9/api/v1/projects/abc/article", [
        { pathPrefix: "/api/v1/projects", excludeSegments: ["article"] },
      ]),
    ).toThrow(/loopback_rejected/);
    expect(() =>
      assertLoopbackGet("http://127.0.0.1:9/api/v1/projects?limit=20", rules),
    ).not.toThrow();
    expect(() =>
      assertLoopbackGet("http://127.0.0.1:4011/api/v1/projects/abc/submissions", [
        { pathPrefix: "/api/v1/projects", excludeSegments: ["article"] },
      ]),
    ).not.toThrow();
  });

  it("停用后不能再读，失败响应不会改日记存储", () => {
    const journal = [{ id: "j1", content: "原文" }];
    const before = JSON.stringify(journal);
    const transport = {
      get: vi.fn(async () => ({ status: 401, body: '{"code":401}' })),
      putSecret: vi.fn(async () => {}),
      forgetSecret: vi.fn(async () => {}),
      hasSecret: vi.fn(async () => false),
    };
    const plugin: TongyunPlugin = {
      manifest: {
        id: "org.example.reader",
        name: "示例只读",
        description: "测试用",
        version: "0.0.1",
        apiVersion: 1,
        defaultEnabled: true,
        permissions: [],
        storageKeys: [],
        loopbackGets: [{ origin: "http://127.0.0.1:9", pathPrefix: "/api/v1/projects" }],
      },
      sidebar: { label: "示例", icon: "puzzle" },
    };
    const host = new PluginHost(memoryStore());
    host.setLoopbackTransport(transport);
    host.load([plugin, ...builtinPlugins]);
    return host
      .readLoopback("org.example.reader", "http://127.0.0.1:9/api/v1/projects")
      .then(async (res) => {
        expect(res.status).toBe(401);
        expect(JSON.stringify(journal)).toBe(before);
        host.setEnabled("org.example.reader", false);
        expect(transport.forgetSecret).toHaveBeenCalledWith("org.example.reader");
        await expect(
          host.readLoopback("org.example.reader", "http://127.0.0.1:9/api/v1/projects"),
        ).rejects.toThrow(/未启用/);
        expect(host.record(NEWS_PLUGIN_ID)?.status).toBe("enabled");
      });
  });
});
