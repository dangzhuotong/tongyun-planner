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

export type AutoNoiseToggleAction = "start" | "stop" | "leave";

/**
 * 打开「专注自动白噪音」只记住偏好；正在专注时才立刻播放。
 * 关掉开关要停掉当前白噪音，但这次停止不是用户按了静音。
 */
export function autoNoiseToggleAction(input: {
  enabling: boolean;
  active: boolean;
  isBreak: boolean;
}): AutoNoiseToggleAction {
  if (!input.enabling) return "stop";
  return input.active && !input.isBreak ? "start" : "leave";
}

export type NoiseTarget = "none" | "internal" | "external";

/**
 * 决定自动起噪时应该调用内置合成器还是外部音源。
 * 若用户选择了外部音源且存在已配置链接，优先联动外部；否则回退为内置。
 */
export function resolveAutoNoiseTarget(input: {
  autoNoiseEnabled: boolean;
  active: boolean;
  isBreak: boolean;
  manuallyStopped: boolean;
  noiseSource: "internal" | "external";
  hasCustomNoiseLink: boolean;
}): NoiseTarget {
  if (!shouldAutoStartNoise(input)) return "none";
  if (input.noiseSource === "external" && input.hasCustomNoiseLink) {
    return "external";
  }
  return "internal";
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

/**
 * 播放信号只在「从外面向悬浮窗发起一次新的播放」时加一。
 * 悬浮窗为了记下曲目而回调父级时 echo 为 false；已经在播时再收到同步也不加，
 * 否则渲染里的回调会把信号再次加一，主线程一直重绘，窗口就假死。
 */
export function shouldEmitExternalPlaySignal(input: {
  echo: boolean;
  alreadyPlayingExternal: boolean;
}): boolean {
  return input.echo && !input.alreadyPlayingExternal;
}
