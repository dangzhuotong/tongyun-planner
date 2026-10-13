import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audioEngine";

class FakeParam {
  value = 0;
  events: string[] = [];
  cancelScheduledValues = vi.fn(() => {
    this.events.push("cancel");
  });
  setValueAtTime = vi.fn((value: number) => {
    this.value = value;
    this.events.push("set");
  });
  linearRampToValueAtTime = vi.fn((value: number) => {
    this.events.push(`ramp:${value}`);
  });
}

class FakeNode {
  id = `node-${FakeNode.seq++}`;
  static seq = 1;
  gain = new FakeParam();
  buffer: unknown = null;
  loop = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeBuffer {
  getChannelData() {
    return new Float32Array(16);
  }
}

class FakeContext {
  currentTime = 10;
  sampleRate = 8;
  state = "running";
  destination = {};
  resume = () => Promise.resolve();
  createGain() {
    return new FakeNode();
  }
  createBufferSource() {
    return new FakeNode();
  }
  createBuffer() {
    return new FakeBuffer();
  }
  createBiquadFilter() {
    return {
      type: "",
      frequency: new FakeParam(),
      Q: new FakeParam(),
      connect: vi.fn(),
    };
  }
  createOscillator() {
    return new FakeNode();
  }
}

describe("stopNoise fade race", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function install() {
    FakeNode.seq = 1;
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("window", globalThis);
    return new AudioEngine();
  }

  it("cancels the fade-in ramp before fading out", () => {
    const engine = install();
    engine.startNoise("brown", 0.4);
    engine.stopNoise();
    const gain = (engine as unknown as { gain: FakeNode | null }).gain;
    expect(gain?.gain.cancelScheduledValues).toHaveBeenCalled();
    const rampToZero = gain?.gain.events.findIndex((event) => event === "ramp:0") ?? -1;
    const cancelAt = gain?.gain.events.findIndex((event) => event === "cancel") ?? -1;
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(rampToZero).toBeGreaterThan(cancelAt);
  });

  it("does not let a stale fade timeout stop the noise that started during the fade", () => {
    vi.useFakeTimers();
    const engine = install();
    engine.startNoise("brown", 0.35);
    engine.stopNoise();
    engine.startNoise("brown", 0.35);
    const live = (engine as unknown as { source: FakeNode | null }).source;
    vi.advanceTimersByTime(500);
    expect(live?.stop).not.toHaveBeenCalled();
    expect((engine as unknown as { source: FakeNode | null }).source).toBe(live);
    expect((engine as unknown as { gain: FakeNode | null }).gain).toBeTruthy();
  });
});
