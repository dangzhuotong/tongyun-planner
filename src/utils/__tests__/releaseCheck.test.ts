import { describe, expect, it } from "vitest";
import zh from "../../i18n/zh-CN";
import pkg from "../../../package.json";
import tauri from "../../../src-tauri/tauri.conf.json";
import cargo from "../../../src-tauri/Cargo.toml?raw";
import releaseYml from "../../../.github/workflows/release.yml?raw";
import { resolveDisplayedAppVersion } from "../updater";

describe("resolveDisplayedAppVersion", () => {
  it("prefers the installed Tauri version and strips a leading v", () => {
    expect(resolveDisplayedAppVersion("v1.2.0", "1.1.0")).toBe("1.2.0");
    expect(resolveDisplayedAppVersion("1.2.0", "1.1.0")).toBe("1.2.0");
  });

  it("falls back to the bundled package version when Tauri has not reported one", () => {
    expect(resolveDisplayedAppVersion(null, "1.1.0")).toBe("1.1.0");
    expect(resolveDisplayedAppVersion("  ", "1.1.0")).toBe("1.1.0");
  });
});

describe("check-for-updates copy", () => {
  it("tells the user they are already on the latest release", () => {
    expect(zh.settings.alreadyLatest).toBe("已是最新版本");
    expect(zh.settings.currentVersion).toBe("当前版本");
    expect(zh.settings.checkUpdate).toBe("检查更新");
  });
});

describe("release versions stay aligned", () => {
  it("keeps package.json, tauri.conf.json, and Cargo.toml on the same version", () => {
    const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
    expect(pkg.version).toBe(tauri.version);
    expect(cargoVersion).toBe(pkg.version);
  });
});

describe("release workflow", () => {
  it("publishes on v* tags and signs updater artifacts in CI", () => {
    expect(releaseYml).toMatch(/tags:\s*\n\s*- ['"]v\*['"]/);
    expect(releaseYml).toContain(
      "TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}",
    );
    expect(releaseYml).toContain(
      "TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
    );
    expect(releaseYml).toContain("includeUpdaterJson:");
  });
});
