import React, { useState, useEffect, useCallback } from "react";
import { TrendingUp, RefreshCw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openExternal } from "../../utils/openExternal";
import { PLATFORMS, type TrendingItem } from "./types";
import { parseRSSXML } from "./rssParser";
import { getCachedData, setCachedData, fetchWithRetry } from "../../utils/cache";
import { NewsItemActions } from "./NewsItemActions";
import type { NewsActions } from "./newsActions";

const isTauri =
  typeof window !== "undefined" &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

const MAX_PER_CARD = 8;
const CACHE_TTL = 30 * 60 * 1000;

async function fetchPlatformData(platform: string): Promise<TrendingItem[]> {
  const fetchUrl = async (url: string): Promise<string> => {
    if (isTauri) {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    } catch (e: any) {
      if ((e.message || "").startsWith("HTTP")) throw e;
      const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
      const proxyRes = await fetch(proxy);
      if (!proxyRes.ok) throw new Error(`CORS 拦截，代理也失效了`);
      return proxyRes.text();
    }
  };

  if (platform === "producthunt") {
    const xml = isTauri
      ? await invoke<string>("fetch_rss", { url: "https://www.producthunt.com/feed" })
      : await (async () => {
          const raw = await fetchUrl("https://www.producthunt.com/feed");
          if (raw.trim().startsWith("{")) {
            return JSON.parse(raw).contents;
          }
          return raw;
        })();
    const articles = parseRSSXML(xml);
    return articles.slice(0, MAX_PER_CARD).map((a, i) => ({
      title: a.title, url: a.link, index: i + 1,
    }));
  }

  const raw = await fetchUrl(`https://uapis.cn/api/v1/misc/hotboard?type=${platform}`);
  const json = JSON.parse(raw);
  return (json.list || []).slice(0, MAX_PER_CARD);
}

async function fetchPlatformDataWithRetry(platform: string): Promise<TrendingItem[]> {
  return fetchWithRetry(() => fetchPlatformData(platform), 1, 1500);
}

