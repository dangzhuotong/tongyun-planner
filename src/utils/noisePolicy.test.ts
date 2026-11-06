import { describe, expect, it } from "vitest";
import {
  nextNoiseStartSignal,
  resolveAutoNoiseTarget,
  shouldAutoStartNoise,
  shouldEmitExternalPlaySignal,
  shouldResumeNoiseAfterMicroBreak,
} from "./noisePolicy";

describe("noisePolicy", () => {
  describe("shouldAutoStartNoise", () => {
    const base = {
      autoNoiseEnabled: true,
      active: true,
      isBreak: false,
      manuallyStopped: false,
    };

    it("starts only during an active focus block with auto-noise enabled", () => {
      expect(shouldAutoStartNoise(base)).toBe(true);
    });

    it("does nothing when auto-noise is disabled", () => {
      expect(shouldAutoStartNoise({ ...base, autoNoiseEnabled: false })).toBe(false);
    });

    it("does nothing while the focus block is inactive", () => {
      expect(shouldAutoStartNoise({ ...base, active: false })).toBe(false);
    });

    it("does nothing during a break", () => {
      expect(shouldAutoStartNoise({ ...base, isBreak: true })).toBe(false);
    });

    it("lets a manual mute outrank the auto-noise preference", () => {
      expect(shouldAutoStartNoise({ ...base, manuallyStopped: true })).toBe(false);
    });
  });

  describe("shouldResumeNoiseAfterMicroBreak", () => {
    it("resumes when noise was playing before the break", () => {
      expect(
        shouldResumeNoiseAfterMicroBreak({
          wasPlayingNoise: true,
          autoNoiseEnabled: false,
          manuallyStopped: false,
        }),
      ).toBe(true);
    });

    it("resumes when auto-noise is enabled even if it was silent", () => {
      expect(
        shouldResumeNoiseAfterMicroBreak({
          wasPlayingNoise: false,
          autoNoiseEnabled: true,
          manuallyStopped: false,
        }),
      ).toBe(true);
    });

    it("stays silent when it was not playing and auto-noise is off", () => {
      expect(
        shouldResumeNoiseAfterMicroBreak({
          wasPlayingNoise: false,
          autoNoiseEnabled: false,
          manuallyStopped: false,
        }),
      ).toBe(false);
    });

    it("a manual mute outranks both was-playing and auto-noise", () => {
      expect(
        shouldResumeNoiseAfterMicroBreak({
          wasPlayingNoise: true,
          autoNoiseEnabled: true,
          manuallyStopped: true,
        }),
      ).toBe(false);
    });
  });

  describe("shouldEmitExternalPlaySignal", () => {
    it("只有外部发起、且当前没在播外部音源时才递增", () => {
      expect(shouldEmitExternalPlaySignal({ echo: true, alreadyPlayingExternal: false })).toBe(
        true,
      );
      expect(shouldEmitExternalPlaySignal({ echo: false, alreadyPlayingExternal: false })).toBe(
        false,
      );
      expect(shouldEmitExternalPlaySignal({ echo: true, alreadyPlayingExternal: true })).toBe(
        false,
      );
    });
  });

  describe("nextNoiseStartSignal", () => {
    it("外部播放中由非 Sidebar 路径起内置白噪音时递增，外部播放器据此停下", () => {
      // 番茄钟自动起噪 / 微休息恢复 / 设置试听都只会把 isPlayingNoise 由 false 改为 true。
      expect(nextNoiseStartSignal({ wasPlaying: false, isPlaying: true, signal: 0 })).toBe(1);
      expect(nextNoiseStartSignal({ wasPlaying: false, isPlaying: true, signal: 7 })).toBe(8);
    });

    it("内置一直播放或停播时不递增，避免无谓地打断外部音源", () => {
      expect(nextNoiseStartSignal({ wasPlaying: true, isPlaying: true, signal: 3 })).toBe(3);
      expect(nextNoiseStartSignal({ wasPlaying: true, isPlaying: false, signal: 3 })).toBe(3);
      expect(nextNoiseStartSignal({ wasPlaying: false, isPlaying: false, signal: 0 })).toBe(0);
    });
  });

  describe("resolveAutoNoiseTarget", () => {
    const base = {
      autoNoiseEnabled: true,
      active: true,
      isBreak: false,
      manuallyStopped: false,
    };

    it("当选择外部音源且存在可用链接时，自动起噪目标解析为 external", () => {
      expect(
        resolveAutoNoiseTarget({
          ...base,
          noiseSource: "external",
          hasCustomNoiseLink: true,
        }),
      ).toBe("external");
    });

    it("当选择外部音源但无可用链接时，回退至内置 internal", () => {
      expect(
        resolveAutoNoiseTarget({
          ...base,
          noiseSource: "external",
          hasCustomNoiseLink: false,
        }),
      ).toBe("internal");
    });

    it("当选择内置音源时，自动起噪目标解析为 internal", () => {
      expect(
        resolveAutoNoiseTarget({
          ...base,
          noiseSource: "internal",
          hasCustomNoiseLink: true,
        }),
      ).toBe("internal");
    });

    it("不满足自动起噪条件时返回 none", () => {
      expect(
        resolveAutoNoiseTarget({
          ...base,
          autoNoiseEnabled: false,
          noiseSource: "external",
          hasCustomNoiseLink: true,
        }),
      ).toBe("none");

      expect(
        resolveAutoNoiseTarget({
          ...base,
          manuallyStopped: true,
          noiseSource: "external",
          hasCustomNoiseLink: true,
        }),
      ).toBe("none");
    });
  });
});
