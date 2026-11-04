import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendCustomNoiseLink,
  clampWindowPosition,
  loadCustomNoiseLinks,
  loadCustomNoiseWindowPosition,
  loadCustomNoiseActiveId,
  saveCustomNoiseActiveId,
  loadNoiseSource,
  saveNoiseSource,
  parseCustomNoiseUrl,
  removeCustomNoiseLink,
  saveCustomNoiseLinks,
  saveCustomNoiseWindowPosition,
  type CustomNoiseLink,
} from "./customNoise";

describe("parseCustomNoiseUrl", () => {
  it("接受 YouTube watch / youtu.be / shorts / embed 链接", () => {
    const cases = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://m.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ];
    for (const raw of cases) {
      const result = parseCustomNoiseUrl(raw);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.link.kind).toBe("youtube");
        expect(result.link.embedUrl).toBe(
          "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1",
        );
      }
    }
  });

  it("YouTube 链接缺少合法视频 id 时判为不支持", () => {
    expect(parseCustomNoiseUrl("https://www.youtube.com/watch?v=short")).toEqual({
      ok: false,
      error: "unsupported",
    });
    expect(parseCustomNoiseUrl("https://www.youtube.com/feed/subscriptions")).toEqual({
      ok: false,
      error: "unsupported",
    });
  });

  it("解析 B 站 BV 链接并保留分 P", () => {
    const result = parseCustomNoiseUrl("https://www.bilibili.com/video/BV1GJ411x7h7?p=3");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.link.kind).toBe("bilibili");
      const embed = new URL(result.link.embedUrl);
      expect(embed.origin + embed.pathname).toBe("https://player.bilibili.com/player.html");
      expect(embed.searchParams.get("bvid")).toBe("BV1GJ411x7h7");
      expect(embed.searchParams.get("p")).toBe("3");
      expect(embed.searchParams.get("autoplay")).toBe("1");
      expect(embed.searchParams.get("danmaku")).toBe("0");
    }
  });

  it("解析 B 站 av 链接与播放器链接", () => {
    const av = parseCustomNoiseUrl("https://www.bilibili.com/video/av170001");
    expect(av.ok).toBe(true);
    if (av.ok) {
      expect(new URL(av.link.embedUrl).searchParams.get("aid")).toBe("170001");
    }
    const player = parseCustomNoiseUrl("https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7");
    expect(player.ok).toBe(true);
    if (player.ok) {
      expect(new URL(player.link.embedUrl).searchParams.get("bvid")).toBe("BV1GJ411x7h7");
    }
  });

  it("B 站短链无法离线展开，明确提示", () => {
    expect(parseCustomNoiseUrl("https://b23.tv/abc123")).toEqual({ ok: false, error: "short" });
  });

  it("接受音频/视频直链并取文件名作为标题", () => {
    const result = parseCustomNoiseUrl("https://example.com/sounds/rain-night.mp3?token=1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.link).toMatchObject({
        kind: "media",
        embedUrl: "https://example.com/sounds/rain-night.mp3?token=1",
        title: "rain-night.mp3",
      });
    }
  });

  it("缺少协议时按 https 补全", () => {
    const result = parseCustomNoiseUrl("www.bilibili.com/video/BV1GJ411x7h7");
    expect(result.ok).toBe(true);
  });

  it("区分空输入、非法协议与不支持的普通网页", () => {
    expect(parseCustomNoiseUrl("   ")).toEqual({ ok: false, error: "empty" });
    expect(parseCustomNoiseUrl("ftp://example.com/a.mp3")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(parseCustomNoiseUrl("https://example.com/article")).toEqual({
      ok: false,
      error: "unsupported",
    });
  });
});

describe("appendCustomNoiseLink", () => {
  const existing: CustomNoiseLink = {
    id: "a",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    kind: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1",
    title: "YouTube · dQw4w9WgXcQ",
  };

  it("追加新链接并保留已有顺序", () => {
    const { links, link } = appendCustomNoiseLink([existing], "https://example.com/a.mp3", "b");
    expect(links).toHaveLength(2);
    expect(link?.id).toBe("b");
    expect(links[0]).toBe(existing);
  });

  it("重复链接不新增", () => {
    const { links, error } = appendCustomNoiseLink([existing], "https://youtu.be/dQw4w9WgXcQ", "b");
    expect(error).toBe("duplicate");
    expect(links).toEqual([existing]);
  });

  it("非法链接透传错误且不改列表", () => {
    const { links, error } = appendCustomNoiseLink([existing], "https://example.com/x", "b");
    expect(error).toBe("unsupported");
    expect(links).toEqual([existing]);
  });
});

describe("removeCustomNoiseLink", () => {
  it("只移除指定 id", () => {
    const links: CustomNoiseLink[] = [
      { id: "a", url: "u1", kind: "media", embedUrl: "u1", title: "t1" },
      { id: "b", url: "u2", kind: "media", embedUrl: "u2", title: "t2" },
    ];
    expect(removeCustomNoiseLink(links, "a").map((l) => l.id)).toEqual(["b"]);
  });
});

describe("clampWindowPosition", () => {
  const panel = { width: 320, height: 260 };

  it("把窗口限制在视口内", () => {
    expect(clampWindowPosition({ x: -40, y: 9999 }, { width: 1200, height: 800 }, panel)).toEqual({
      x: 0,
      y: 540,
    });
  });

  it("视口小于窗口时贴左上角", () => {
    expect(clampWindowPosition({ x: 200, y: 200 }, { width: 240, height: 180 }, panel)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("本地存储", () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = String(value);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        for (const key of Object.keys(store)) delete store[key];
      },
    });
  });

  it("链接列表可持久化并过滤损坏数据", () => {
    const links: CustomNoiseLink[] = [
      { id: "a", url: "https://example.com/a.mp3", kind: "media", embedUrl: "u", title: "a" },
    ];
    saveCustomNoiseLinks(links);
    expect(loadCustomNoiseLinks()).toEqual(links);

    store["tongyun_custom_noise_links"] = JSON.stringify([{ nope: true }, links[0]]);
    expect(loadCustomNoiseLinks()).toEqual(links);
  });

  it("窗口位置可持久化，损坏数据回退为空", () => {
    saveCustomNoiseWindowPosition({ x: 12.4, y: 30.6 });
    expect(loadCustomNoiseWindowPosition()).toEqual({ x: 12, y: 31 });

    store["tongyun_custom_noise_window"] = '{"x":"no"}';
    expect(loadCustomNoiseWindowPosition()).toBeNull();
    store["tongyun_custom_noise_window"] = "not json";
    expect(loadCustomNoiseWindowPosition()).toBeNull();
  });

  it("当前激活音源与音源模式支持持久化和清除", () => {
    expect(loadCustomNoiseActiveId()).toBeNull();
    saveCustomNoiseActiveId("noise-123");
    expect(loadCustomNoiseActiveId()).toBe("noise-123");
    saveCustomNoiseActiveId(null);
    expect(loadCustomNoiseActiveId()).toBeNull();

    expect(loadNoiseSource()).toBe("internal");
    saveNoiseSource("external");
    expect(loadNoiseSource()).toBe("external");
    saveNoiseSource("internal");
    expect(loadNoiseSource()).toBe("internal");
  });
});
