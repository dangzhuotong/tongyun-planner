import { safeJsonParse } from "./json";

/** 自定义外部白噪音：链接解析、列表持久化与悬浮窗位置钳制。 */

export type CustomNoiseKind = "youtube" | "bilibili" | "media";

export interface CustomNoiseLink {
  id: string;
  url: string;
  kind: CustomNoiseKind;
  embedUrl: string;
  title: string;
}

export type CustomNoiseError = "empty" | "invalid" | "unsupported" | "short" | "duplicate";

export type ParseCustomNoiseResult =
  { ok: true; link: Omit<CustomNoiseLink, "id"> } | { ok: false; error: CustomNoiseError };

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

const MEDIA_EXTENSION = /\.(mp3|m4a|wav|ogg|oga|flac|aac|mp4|webm|m3u8)$/i;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtu.be",
  "www.youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);
const BILIBILI_HOSTS = new Set(["bilibili.com", "www.bilibili.com", "m.bilibili.com"]);
const BILIBILI_PLAYER_HOSTS = new Set(["player.bilibili.com"]);
const BILIBILI_SHORT_HOSTS = new Set(["b23.tv", "www.b23.tv"]);

export const CUSTOM_NOISE_LINKS_KEY = "tongyun_custom_noise_links";
export const CUSTOM_NOISE_WINDOW_KEY = "tongyun_custom_noise_window";

function parseUrl(raw: string): URL | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    // 用户常只粘贴 "www.bilibili.com/video/BV..."，补协议再试一次。
    try {
      return new URL(`https://${text}`);
    } catch {
      return null;
    }
  }
}

function parseYouTube(url: URL): ParseCustomNoiseResult | null {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  let id = "";
  if (host === "youtu.be" || host === "www.youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? "";
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v") ?? "";
  } else {
    const segments = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live"].includes(segments[0])) {
      id = segments[1] ?? "";
    }
  }
  if (!YOUTUBE_ID.test(id)) {
    return { ok: false, error: "unsupported" };
  }
  return {
    ok: true,
    link: {
      url: url.toString(),
      kind: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`,
      title: `YouTube · ${id}`,
    },
  };
}

function parseBilibili(url: URL): ParseCustomNoiseResult | null {
  const host = url.hostname.toLowerCase();
  if (BILIBILI_SHORT_HOSTS.has(host)) {
    return { ok: false, error: "short" };
  }
  let bvid = "";
  let aid = "";
  let page: string;
  if (BILIBILI_PLAYER_HOSTS.has(host)) {
    bvid = url.searchParams.get("bvid") ?? "";
    aid = url.searchParams.get("aid") ?? "";
    page = url.searchParams.get("p") ?? "1";
  } else if (BILIBILI_HOSTS.has(host)) {
    const match = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i);
    if (!match) return { ok: false, error: "unsupported" };
    if (/^av/i.test(match[1])) aid = match[1].slice(2);
    else bvid = match[1];
    page = url.searchParams.get("p") ?? "1";
  } else {
    return null;
  }
  if (!bvid && !aid) return { ok: false, error: "unsupported" };
  const params = new URLSearchParams({ autoplay: "1", danmaku: "0", p: page });
  if (bvid) params.set("bvid", bvid);
  else params.set("aid", aid);
  return {
    ok: true,
    link: {
      url: url.toString(),
      kind: "bilibili",
      embedUrl: `https://player.bilibili.com/player.html?${params.toString()}`,
      title: `Bilibili · ${bvid || `av${aid}`}`,
    },
  };
}

function parseDirectMedia(url: URL): ParseCustomNoiseResult | null {
  if (!MEDIA_EXTENSION.test(url.pathname)) return null;
  const filename = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "");
  return {
    ok: true,
    link: {
      url: url.toString(),
      kind: "media",
      embedUrl: url.toString(),
      title: filename || url.hostname,
    },
  };
}

/** 解析用户粘贴的链接；仅接受 B 站、YouTube 与音频/视频直链。 */
export function parseCustomNoiseUrl(raw: string): ParseCustomNoiseResult {
  if (!raw.trim()) return { ok: false, error: "empty" };
  const url = parseUrl(raw);
  if (!url) return { ok: false, error: "invalid" };
  return (
    parseYouTube(url) ??
    parseBilibili(url) ??
    parseDirectMedia(url) ?? { ok: false, error: "unsupported" }
  );
}

