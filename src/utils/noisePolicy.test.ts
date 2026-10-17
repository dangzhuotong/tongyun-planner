import { describe, expect, it } from "vitest";
import { shouldAutoStartNoise, shouldResumeNoiseAfterMicroBreak } from "./noisePolicy";

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
});
