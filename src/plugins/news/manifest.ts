import type { PluginManifest } from "../host/types";

/** 资讯页今天已经在用的本机键。首版不改名，收藏不用搬迁。 */
export const NEWS_STORAGE_KEYS = [
  "tongyun_news_bookmarks",
  "tongyun_news_history",
  "tongyun_news_font_size",
  "tongyun_news_font_family",
  "tongyun_news_columns",
  "tongyun_rss_feeds",
  "tongyun_explore_feeds",
  "tongyun_cors_proxy",
  "tongyun_recollect_prose",
] as const;

export const NEWS_PLUGIN_ID = "org.tongyun.news";

export const newsManifest: PluginManifest = {
  id: NEWS_PLUGIN_ID,
  name: "朝花夕拾",
  description: "热榜、RSS 与稍后读。停用后入口隐藏，收藏仍留在本机。",
  version: "1.0.0",
  apiVersion: 1,
  defaultEnabled: true,
  permissions: ["storage:read", "storage:write", "tasks:write", "journal:write"],
  storageKeys: [...NEWS_STORAGE_KEYS],
  legacySlots: ["news"],
};
