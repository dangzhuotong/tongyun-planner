import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audioEngine";

class FakeParam {
  value = 0;
  events: Array<{ type: string; value?: number; time?: number }> = [];

  setValueAtTime = vi.fn((value: number, time?: number) => {
    this.value = value;
    this.events.push({ type: "set", value, time });
  });

  linearRampToValueAtTime = vi.fn((value: number, time?: number) => {
    this.events.push({ type: "linearRamp", value, time });
  });

  exponentialRampToValueAtTime = vi.fn((value: number, time?: number) => {
    this.events.push({ type: "exponentialRamp", value, time });
  });
}

class FakeNode {
  id = `node-${FakeNode.seq++}`;
  static seq = 1;
  type = "sine";
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  buffer: unknown = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class FakeBuffer {
  length: number;
  sampleRate: number;
  data: Float32Array;

  constructor(length: number, sampleRate: number) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.data = new Float32Array(length);
  }

  getChannelData() {
    return this.data;
  }
}

class FakeContext {
  currentTime = 5.0;
  sampleRate = 44100;
  state = "running";
  destination = {};

  resume = vi.fn(() => Promise.resolve());
  createGain = vi.fn(() => new FakeNode());
  createBufferSource = vi.fn(() => new FakeNode());
  createBuffer = vi.fn((_channels: number, length: number, sampleRate: number) => {
    return new FakeBuffer(length, sampleRate);
  });
  createBiquadFilter = vi.fn(() => new FakeNode());
  createOscillator = vi.fn(() => new FakeNode());
}

describe("AudioEngine Sound Effects", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function createTestEngine() {
    FakeNode.seq = 1;
    vi.stubGlobal("AudioContext", FakeContext);
    vi.stubGlobal("window", globalThis);
    return new AudioEngine();
  }

  it("plays pencil scratch sound and caches the scratch buffer", () => {
    const engine = createTestEngine();

    // First playback
    expect(() => engine.playPencilScratchSound()).not.toThrow();

    const anyEngine = engine as unknown as {
      ctx: FakeContext | null;
      scratchBuffer: FakeBuffer | null;
    };
    expect(anyEngine.ctx).toBeTruthy();
    expect(anyEngine.scratchBuffer).toBeInstanceOf(FakeBuffer);
    expect(anyEngine.ctx?.createBuffer).toHaveBeenCalledTimes(1);

    // Second playback should reuse the cached buffer
    engine.playPencilScratchSound();
    expect(anyEngine.ctx?.createBuffer).toHaveBeenCalledTimes(1);
  });

  it("plays stamp sound with click and thud oscillators", () => {
    const engine = createTestEngine();

    expect(() => engine.playStampSound()).not.toThrow();

    const anyEngine = engine as unknown as { ctx: FakeContext | null };
    expect(anyEngine.ctx).toBeTruthy();
    // Creates 2 oscillators (click + thud)
    expect(anyEngine.ctx?.createOscillator).toHaveBeenCalledTimes(2);
    // Creates 2 gain nodes (click + thud)
    expect(anyEngine.ctx?.createGain).toHaveBeenCalledTimes(2);
  });

  it("handles missing AudioContext gracefully without throwing", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("window", {});
    const engine = new AudioEngine();

    expect(() => engine.playPencilScratchSound()).not.toThrow();
    expect(() => engine.playStampSound()).not.toThrow();
    expect(() => engine.playPaperSwipeSound()).not.toThrow();
    expect(() => engine.playPopSound()).not.toThrow();
    expect(() => engine.playStickSound()).not.toThrow();
  });
});