function normalizeEmbedCompareUrl(url: string): string {
  return url.replace("https://www.youtube.com/", "https://www.youtube-nocookie.com/");
}

/** 把新链接并入列表；重复链接不新增，返回 duplicate 提示。 */
export function appendCustomNoiseLink(
  links: CustomNoiseLink[],
  raw: string,
  newId: string,
): { links: CustomNoiseLink[]; link?: CustomNoiseLink; error?: CustomNoiseError } {
  const parsed = parseCustomNoiseUrl(raw);
  if (!parsed.ok) return { links, error: parsed.error };
  const targetCompare = normalizeEmbedCompareUrl(parsed.link.embedUrl);
  if (links.some((item) => normalizeEmbedCompareUrl(item.embedUrl) === targetCompare)) {
    return { links, error: "duplicate" };
  }
  const link: CustomNoiseLink = { ...parsed.link, id: newId };
  return { links: [...links, link], link };
}

export function removeCustomNoiseLink(links: CustomNoiseLink[], id: string): CustomNoiseLink[] {
  return links.filter((item) => item.id !== id);
}

/** 位置必须留在视口内；窗口尺寸大于视口时贴左上角，避免整块跑出屏幕。 */
export function clampWindowPosition(
  position: WindowPosition,
  viewport: WindowSize,
  panel: WindowSize,
): WindowPosition {
  const maxX = Math.max(0, viewport.width - panel.width);
  const maxY = Math.max(0, viewport.height - panel.height);
  return {
    x: Math.min(Math.max(0, Math.round(position.x)), maxX),
    y: Math.min(Math.max(0, Math.round(position.y)), maxY),
  };
}

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadCustomNoiseLinks(): CustomNoiseLink[] {
  const storage = getStorage();
  if (!storage) return [];
  const parsed = safeJsonParse<unknown>(storage.getItem(CUSTOM_NOISE_LINKS_KEY), []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (item): item is CustomNoiseLink =>
      !!item &&
      typeof item === "object" &&
      typeof (item as CustomNoiseLink).id === "string" &&
      typeof (item as CustomNoiseLink).url === "string" &&
      typeof (item as CustomNoiseLink).embedUrl === "string" &&
      typeof (item as CustomNoiseLink).title === "string" &&
      ["youtube", "bilibili", "media"].includes((item as CustomNoiseLink).kind),
  );
}

export function saveCustomNoiseLinks(links: CustomNoiseLink[]): void {
  getStorage()?.setItem(CUSTOM_NOISE_LINKS_KEY, JSON.stringify(links));
}

export function loadCustomNoiseWindowPosition(): WindowPosition | null {
  const storage = getStorage();
  if (!storage) return null;
  const parsed = safeJsonParse<Partial<WindowPosition> | null>(
    storage.getItem(CUSTOM_NOISE_WINDOW_KEY),
    null,
  );
  if (!parsed || typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
  if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
  return { x: parsed.x, y: parsed.y };
}

export function saveCustomNoiseWindowPosition(position: WindowPosition): void {
  getStorage()?.setItem(
    CUSTOM_NOISE_WINDOW_KEY,
    JSON.stringify({ x: Math.round(position.x), y: Math.round(position.y) }),
  );
}

export const CUSTOM_NOISE_ACTIVE_ID_KEY = "tongyun_custom_noise_active_id";
export const NOISE_SOURCE_KEY = "tongyun_noise_source";

export type NoiseSourceType = "internal" | "external";

export function loadCustomNoiseActiveId(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const val = storage.getItem(CUSTOM_NOISE_ACTIVE_ID_KEY);
  return typeof val === "string" && val.trim() ? val.trim() : null;
}

export function saveCustomNoiseActiveId(id: string | null): void {
  const storage = getStorage();
  if (!storage) return;
  if (id) {
    storage.setItem(CUSTOM_NOISE_ACTIVE_ID_KEY, id);
  } else {
    storage.removeItem(CUSTOM_NOISE_ACTIVE_ID_KEY);
  }
}

export function loadNoiseSource(): NoiseSourceType {
  const storage = getStorage();
  if (!storage) return "internal";
  const val = storage.getItem(NOISE_SOURCE_KEY);
  return val === "external" ? "external" : "internal";
}

export function saveNoiseSource(source: NoiseSourceType): void {
  getStorage()?.setItem(NOISE_SOURCE_KEY, source);
}
