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
