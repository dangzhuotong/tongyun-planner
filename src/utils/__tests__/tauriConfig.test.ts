import { describe, it, expect } from "vitest";
import raw from "../../../src-tauri/tauri.conf.json?raw";

type TauriConfig = {
  app?: {
    security?: {
      csp?: string;
    };
  };
  plugins: {
    updater: {
      pubkey: string;
      endpoints: string[];
    };
  };
};

describe("tauri.conf.json", () => {
  it("parses as strict JSON without syntax errors", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("configures CSP to permit external media and video embeds (Bilibili/YouTube)", () => {
    const parsed = JSON.parse(raw) as TauriConfig;
    const csp = parsed.app?.security?.csp || "";
    expect(csp).toContain("media-src");
    expect(csp).toContain("frame-src");
    expect(csp).toContain("player.bilibili.com");
    expect(csp).toContain("www.youtube.com");
  });

  it("contains updater pubkey and endpoints with correct signature key id", () => {
    const parsed = JSON.parse(raw) as TauriConfig;
    const { pubkey, endpoints } = parsed.plugins.updater;

    expect(typeof pubkey).toBe("string");
    expect(pubkey.length).toBeGreaterThan(0);
    expect(atob(pubkey)).toContain("5D75A341756FAA3F");

    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBeGreaterThan(0);
  });
});
