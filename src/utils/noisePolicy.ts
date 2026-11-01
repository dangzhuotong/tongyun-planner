/** Auto-noise may start only during an active focus block, and never after a manual mute. */
export function shouldAutoStartNoise(input: {
  autoNoiseEnabled: boolean;
  active: boolean;
  isBreak: boolean;
  manuallyStopped: boolean;
}): boolean {
  if (!input.autoNoiseEnabled || input.manuallyStopped) return false;
  return input.active && !input.isBreak;
}

/** A manual mute outranks both "was playing" and the auto-noise preference. */
export function shouldResumeNoiseAfterMicroBreak(input: {
  wasPlayingNoise: boolean;
  autoNoiseEnabled: boolean;
  manuallyStopped: boolean;
}): boolean {
  if (input.manuallyStopped) return false;
  return input.wasPlayingNoise || input.autoNoiseEnabled;
}

/**
 * 内置白噪音由停到播即算一次启动，外部音源据此停下。
 * 以播放状态的跃迁作信号，而不是包住某几个按钮调用，番茄钟自动起噪、
 * 阶段续播、微休息恢复、设置试听等非 Sidebar 路径才都能覆盖。
 */
export function nextNoiseStartSignal(input: {
  wasPlaying: boolean;
  isPlaying: boolean;
  signal: number;
}): number {
  return input.isPlaying && !input.wasPlaying ? input.signal + 1 : input.signal;
}
