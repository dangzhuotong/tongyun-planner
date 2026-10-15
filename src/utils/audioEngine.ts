export class AudioEngine {
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private lfo: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  // Cached noise buffers to prevent CPU-heavy procedural generation on every start
  private brownBuffer: AudioBuffer | null = null;
  private pinkBuffer: AudioBuffer | null = null;
  private whiteBuffer: AudioBuffer | null = null;
  private scratchBuffer: AudioBuffer | null = null;

  // Handles state protection to prevent overlapping context states during fading out
  private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /** Bumped on every start/stop so a fade timeout cannot tear down a newer graph. */
  private playbackEpoch = 0;
  /** Tracks active auxiliary nodes (oscillators, buffers, crackles, bells, etc.) to guarantee zero sound leakage */
  private auxNodes: Set<{ stop?: () => void; disconnect: () => void }> = new Set();

  private registerAuxNode(node: { stop?: () => void; disconnect: () => void }): void {
    this.auxNodes.add(node);
  }

  private unregisterAuxNode(node: { stop?: () => void; disconnect: () => void }): void {
    this.auxNodes.delete(node);
  }

  private stopAllAuxNodes(): void {
    for (const node of this.auxNodes) {
      try {
        node.stop?.();
      } catch {
        // Ignored
      }
      try {
        node.disconnect();
      } catch {
        // Ignored
      }
    }
    this.auxNodes.clear();
  }

  private clearAllNoiseIntervals(): void {
    if ((this as any)._crackleInterval) {
      clearInterval((this as any)._crackleInterval);
      (this as any)._crackleInterval = null;
    }
    if ((this as any)._bellInterval) {
      clearInterval((this as any)._bellInterval);
      (this as any)._bellInterval = null;
    }
    if ((this as any)._pendulumInterval) {
      clearInterval((this as any)._pendulumInterval);
      (this as any)._pendulumInterval = null;
    }
    if ((this as any)._ringInterval) {
      clearInterval((this as any)._ringInterval);
      (this as any)._ringInterval = null;
    }
    if ((this as any)._thunderInterval) {
      clearInterval((this as any)._thunderInterval);
      (this as any)._thunderInterval = null;
    }
  }

  public stopNoiseImmediate(): void {
    this.playbackEpoch += 1;
    if (this.fadeTimeoutId) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    this.clearAllNoiseIntervals();
    this.stopAllAuxNodes();

    if (this.source) {
      try {
        this.source.stop();
      } catch {
        // Ignored
      }
      this.source.disconnect();
      this.source = null;
    }
    if (this.lfo) {
      try {
        this.lfo.stop();
      } catch {
        // Ignored
      }
      this.lfo.disconnect();
      this.lfo = null;
    }
    if (this.gain) {
      try {
        this.gain.disconnect();
      } catch {
        // Ignored
      }
      this.gain = null;
    }
  }

  public async ensureAudioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx =
        typeof window !== "undefined"
          ? window.AudioContext || (window as any).webkitAudioContext
          : undefined;
      if (!AudioCtx) {
        throw new Error("Web Audio API is not supported in this environment");
      }
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch (e) {
        console.warn("Failed to resume AudioContext", e);
      }
    }
    return this.ctx;
  }

  private init(): AudioContext {
    if (!this.ctx) {
      const AudioCtx =
        typeof window !== "undefined"
          ? window.AudioContext || (window as any).webkitAudioContext
          : undefined;
      if (!AudioCtx) {
        throw new Error("Web Audio API is not supported in this environment");
      }
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch((e) => console.warn("Failed to resume AudioContext", e));
    }
    return this.ctx;
  }

  // Pre-generate and cache Brownian Noise buffer (O(N) generated once, O(1) thereafter)
  private getBrownBuffer(ctx: AudioContext): AudioBuffer {
    if (this.brownBuffer) return this.brownBuffer;

    const sampleRate = ctx.sampleRate;
    const bufferSize = 2 * sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }

    this.brownBuffer = buffer;
    return buffer;
  }

  // Pre-generate and cache Pink Noise buffer (O(N) generated once, O(1) thereafter)
  private getPinkBuffer(ctx: AudioContext): AudioBuffer {
    if (this.pinkBuffer) return this.pinkBuffer;

    const sampleRate = ctx.sampleRate;
    const bufferSize = 2 * sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11;
      b6 = white * 0.115926;
    }

    this.pinkBuffer = buffer;
    return buffer;
  }

  public startNoise(type: string, volume: number): void {
    this.playbackEpoch += 1;
    // Cancel any pending fade-out stops
    if (this.fadeTimeoutId) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }

    this.stopNoiseImmediate();

    try {
      const ctx = this.init();
      this.gain = ctx.createGain();
      // Smooth fade-in (0.5s)
      this.gain.gain.setValueAtTime(0, ctx.currentTime);
      this.gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.5);
      this.gain.connect(ctx.destination);

      this.source = ctx.createBufferSource();
      this.source.loop = true;

      if (type === "brown") {
        this.source.buffer = this.getBrownBuffer(ctx);
        this.source.connect(this.gain);
      } else if (type === "pink") {
        this.source.buffer = this.getPinkBuffer(ctx);
        this.source.connect(this.gain);
      } else if (type === "ocean") {
        this.source.buffer = this.getBrownBuffer(ctx);

        const waveGain = ctx.createGain();
        waveGain.gain.setValueAtTime(0.35, ctx.currentTime);

        this.lfo = ctx.createOscillator();
        this.lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // ~12s cycle

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(0.32, ctx.currentTime);

        this.lfo.connect(lfoGain);
        lfoGain.connect(waveGain.gain);
        this.lfo.start();

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(350, ctx.currentTime);

        this.source.connect(filter);
        filter.connect(waveGain);
        waveGain.connect(this.gain);
      } else if (type === "rain") {
        this.source.buffer = this.getPinkBuffer(ctx);

        const hpFilter = ctx.createBiquadFilter();
        hpFilter.type = "highpass";
        hpFilter.frequency.setValueAtTime(900, ctx.currentTime);

        const bpFilter = ctx.createBiquadFilter();
        bpFilter.type = "bandpass";
        bpFilter.frequency.setValueAtTime(1400, ctx.currentTime);
        bpFilter.Q.setValueAtTime(0.7, ctx.currentTime);

        this.source.connect(hpFilter);
        hpFilter.connect(bpFilter);
        bpFilter.connect(this.gain);
      } else if (type === "white") {
        if (!this.whiteBuffer) {
          const sampleRate = ctx.sampleRate;
          const bufferSize = 2 * sampleRate;
          const buf = ctx.createBuffer(1, bufferSize, sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
          }
          this.whiteBuffer = buf;
        }

        this.source = ctx.createBufferSource();
        this.source.buffer = this.whiteBuffer;
        this.source.loop = true;

        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(80, ctx.currentTime);

        this.source.connect(hp);
        hp.connect(this.gain);
      } else if (type === "fire") {
        this.source.buffer = this.getPinkBuffer(ctx);

        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.setValueAtTime(800, ctx.currentTime);

        this.source.connect(lp);
        lp.connect(this.gain);

        const crackleInterval = setInterval(
          () => {
            if (!this.ctx || !this.gain) {
              clearInterval(crackleInterval);
              return;
            }
            const cCtx = this.ctx;
            const crackleGain = cCtx.createGain();
            crackleGain.gain.setValueAtTime(Math.random() * 0.12 + 0.04, cCtx.currentTime);
            crackleGain.gain.exponentialRampToValueAtTime(
              0.001,
              cCtx.currentTime + 0.06 + Math.random() * 0.08,
            );

            const crackleSource = cCtx.createBufferSource();
            const crackleBufferSize = Math.floor(0.1 * cCtx.sampleRate);
            const crackleBuf = cCtx.createBuffer(1, crackleBufferSize, cCtx.sampleRate);
            const crackleData = crackleBuf.getChannelData(0);
            for (let i = 0; i < crackleBufferSize; i++) {
              crackleData[i] = Math.random() * 2 - 1;
            }
            crackleSource.buffer = crackleBuf;

            const crackleHp = cCtx.createBiquadFilter();
            crackleHp.type = "highpass";
            crackleHp.frequency.setValueAtTime(2000, cCtx.currentTime);

            this.registerAuxNode(crackleSource);
            this.registerAuxNode(crackleGain);
            crackleSource.onended = () => {
              this.unregisterAuxNode(crackleSource);
              this.unregisterAuxNode(crackleGain);
            };

            crackleSource.connect(crackleHp);
            crackleHp.connect(crackleGain);
            crackleGain.connect(this.gain!);
            crackleSource.start(cCtx.currentTime);
          },
          400 + Math.random() * 800,
        );

        (this as any)._crackleInterval = crackleInterval;
      } else if (type === "stream") {
        this.source.buffer = this.getPinkBuffer(ctx);

        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(900, ctx.currentTime);
        bp.Q.setValueAtTime(0.6, ctx.currentTime);

        const streamLfo = ctx.createOscillator();
        streamLfo.frequency.setValueAtTime(0.15, ctx.currentTime);
        const streamLfoGain = ctx.createGain();
        streamLfoGain.gain.setValueAtTime(250, ctx.currentTime);
        streamLfo.connect(streamLfoGain);
        streamLfoGain.connect(bp.frequency);
        streamLfo.start();

        this.source.connect(bp);
        bp.connect(this.gain);
        this.lfo = streamLfo;
      } else if (type === "wind") {
        this.source.buffer = this.getBrownBuffer(ctx);

        const windLp = ctx.createBiquadFilter();
        windLp.type = "lowpass";
        windLp.frequency.setValueAtTime(300, ctx.currentTime);
        windLp.Q.setValueAtTime(0.5, ctx.currentTime);

        const windLfo = ctx.createOscillator();
        windLfo.type = "sine";
        windLfo.frequency.setValueAtTime(0.08, ctx.currentTime);
        const windLfoGain = ctx.createGain();
        windLfoGain.gain.setValueAtTime(250, ctx.currentTime);
        windLfo.connect(windLfoGain);
        windLfoGain.connect(windLp.frequency);
        windLfo.start();

        this.source.connect(windLp);
        windLp.connect(this.gain);
        this.lfo = windLfo;
      } else if (type === "bell") {
        // Deep temple bell - silent background with periodic strikes
        this.source.buffer = this.getBrownBuffer(ctx);
        const bellLp = ctx.createBiquadFilter();
        bellLp.type = "lowpass";
        bellLp.frequency.setValueAtTime(100, ctx.currentTime);
        this.source.connect(bellLp);
        const bellBgGain = ctx.createGain();
        bellBgGain.gain.setValueAtTime(0.04, ctx.currentTime);
        bellLp.connect(bellBgGain);
        bellBgGain.connect(this.gain);

        const strikeBell = () => {
          if (!this.ctx || !this.gain) return;
          const bCtx = this.ctx;
          const now = bCtx.currentTime;
          // Fundamental + 3 harmonics
          const harmonics = [1, 2.01, 3.02, 4.05];
          harmonics.forEach((ratio, i) => {
            const osc = bCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(90 * ratio, now);
            const oGain = bCtx.createGain();
            const vol = i === 0 ? 0.15 : 0.06 / i;
            oGain.gain.setValueAtTime(vol, now);
            oGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5 + i * 0.8);
            osc.connect(oGain);
            oGain.connect(this.gain!);
            this.registerAuxNode(osc);
            this.registerAuxNode(oGain);
            osc.onended = () => {
              this.unregisterAuxNode(osc);
              this.unregisterAuxNode(oGain);
            };
            osc.start(now);
            osc.stop(now + 2.5 + i * 0.8);
          });
        };
        strikeBell();
        (this as any)._bellInterval = setInterval(strikeBell, 12000 + Math.random() * 8000);
      } else if (type === "pendulum") {
        // Pendulum clock - very quiet brown noise + regular tick-tock
        this.source.buffer = this.getBrownBuffer(ctx);
        const pendLp = ctx.createBiquadFilter();
        pendLp.type = "lowpass";
        pendLp.frequency.setValueAtTime(80, ctx.currentTime);
        this.source.connect(pendLp);
        const pendBgGain = ctx.createGain();
        pendBgGain.gain.setValueAtTime(0.02, ctx.currentTime);
        pendLp.connect(pendBgGain);
        pendBgGain.connect(this.gain);

        let tickHigh = true;
        (this as any)._pendulumInterval = setInterval(() => {
          if (!this.ctx || !this.gain) return;
          const pCtx = this.ctx;
          const now = pCtx.currentTime;
          const osc = pCtx.createOscillator();
          osc.type = "sine";
          osc.frequency.setValueAtTime(tickHigh ? 900 : 700, now);
          const pGain = pCtx.createGain();
          pGain.gain.setValueAtTime(0.12, now);
          pGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          const pFilter = pCtx.createBiquadFilter();
          pFilter.type = "bandpass";
          pFilter.frequency.setValueAtTime(tickHigh ? 900 : 700, now);
          pFilter.Q.setValueAtTime(3, now);
          osc.connect(pFilter);
          pFilter.connect(pGain);
          pGain.connect(this.gain!);
          this.registerAuxNode(osc);
          this.registerAuxNode(pGain);
          osc.onended = () => {
            this.unregisterAuxNode(osc);
            this.unregisterAuxNode(pGain);
          };
          osc.start(now);
          osc.stop(now + 0.04);
          tickHigh = !tickHigh;
        }, 1000);
      } else if (type === "ring") {
        // Bright bell ring - periodic ringing
        this.source.buffer = this.getPinkBuffer(ctx);
        const ringBp = ctx.createBiquadFilter();
        ringBp.type = "bandpass";
        ringBp.frequency.setValueAtTime(1200, ctx.currentTime);
        ringBp.Q.setValueAtTime(2, ctx.currentTime);
        this.source.connect(ringBp);
        const ringBgGain = ctx.createGain();
        ringBgGain.gain.setValueAtTime(0.025, ctx.currentTime);
        ringBp.connect(ringBgGain);
        ringBgGain.connect(this.gain);

        const doRing = () => {
          if (!this.ctx || !this.gain) return;
          const rCtx = this.ctx;
          const now = rCtx.currentTime;
          [1, 2.5, 4.2].forEach((ratio, i) => {
            const osc = rCtx.createOscillator();
            osc.type = "sine";
            osc.frequency.setValueAtTime(520 * ratio, now + i * 0.12);
            const rGain = rCtx.createGain();
            rGain.gain.setValueAtTime(0.08 / (i + 1), now + i * 0.12);
            rGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);
            const rFilter = rCtx.createBiquadFilter();
            rFilter.type = "bandpass";
            rFilter.frequency.setValueAtTime(520 * ratio, now + i * 0.12);
            rFilter.Q.setValueAtTime(4, now);
            osc.connect(rFilter);
            rFilter.connect(rGain);
            rGain.connect(this.gain!);
            this.registerAuxNode(osc);
            this.registerAuxNode(rGain);
            osc.onended = () => {
              this.unregisterAuxNode(osc);
              this.unregisterAuxNode(rGain);
            };
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.6);
          });
        };
        doRing();
        (this as any)._ringInterval = setInterval(doRing, 5000);
      } else if (type === "fan") {
        // Steady fan / AC hum — pink noise with narrow band + soft volume LFO
        this.source.buffer = this.getPinkBuffer(ctx);

        const fanBp = ctx.createBiquadFilter();
        fanBp.type = "bandpass";
        fanBp.frequency.setValueAtTime(280, ctx.currentTime);
        fanBp.Q.setValueAtTime(0.8, ctx.currentTime);

        const fanLp = ctx.createBiquadFilter();
        fanLp.type = "lowpass";
        fanLp.frequency.setValueAtTime(900, ctx.currentTime);

        const fanMod = ctx.createGain();
        fanMod.gain.setValueAtTime(0.75, ctx.currentTime);

        this.lfo = ctx.createOscillator();
        this.lfo.type = "sine";
        this.lfo.frequency.setValueAtTime(0.12, ctx.currentTime);
        const fanLfoGain = ctx.createGain();
        fanLfoGain.gain.setValueAtTime(0.12, ctx.currentTime);
        this.lfo.connect(fanLfoGain);
        fanLfoGain.connect(fanMod.gain);
        this.lfo.start();

        this.source.connect(fanBp);
        fanBp.connect(fanLp);
        fanLp.connect(fanMod);
        fanMod.connect(this.gain);
      } else if (type === "thunder") {
        // Gentle rain base + occasional distant thunder rumbles
        this.source.buffer = this.getPinkBuffer(ctx);

        const rainHp = ctx.createBiquadFilter();
        rainHp.type = "highpass";
        rainHp.frequency.setValueAtTime(700, ctx.currentTime);

        const rainBp = ctx.createBiquadFilter();
        rainBp.type = "bandpass";
        rainBp.frequency.setValueAtTime(1300, ctx.currentTime);
        rainBp.Q.setValueAtTime(0.6, ctx.currentTime);

        const rainGain = ctx.createGain();
        rainGain.gain.setValueAtTime(0.55, ctx.currentTime);

        this.source.connect(rainHp);
        rainHp.connect(rainBp);
        rainBp.connect(rainGain);
        rainGain.connect(this.gain);

        const rumble = () => {
          if (!this.ctx || !this.gain) return;
          const tCtx = this.ctx;
          const now = tCtx.currentTime;
          const rumbleSrc = tCtx.createBufferSource();
          rumbleSrc.buffer = this.getBrownBuffer(tCtx);
          rumbleSrc.loop = false;

          const rumbleLp = tCtx.createBiquadFilter();
          rumbleLp.type = "lowpass";
          rumbleLp.frequency.setValueAtTime(120, now);
          rumbleLp.frequency.exponentialRampToValueAtTime(60, now + 2.5);

          const rumbleGain = tCtx.createGain();
          const peak = 0.35 + Math.random() * 0.25;
          rumbleGain.gain.setValueAtTime(0.001, now);
          rumbleGain.gain.linearRampToValueAtTime(peak, now + 0.15);
          rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

          rumbleSrc.connect(rumbleLp);
          rumbleLp.connect(rumbleGain);
          rumbleGain.connect(this.gain!);
          this.registerAuxNode(rumbleSrc);
          this.registerAuxNode(rumbleGain);
          rumbleSrc.onended = () => {
            this.unregisterAuxNode(rumbleSrc);
            this.unregisterAuxNode(rumbleGain);
          };
          rumbleSrc.start(now);
          rumbleSrc.stop(now + 3);
        };

        (this as any)._thunderInterval = setInterval(
          () => {
            if (Math.random() > 0.35) rumble();
          },
          8000 + Math.random() * 12000,
        );
      }

      this.source.start();
    } catch (e) {
      console.error("启动白噪音发生器失败:", e);
    }
  }

  public setVolume(volume: number): void {
    if (this.gain && this.ctx) {
      this.gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    }
  }

  public stopNoise(): void {
    const epoch = ++this.playbackEpoch;
    if (this.fadeTimeoutId) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }

    // 1. 同步立即清除所有周期发生器（雷雨/钟声/滴答/火堆/铃声），绝不在后台继续产生新音频
    this.clearAllNoiseIntervals();
    // 2. 同步立即停止所有正在鸣响的辅助振荡器和音频片段，实现瞬间静音
    this.stopAllAuxNodes();

    if (this.gain && this.ctx) {
      const ctx = this.ctx;
      const gainNode = this.gain;
      const sourceNode = this.source;
      const lfoNode = this.lfo;

      try {
        const now = ctx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        const current = Number.isFinite(gainNode.gain.value) ? gainNode.gain.value : 0;
        gainNode.gain.setValueAtTime(current, now);
        // 极速 30ms 平滑微降至 0，消除物理爆音（click prevention），人耳听感即刻安静
        gainNode.gain.linearRampToValueAtTime(0, now + 0.03);
      } catch {
        // Fallback
      }

      this.fadeTimeoutId = setTimeout(() => {
        if (epoch !== this.playbackEpoch) return;

        try {
          sourceNode?.stop();
        } catch {
          // Ignored
        }
        sourceNode?.disconnect();

        try {
          lfoNode?.stop();
        } catch {
          // Ignored
        }
        lfoNode?.disconnect();

        try {
          gainNode.disconnect();
        } catch {
          // Ignored
        }

        if (this.source === sourceNode) this.source = null;
        if (this.lfo === lfoNode) this.lfo = null;
        if (this.gain === gainNode) this.gain = null;
        this.fadeTimeoutId = null;
      }, 40);
    } else {
      this.stopNoiseImmediate();
    }
  }

  public playCompletionSound(soundType: string): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      if (soundType === "microBreak") {
        void this.playMicroBreakSound();
        return;
      }

      if (soundType === "cuckoo") {
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(784.0, now);
        gain1.gain.setValueAtTime(0.4, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.15);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(622.25, now + 0.18);
        gain2.gain.setValueAtTime(0.45, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.18);
        osc2.stop(now + 0.5);
      } else if (soundType === "meow") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";

        osc.frequency.setValueAtTime(650, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(720, now + 0.4);

        gain.gain.setValueAtTime(0.01, now);
        gain.gain.linearRampToValueAtTime(0.3, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(1000, now);
        filter.frequency.exponentialRampToValueAtTime(1200, now + 0.12);
        filter.frequency.exponentialRampToValueAtTime(900, now + 0.4);
        filter.Q.setValueAtTime(1.5, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.42);
      } else if (soundType === "chime") {
        // Gentle ascending wind chime (C5, E5, G5, C6)
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, now + i * 0.12);
          g.gain.setValueAtTime(0.3, now + i * 0.12);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + i * 0.12);
          osc.stop(now + i * 0.12 + 0.7);
        });
      } else if (soundType === "ding") {
        // Two-tone ascending doorbell
        const osc1 = ctx.createOscillator();
        const g1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(660, now);
        g1.gain.setValueAtTime(0.4, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc1.connect(g1);
        g1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        const osc2 = ctx.createOscillator();
        const g2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(880, now + 0.2);
        g2.gain.setValueAtTime(0.35, now + 0.2);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc2.connect(g2);
        g2.connect(ctx.destination);
        osc2.start(now + 0.2);
        osc2.stop(now + 0.6);
      } else if (soundType === "phone") {
        // Classic telephone ring pattern (two rings)
        for (let r = 0; r < 2; r++) {
          const offset = r * 0.5;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(440, now + offset);
          osc.frequency.setValueAtTime(480, now + offset + 0.15);
          g.gain.setValueAtTime(0.3, now + offset);
          g.gain.setValueAtTime(0.3, now + offset + 0.15);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.3);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.35);
        }
      } else if (soundType === "marimba") {
        // Cheerful descending wooden marimba-like (C6, G5, E5, C5)
        [1046.5, 783.99, 659.25, 523.25].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, now + i * 0.08);
          g.gain.setValueAtTime(0.35, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + i * 0.08);
          osc.stop(now + i * 0.08 + 0.3);
        });
      } else if (soundType === "bells") {
        // Cascade of bell-like tones with harmonics
        [
          [523.25, 0],
          [659.25, 0.15],
          [783.99, 0.3],
          [1046.5, 0.45],
        ].forEach(([freq, t]) => {
          const tNum = t as number;
          const fNum = freq as number;
          [1, 2.5, 4.2].forEach((ratio) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(fNum * ratio, now + tNum);
            g.gain.setValueAtTime(0.06 / ratio, now + tNum);
            g.gain.exponentialRampToValueAtTime(0.001, now + tNum + 0.5);
            const bp = ctx.createBiquadFilter();
            bp.type = "bandpass";
            bp.frequency.setValueAtTime(fNum * ratio, now + tNum);
            bp.Q.setValueAtTime(5, now);
            osc.connect(bp);
            bp.connect(g);
            g.connect(ctx.destination);
            osc.start(now + tNum);
            osc.stop(now + tNum + 0.6);
          });
        });
      } else if (soundType === "alarm") {
        // Urgent repeating alarm (fast beeps)
        for (let i = 0; i < 6; i++) {
          const offset = i * 0.12;
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = "square";
          osc.frequency.setValueAtTime(880, now + offset);
          g.gain.setValueAtTime(0.2, now + offset);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.07);
          osc.connect(g);
          g.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.08);
        }
      } else {
        // Default: short electronic beep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.15);

        gain.gain.setValueAtTime(0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(now + 0.45);
      }
    } catch (e) {
      console.warn("无法播放提示音:", e);
    }
  }

  public playPaperSwipeSound(): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;
      const bufferSize = 0.12 * ctx.sampleRate; // 120ms
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(600, now);
      filter.frequency.exponentialRampToValueAtTime(150, now + 0.12);

      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(0.001, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.03);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      noise.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.12);
    } catch {
      // Ignored
    }
  }

  public playStickSound(): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(1600, now);
      osc1.frequency.exponentialRampToValueAtTime(400, now + 0.03);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.03);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(600, now + 0.03);
      osc2.frequency.exponentialRampToValueAtTime(150, now + 0.08);
      gain2.gain.setValueAtTime(0.25, now + 0.03);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.03);
      osc2.stop(now + 0.08);
    } catch {
      // Ignored
    }
  }

  public playPopSound(): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1300, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {
      // Ignored
    }
  }

  private getScratchBuffer(ctx: AudioContext): AudioBuffer {
    if (this.scratchBuffer) return this.scratchBuffer;
    const sampleRate = ctx.sampleRate;
    const bufferSize = Math.floor(0.09 * sampleRate);
    const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (0.8 + 0.2 * Math.sin(i / 10));
    }
    this.scratchBuffer = buffer;
    return buffer;
  }

  public playPencilScratchSound(): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;
      const buffer = this.getScratchBuffer(ctx);

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2600, now);
      filter.frequency.linearRampToValueAtTime(3200, now + 0.05);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.09);
      filter.Q.setValueAtTime(3.0, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.09);
    } catch {
      // Ignored
    }
  }

  public playStampSound(): void {
    try {
      const ctx = this.init();
      const now = ctx.currentTime;

      // 瞬态清脆触纸声
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = "sine";
      clickOsc.frequency.setValueAtTime(1400, now);
      clickOsc.frequency.exponentialRampToValueAtTime(300, now + 0.02);
      clickGain.gain.setValueAtTime(0.18, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);
      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(now);
      clickOsc.stop(now + 0.025);

      // 木质印章落下的饱满沉稳敲击
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = "triangle";
      thudOsc.frequency.setValueAtTime(160, now);
      thudOsc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
      thudGain.gain.setValueAtTime(0.22, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);
      thudOsc.start(now);
      thudOsc.stop(now + 0.085);
    } catch {
      // Ignored
    }
  }

  /**
   * 专属随机微休息清脆提示音：清风明月三音风铃和弦（A5 -> C#6 -> E6 空灵正弦波长衰减），
   * 通透明亮、温和不刺耳，提醒视线离开屏幕。
   */
  public async playMicroBreakSound(): Promise<void> {
    try {
      const ctx = await this.ensureAudioContext();
      const now = ctx.currentTime;

      // 旋律三音：A5 (880Hz), C#6 (1108.73Hz), E6 (1318.51Hz)
      const notes = [
        { freq: 880.0, time: now, gain: 0.6, dur: 1.4 },
        { freq: 1108.73, time: now + 0.09, gain: 0.55, dur: 1.3 },
        { freq: 1318.51, time: now + 0.18, gain: 0.5, dur: 1.2 },
      ];

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, note.time);

        gain.gain.setValueAtTime(0.001, note.time);
        gain.gain.linearRampToValueAtTime(note.gain, note.time + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + note.dur);

        // 柔和微泛音 (2x 八度) 增加清脆空灵质感
        const harm = ctx.createOscillator();
        const harmGain = ctx.createGain();
        harm.type = "sine";
        harm.frequency.setValueAtTime(note.freq * 2, note.time);
        harmGain.gain.setValueAtTime(0.001, note.time);
        harmGain.gain.linearRampToValueAtTime(note.gain * 0.12, note.time + 0.015);
        harmGain.gain.exponentialRampToValueAtTime(0.001, note.time + note.dur * 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);
        harm.connect(harmGain);
        harmGain.connect(ctx.destination);

        osc.start(note.time);
        osc.stop(note.time + note.dur + 0.05);
        harm.start(note.time);
        harm.stop(note.time + note.dur * 0.6 + 0.05);
      }
    } catch (e) {
      console.warn("无法播放微休息提示音:", e);
    }
  }

  /**
   * 专属随机微休息结束提示音：晨露滑落清脆水滴（1150Hz -> 880Hz 微滑音），
   * 柔和宣告 5 秒休息结束，继续专注。
   */
  public async playMicroBreakEndSound(): Promise<void> {
    try {
      const ctx = await this.ensureAudioContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1150, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.45, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      filter.type = "lowpass";
      filter.frequency.setValueAtTime(2200, now);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {
      console.warn("无法播放微休息结束提示音:", e);
    }
  }

  public close(): void {
    this.stopNoise();
    if (this.fadeTimeoutId) {
      clearTimeout(this.fadeTimeoutId);
      this.fadeTimeoutId = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}

export const audioEngine = new AudioEngine();