export const TrendingView: React.FC<{ actions: NewsActions }> = ({ actions }) => {
  const [allTrendingData, setAllTrendingData] = useState<Record<string, TrendingItem[]>>(() => {
    const cached: Record<string, TrendingItem[]> = {};
    for (const p of PLATFORMS) {
      const data = getCachedData<TrendingItem[]>("trending_" + p.key, CACHE_TTL);
      if (data) cached[p.key] = data;
    }
    return cached;
  });
  const [loadingPlatforms, setLoadingPlatforms] = useState<Set<string>>(new Set());
  const [errorPlatforms, setErrorPlatforms] = useState<Record<string, string>>({});

  const fetchAllPlatforms = useCallback(async (force = false) => {
    const platformKeys = PLATFORMS.map((p) => p.key);

    const needsFetch = force
      ? platformKeys
      : platformKeys.filter((key) => !getCachedData<TrendingItem[]>("trending_" + key, CACHE_TTL));

    if (!force && needsFetch.length === 0) return;
    setLoadingPlatforms(new Set(needsFetch));

    const results: { key: string; data: TrendingItem[]; error: string | null }[] = [];

    const CONCURRENCY = 3;
    for (let i = 0; i < needsFetch.length; i += CONCURRENCY) {
      const batch = needsFetch.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (key) => {
          try {
            const data = await fetchPlatformDataWithRetry(key);
            setCachedData("trending_" + key, data);
            return { key, data, error: null };
          } catch (e: any) {
            return { key, data: [] as TrendingItem[], error: e.message || "加载失败" };
          }
        })
      );
      results.push(...batchResults);
    }

    // Merge cached entries that were skipped
    for (const key of platformKeys) {
      if (!results.find((r) => r.key === key)) {
        const cached = getCachedData<TrendingItem[]>("trending_" + key, CACHE_TTL);
        if (cached) results.push({ key, data: cached, error: null });
      }
    }

    const newData: Record<string, TrendingItem[]> = {};
    const newErrors: Record<string, string> = {};
    for (const r of results) {
      newData[r.key] = r.data;
      if (r.error) newErrors[r.key] = r.error;
    }
    setAllTrendingData(newData);
    setErrorPlatforms(newErrors);
    setLoadingPlatforms(new Set());
  }, []);

  const retryPlatform = useCallback((key: string) => {
    setLoadingPlatforms((prev) => new Set(prev).add(key));
    fetchPlatformDataWithRetry(key).then((data) => {
      setCachedData("trending_" + key, data);
      setAllTrendingData((prev) => ({ ...prev, [key]: data }));
      setErrorPlatforms((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }).catch((err: any) => {
      setErrorPlatforms((prev) => ({ ...prev, [key]: err.message || "加载失败" }));
    }).finally(() => {
      setLoadingPlatforms((prev) => { const n = new Set(prev); n.delete(key); return n; });
    });
  }, []);

  useEffect(() => {
    fetchAllPlatforms();
  }, [fetchAllPlatforms]);

  return (
    <div className="flex-grow flex flex-col animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#4D7C5D]" />
          <span className="text-[13px] font-bold text-[#2D323A]">今日热议</span>
          <span className="text-[9px] text-slate-400 font-medium">
            {loadingPlatforms.size > 0 ? `加载中 ${loadingPlatforms.size}/${PLATFORMS.length} ...` : `${PLATFORMS.length} 个平台`}
          </span>
        </div>
        <button
          onClick={() => fetchAllPlatforms(true)}
          disabled={loadingPlatforms.size > 0}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 bg-white/70 hover:bg-white border border-[#EFEBE4] transition-all cursor-pointer"
        >
          <RefreshCw className={"w-3 h-3 " + (loadingPlatforms.size > 0 ? "animate-spin" : "")} />
          全部刷新
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
        {PLATFORMS.map((platform) => {
          const items = allTrendingData[platform.key] || [];
          const isLoading = loadingPlatforms.has(platform.key);
          const error = errorPlatforms[platform.key];

          return (
            <div
              key={platform.key}
              className="bg-white/90 border border-[#EFEBE4] rounded-2xl hover:border-[#C4D7B2] hover:shadow-sm transition-all overflow-hidden flex flex-col"
            >
              {/* Card header */}
              <div className={"flex items-center justify-between px-3.5 py-2.5 border-b border-[#EFEBE4] " + platform.color.split(" ").slice(0, 2).join(" ") + " dark:!bg-[#2D323A]/40 dark:!text-slate-300"}>
                <span className="text-[10px] font-bold tracking-wide">{platform.label}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); retryPlatform(platform.key); }}
                  title="刷新"
                  className="p-0.5 rounded hover:bg-black/5 opacity-50 hover:opacity-100 transition-all cursor-pointer"
                >
                  <RefreshCw className={"w-3 h-3 " + (isLoading ? "animate-spin" : "")} />
                </button>
              </div>

              {/* Card body */}
              <div className="flex-grow px-1 py-1">
                {error ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                    <span className="text-[9px] text-slate-400">{error}</span>
                    <button onClick={() => retryPlatform(platform.key)} className="text-[9px] text-[#8B6E3C] dark:text-[#C4A05E] font-bold hover:underline cursor-pointer">重试</button>
                  </div>
                ) : isLoading ? (
                  <div className="space-y-2 py-3 px-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-3 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" style={{ width: `${60 + Math.random() * 40}%` }} />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                    <span className="text-[9px] font-medium">暂无数据</span>
                  </div>
                ) : (
                   <div className="flex flex-col">
                    {items.map((item, idx) => (
                      <div
                        key={item.url}
                        className="group flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-[#F0F5F1]/60 transition-all"
                      >
                        <span className={"w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-[8px] font-bold mt-[1px] " + (idx < 3 ? "bg-[#4D7C5D] text-white" : "bg-[#F0F5F1] text-[#4D7C5D]")}>
                          {idx + 1}
                        </span>
                        <div className="min-w-0 flex-grow">
                          <button
                            onClick={() => openExternal(item.url)}
                            className="w-full text-left text-[11px] text-slate-700 leading-snug group-hover:text-[#A34E36] transition-colors line-clamp-2 cursor-pointer"
                          >
                            {item.title}
                          </button>
                          <NewsItemActions
                            className="mt-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                            newsRef={{ title: item.title, url: item.url, source: platform.label }}
                            actions={actions}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
