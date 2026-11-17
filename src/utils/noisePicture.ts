import type { CustomNoiseKind } from "./customNoise";

/** 设置里白噪音勾选的 label 必须自己成为定位包含块。 */
export const VISIBLE_NOISE_LABEL_CLASS =
  "relative flex items-center gap-1.5 flex-grow cursor-pointer select-none";

const DIRECT_PICTURE_EXTENSION = /\.(mp4|webm|m3u8)$/i;

export const CUSTOM_NOISE_PICTURE_HIDDEN_KEY = "tongyun_custom_noise_picture_hidden";

/** 直链里带画面的地址。音频直链没有画面可隐藏。 */
export function isDirectMediaWithPicture(embedUrl: string): boolean {
  const path = embedUrl.split(/[?#]/)[0] ?? "";
  return DIRECT_PICTURE_EXTENSION.test(path);
}

/**
 * 主界面音量滑块只能写到本页的 HTML 媒体元素。
 * YouTube / B 站在独立窗口里，没有公开接口把滑块值送进去。
 */
export function mainSliderReachesPlayback(kind: CustomNoiseKind): boolean {
  return kind === "media";
}

export function clampMediaVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 0;
  return Math.min(1, Math.max(0, volume));
}

export function loadPictureHidden(): boolean {
  try {
    return localStorage.getItem(CUSTOM_NOISE_PICTURE_HIDDEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function savePictureHidden(hidden: boolean): void {
  try {
    localStorage.setItem(CUSTOM_NOISE_PICTURE_HIDDEN_KEY, hidden ? "true" : "false");
  } catch {
    /* 隐私模式等无法写入时，这次会话仍用内存里的开关。 */
  }
}
