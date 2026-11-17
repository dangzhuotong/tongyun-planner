import { describe, expect, it } from "vitest";
import panelSource from "../components/system/SystemSettingsPanel.tsx?raw";
import sidebarSource from "../components/Sidebar.tsx?raw";
import {
  VISIBLE_NOISE_LABEL_CLASS,
  clampMediaVolume,
  isDirectMediaWithPicture,
  mainSliderReachesPlayback,
} from "./noisePicture";

describe("noisePicture", () => {
  it("直链视频可以藏画面，音频直链没有画面", () => {
    expect(isDirectMediaWithPicture("https://cdn.example/rain.mp4")).toBe(true);
    expect(isDirectMediaWithPicture("https://cdn.example/rain.mp4?token=1")).toBe(true);
    expect(isDirectMediaWithPicture("https://cdn.example/live.m3u8")).toBe(true);
    expect(isDirectMediaWithPicture("https://cdn.example/rain.mp3")).toBe(false);
    expect(isDirectMediaWithPicture("https://cdn.example/clip.webm#t=1")).toBe(true);
  });

  it("主滑块只到达直链媒体，到不了跨站独立窗口", () => {
    expect(mainSliderReachesPlayback("media")).toBe(true);
    expect(mainSliderReachesPlayback("youtube")).toBe(false);
    expect(mainSliderReachesPlayback("bilibili")).toBe(false);
  });

  it("音量钳在 0 到 1", () => {
    expect(clampMediaVolume(0.35)).toBe(0.35);
    expect(clampMediaVolume(-1)).toBe(0);
    expect(clampMediaVolume(2)).toBe(1);
    expect(clampMediaVolume(Number.NaN)).toBe(0);
  });

  it("只检查白噪音勾选 label 的 class 含 relative，不模拟滚动或空白页", () => {
    expect(VISIBLE_NOISE_LABEL_CLASS.split(/\s+/)).toContain("relative");
    expect(panelSource).toContain("VISIBLE_NOISE_LABEL_CLASS");
    expect(panelSource).not.toMatch(
      /<label className="flex items-center gap-1\.5 flex-grow cursor-pointer select-none">/,
    );
  });

  it("悬浮窗回调固定 echo: false，播放信号不会在回调里自我加一", () => {
    expect(sidebarSource).toContain("startExternalNoise(id, { echo: false })");
  });
});
